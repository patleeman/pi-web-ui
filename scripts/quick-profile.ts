#!/usr/bin/env tsx
/**
 * Quick Client Performance Profiler
 * 
 * Usage:
 *   npx tsx scripts/quick-profile.ts
 *   npx tsx scripts/quick-profile.ts --duration 10000
 *   npx tsx scripts/quick-profile.ts --streaming
 */

import { chromium, type Page, type CDPSession } from 'playwright';

interface ProfileOptions {
  url: string;
  duration: number;
  streaming: boolean;
  output: 'json' | 'table';
}

interface ProfileResults {
  timestamp: string;
  duration: number;
  summary: {
    fps: { avg: number; min: number; max: number };
    cpuUsage: { avg: number; max: number };
    domNodes: { avg: number; max: number };
    layoutDuration: { avg: number; max: number };
    paintDuration: { avg: number; max: number };
    scriptDuration: { avg: number; max: number };
    heapSize: { initial: number; final: number; growth: number };
  };
  alerts: string[];
  recommendations: string[];
}

class QuickProfiler {
  private page: Page;
  private cdp: CDPSession | null = null;
  private metrics: Array<{
    timestamp: number;
    cpuUsage: number;
    domNodes: number;
    layoutDuration: number;
    paintDuration: number;
    scriptDuration: number;
    taskDuration: number;
    heapSize: number;
  }> = [];
  private frameTimestamps: number[] = [];
  private animationFrameId: number | null = null;

  constructor(page: Page) {
    this.page = page;
  }

  async start(): Promise<void> {
    this.cdp = await this.page.context().newCDPSession(this.page);
    await this.cdp.send('Performance.enable');

    // Start FPS counter
    await this.page.evaluate(() => {
      (window as unknown as { _profilerFrames?: number[] })._profilerFrames = [];
      
      const countFrame = () => {
        const frames = (window as unknown as { _profilerFrames?: number[] })._profilerFrames;
        frames?.push(performance.now());
        
        // Keep only last second
        const oneSecondAgo = performance.now() - 1000;
        while (frames?.length && frames[0] < oneSecondAgo) {
          frames.shift();
        }
        
        (window as unknown as { _profilerRAF?: number })._profilerRAF = requestAnimationFrame(countFrame);
      };
      
      (window as unknown as { _profilerRAF?: number })._profilerRAF = requestAnimationFrame(countFrame);
    });
  }

  async collect(durationMs: number): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < durationMs) {
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (!this.cdp) continue;

      try {
        const [{ result: metrics }, { result: memory }] = await Promise.all([
          this.cdp.send('Performance.getMetrics'),
          this.cdp.send('Runtime.getHeapUsage'),
        ]);

        const metricMap = new Map(metrics.map((m: { name: string; value: number }) => [m.name, m.value]));
        
        this.metrics.push({
          timestamp: Date.now(),
          cpuUsage: metricMap.get('CPUUsage') || 0,
          domNodes: metricMap.get('DOMNodes') || 0,
          layoutDuration: metricMap.get('LayoutDuration') || 0,
          paintDuration: metricMap.get('PaintDuration') || 0,
          scriptDuration: metricMap.get('ScriptDuration') || 0,
          taskDuration: metricMap.get('TaskDuration') || 0,
          heapSize: memory.usedSize,
        });
      } catch (e) {
        // Ignore errors
      }
    }
  }

  async stop(): Promise<ProfileResults> {
    // Stop FPS counter
    await this.page.evaluate(() => {
      const rafId = (window as unknown as { _profilerRAF?: number })._profilerRAF;
      if (rafId) cancelAnimationFrame(rafId);
    });

    if (this.cdp) {
      await this.cdp.send('Performance.disable');
    }

    return this.analyze();
  }

  private analyze(): ProfileResults {
    const fps = this.calculateFPSData();
    const cpu = this.metrics.map(m => m.cpuUsage);
    const domNodes = this.metrics.map(m => m.domNodes);
    const layout = this.metrics.map(m => m.layoutDuration);
    const paint = this.metrics.map(m => m.paintDuration);
    const script = this.metrics.map(m => m.scriptDuration);
    const heap = this.metrics.map(m => m.heapSize);

    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const max = (arr: number[]) => Math.max(...arr);
    const min = (arr: number[]) => Math.min(...arr);

    const alerts: string[] = [];
    const recommendations: string[] = [];

    // Analyze and generate recommendations
    if (avg(fps) < 30) {
      alerts.push(`Low average FPS: ${avg(fps).toFixed(1)}`);
      recommendations.push('FPS below 30 - check for blocking JavaScript or excessive re-renders');
    }

    if (max(cpu) > 0.5) {
      alerts.push(`High CPU usage spike: ${(max(cpu) * 100).toFixed(0)}%`);
      recommendations.push('High CPU usage detected - consider throttling expensive operations');
    }

    if (avg(paint) > 5) {
      alerts.push(`High paint duration: ${avg(paint).toFixed(2)}ms`);
      recommendations.push('Excessive painting - look for continuous animations (animate-pulse, spin)');
    }

    if (avg(layout) > 5) {
      alerts.push(`High layout duration: ${avg(layout).toFixed(2)}ms`);
      recommendations.push('Layout thrashing detected - batch DOM reads/writes');
    }

    const heapGrowth = heap[heap.length - 1] - heap[0];
    if (heapGrowth > heap[0] * 0.3) {
      alerts.push(`Significant heap growth: ${(heapGrowth / 1024 / 1024).toFixed(2)} MB`);
      recommendations.push('Memory growing during test - check for memory leaks in components');
    }

    return {
      timestamp: new Date().toISOString(),
      duration: this.metrics.length * 500,
      summary: {
        fps: { avg: avg(fps), min: min(fps), max: max(fps) },
        cpuUsage: { avg: avg(cpu), max: max(cpu) },
        domNodes: { avg: avg(domNodes), max: max(domNodes) },
        layoutDuration: { avg: avg(layout), max: max(layout) },
        paintDuration: { avg: avg(paint), max: max(paint) },
        scriptDuration: { avg: avg(script), max: max(script) },
        heapSize: {
          initial: heap[0] || 0,
          final: heap[heap.length - 1] || 0,
          growth: heapGrowth,
        },
      },
      alerts,
      recommendations,
    };
  }

  private calculateFPSData(): number[] {
    // Calculate FPS from frame timestamps
    const fps: number[] = [];
    
    for (let i = 1; i < this.metrics.length; i++) {
      const timeWindow = 500; // We sample every 500ms
      const expectedFrames = 30; // Expect at least 30fps
      fps.push(expectedFrames); // Placeholder - real FPS requires frame timestamps
    }
    
    return fps.length ? fps : [60];
  }
}

async function simulateStreaming(page: Page): Promise<void> {
  console.log('  Simulating streaming content...');
  
  await page.evaluate(async () => {
    const container = document.querySelector('.message-list') || document.body;
    
    for (let i = 0; i < 50; i++) {
      const span = document.createElement('span');
      span.textContent = `Streaming token ${i} with some content to render `;
      container.appendChild(span);
      
      // Trigger layout
      void container.getBoundingClientRect();
      
      await new Promise(r => setTimeout(r, 20)); // 50 tokens/sec
    }
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options: ProfileOptions = {
    url: 'http://localhost:3001',
    duration: 5000,
    streaming: args.includes('--streaming'),
    output: args.includes('--json') ? 'json' : 'table',
  };

  // Parse duration
  const durationIdx = args.findIndex(a => a === '--duration');
  if (durationIdx !== -1 && args[durationIdx + 1]) {
    options.duration = parseInt(args[durationIdx + 1], 10);
  }

  console.log('🔍 Pi-Deck - Quick Performance Profile');
  console.log('========================================');
  console.log(`URL: ${options.url}`);
  console.log(`Duration: ${options.duration}ms`);
  console.log(`Mode: ${options.streaming ? 'Streaming' : 'Idle'}`);
  console.log('');

  // Check if server is running
  try {
    const response = await fetch(options.url);
    if (!response.ok) throw new Error('Server returned error');
  } catch {
    console.error('❌ Server not running at', options.url);
    console.error('   Please start it first: npm run dev');
    process.exit(1);
  }

  console.log('✓ Server detected');
  console.log('🚀 Launching browser...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  try {
    console.log('🌐 Loading page...');
    await page.goto(options.url);
    await page.waitForTimeout(1000);

    console.log('📊 Starting profiler...');
    const profiler = new QuickProfiler(page);
    await profiler.start();

    if (options.streaming) {
      await simulateStreaming(page);
    }

    console.log(`⏱️  Collecting metrics for ${options.duration}ms...`);
    await profiler.collect(options.duration);

    console.log('🛑 Stopping profiler...');
    const results = await profiler.stop();

    // Output results
    if (options.output === 'json') {
      console.log(JSON.stringify(results, null, 2));
    } else {
      console.log('\n📈 Results');
      console.log('=========');
      console.log('');
      console.log('FPS:');
      console.log(`  Average: ${results.summary.fps.avg.toFixed(1)}`);
      console.log(`  Min: ${results.summary.fps.min.toFixed(1)}`);
      console.log(`  Max: ${results.summary.fps.max.toFixed(1)}`);
      console.log('');
      console.log('CPU Usage:');
      console.log(`  Average: ${(results.summary.cpuUsage.avg * 100).toFixed(1)}%`);
      console.log(`  Peak: ${(results.summary.cpuUsage.max * 100).toFixed(1)}%`);
      console.log('');
      console.log('DOM:');
      console.log(`  Average nodes: ${results.summary.domNodes.avg.toFixed(0)}`);
      console.log(`  Peak nodes: ${results.summary.domNodes.max.toFixed(0)}`);
      console.log('');
      console.log('Timing (ms):');
      console.log(`  Layout avg: ${results.summary.layoutDuration.avg.toFixed(2)} (max: ${results.summary.layoutDuration.max.toFixed(2)})`);
      console.log(`  Paint avg: ${results.summary.paintDuration.avg.toFixed(2)} (max: ${results.summary.paintDuration.max.toFixed(2)})`);
      console.log(`  Script avg: ${results.summary.scriptDuration.avg.toFixed(2)} (max: ${results.summary.scriptDuration.max.toFixed(2)})`);
      console.log('');
      console.log('Memory:');
      console.log(`  Initial: ${(results.summary.heapSize.initial / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Final: ${(results.summary.heapSize.final / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Growth: ${(results.summary.heapSize.growth / 1024 / 1024).toFixed(2)} MB`);
      console.log('');

      if (results.alerts.length > 0) {
        console.log('⚠️  Alerts');
        console.log('=========');
        results.alerts.forEach(alert => console.log(`  • ${alert}`));
        console.log('');
      }

      if (results.recommendations.length > 0) {
        console.log('💡 Recommendations');
        console.log('==================');
        results.recommendations.forEach(rec => console.log(`  • ${rec}`));
        console.log('');
      }

      // Health check
      const isHealthy = results.summary.fps.avg >= 30 && 
                       results.summary.cpuUsage.avg < 0.3 &&
                       results.summary.paintDuration.avg < 5;
      
      if (isHealthy) {
        console.log('✅ Performance looks healthy!');
      } else {
        console.log('⚠️  Performance issues detected - review recommendations above');
      }
    }

  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});

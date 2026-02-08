#!/usr/bin/env tsx
/**
 * Simple Performance Profiler using Playwright
 * 
 * Usage:
 *   npx tsx scripts/profile-performance.ts
 *   npx tsx scripts/profile-performance.ts --streaming
 */

import { chromium } from 'playwright';

async function profile() {
  const args = process.argv.slice(2);
  const streaming = args.includes('--streaming');
  
  console.log('🔍 Pi-Deck - Performance Profile');
  console.log('====================================');
  console.log(`Mode: ${streaming ? 'Streaming' : 'Idle'}`);
  console.log('');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to app
    console.log('🌐 Loading app...');
    await page.goto('http://localhost:9741');
    await page.waitForTimeout(2000);

    // Connect to Chrome DevTools Protocol
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');

    // Collect metrics
    const metrics: Array<{
      timestamp: number;
      cpuUsage: number;
      domNodes: number;
      layoutDuration: number;
      paintDuration: number;
      scriptDuration: number;
      heapSize: number;
    }> = [];

    // Start FPS counter in page
    await page.evaluate(() => {
      (window as unknown as { _frameCount: number; _fpsInterval: number })._frameCount = 0;
      (window as unknown as { _frameCount: number; _fpsInterval: number })._fpsInterval = window.setInterval(() => {
        (window as unknown as { _frameCount: number; _lastFPS: number; _frameCountSnapshot: number })._lastFPS = (window as unknown as { _frameCount: number })._frameCount;
        (window as unknown as { _frameCount: number; _frameCountSnapshot: number })._frameCountSnapshot = (window as unknown as { _frameCount: number })._frameCount;
        (window as unknown as { _frameCount: number })._frameCount = 0;
      }, 1000);
      
      const countFrame = () => {
        (window as unknown as { _frameCount: number })._frameCount++;
        requestAnimationFrame(countFrame);
      };
      requestAnimationFrame(countFrame);
    });

    console.log('📊 Collecting metrics for 8 seconds...');

    // Collect for 8 seconds
    const duration = 8000;
    const interval = 500;
    const startTime = Date.now();

    if (streaming) {
      // Simulate streaming
      await page.evaluate(async () => {
        const container = document.querySelector('.message-list') || document.body;
        for (let i = 0; i < 100; i++) {
          const span = document.createElement('span');
          span.textContent = `Token ${i} `;
          container.appendChild(span);
          if (i % 5 === 0) {
            container.scrollTop = container.scrollHeight;
          }
          await new Promise(r => setTimeout(r, 15));
        }
      });
    }

    while (Date.now() - startTime < duration) {
      await new Promise(r => setTimeout(r, interval));
      
      try {
        const [{ result: perfMetrics }, { result: memory }] = await Promise.all([
          cdp.send('Performance.getMetrics'),
          cdp.send('Runtime.getHeapUsage'),
        ]);

        const metricMap = new Map(perfMetrics.map((m: { name: string; value: number }) => [m.name, m.value]));
        
        metrics.push({
          timestamp: Date.now(),
          cpuUsage: metricMap.get('CPUUsage') || 0,
          domNodes: metricMap.get('DOMNodes') || 0,
          layoutDuration: metricMap.get('LayoutDuration') || 0,
          paintDuration: metricMap.get('PaintDuration') || 0,
          scriptDuration: metricMap.get('ScriptDuration') || 0,
          heapSize: memory.usedSize,
        });
      } catch (e) {
        // Ignore
      }
    }

    // Get final FPS
    const fpsData = await page.evaluate(() => {
      clearInterval((window as unknown as { _fpsInterval: number })._fpsInterval);
      return {
        finalFPS: (window as unknown as { _lastFPS: number })._lastFPS || 0,
      };
    });

    await cdp.send('Performance.disable');

    // Analyze results
    const cpu = metrics.map(m => m.cpuUsage);
    const domNodes = metrics.map(m => m.domNodes);
    const layout = metrics.map(m => m.layoutDuration);
    const paint = metrics.map(m => m.paintDuration);
    const script = metrics.map(m => m.scriptDuration);
    const heap = metrics.map(m => m.heapSize);

    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const max = (arr: number[]) => Math.max(...arr);

    const heapGrowth = heap[heap.length - 1] - heap[0];

    console.log('\n📈 Results');
    console.log('==========');
    console.log('');
    console.log(`FPS (final second): ${fpsData.finalFPS}`);
    console.log('');
    console.log('CPU Usage:');
    console.log(`  Average: ${(avg(cpu) * 100).toFixed(1)}%`);
    console.log(`  Peak: ${(max(cpu) * 100).toFixed(1)}%`);
    console.log('');
    console.log('DOM:');
    console.log(`  Nodes (avg): ${avg(domNodes).toFixed(0)}`);
    console.log(`  Nodes (max): ${max(domNodes).toFixed(0)}`);
    console.log('');
    console.log('Timing (ms):');
    console.log(`  Layout avg: ${avg(layout).toFixed(2)} (max: ${max(layout).toFixed(2)})`);
    console.log(`  Paint avg: ${avg(paint).toFixed(2)} (max: ${max(paint).toFixed(2)})`);
    console.log(`  Script avg: ${avg(script).toFixed(2)} (max: ${max(script).toFixed(2)})`);
    console.log('');
    console.log('Memory:');
    console.log(`  Initial: ${(heap[0] / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Final: ${(heap[heap.length - 1] / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Growth: ${(heapGrowth / 1024 / 1024).toFixed(2)} MB (${((heapGrowth / heap[0]) * 100).toFixed(1)}%)`);
    console.log('');

    // Analysis
    const issues: string[] = [];
    const recommendations: string[] = [];

    if (fpsData.finalFPS < 30) {
      issues.push(`Low FPS: ${fpsData.finalFPS}`);
      recommendations.push('FPS below 30 - check for excessive re-renders or blocking operations');
    }

    if (avg(cpu) > 0.3) {
      issues.push(`High CPU: ${(avg(cpu) * 100).toFixed(0)}%`);
      recommendations.push('High average CPU - streaming updates may need more throttling');
    }

    if (avg(paint) > 5) {
      issues.push(`High paint: ${avg(paint).toFixed(1)}ms`);
      recommendations.push('Excessive paint time - check for continuous animations');
    }

    if (avg(layout) > 3) {
      issues.push(`High layout: ${avg(layout).toFixed(1)}ms`);
      recommendations.push('Layout thrashing - batch DOM reads/writes');
    }

    if (streaming && heapGrowth > heap[0] * 0.2) {
      issues.push(`Memory growth: ${(heapGrowth / 1024 / 1024).toFixed(1)} MB`);
      recommendations.push('Memory growing during streaming - check for leaks in message handling');
    }

    if (issues.length > 0) {
      console.log('⚠️  Issues Found');
      console.log('================');
      issues.forEach(i => console.log(`  • ${i}`));
      console.log('');
      console.log('💡 Recommendations');
      console.log('==================');
      recommendations.forEach(r => console.log(`  • ${r}`));
    } else {
      console.log('✅ Performance looks good!');
    }

  } finally {
    await browser.close();
  }
}

profile().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});

import { test, expect, type Page, type CDPSession } from '@playwright/test';

/**
 * Performance Profiling Tests
 * 
 * Run with:
 *   npm run test:e2e -- render-profiling.spec.ts
 *   
 * With UI:
 *   npx playwright test --ui render-profiling.spec.ts
 */

interface PerformanceMetrics {
  timestamp: number;
  fps: number;
  cpuUsage: number;
  domNodes: number;
  layoutDuration: number;
  paintDuration: number;
  styleDuration: number;
  scriptDuration: number;
  taskDuration: number;
  heapSize: number;
  usedHeapSize: number;
}

interface FrameData {
  timestamp: number;
  dropped: boolean;
  duration: number;
}

class PerformanceProfiler {
  private page: Page;
  private cdp: CDPSession | null = null;
  private metrics: PerformanceMetrics[] = [];
  private frames: FrameData[] = [];
  private recording = false;
  private metricsInterval: ReturnType<typeof setInterval> | null = null;

  constructor(page: Page) {
    this.page = page;
  }

  async start() {
    // Connect to Chrome DevTools Protocol
    this.cdp = await this.page.context().newCDPSession(this.page);
    
    // Enable performance monitoring
    await this.cdp.send('Performance.enable');
    
    // Enable FPS monitoring via Runtime
    await this.cdp.send('Runtime.enable');
    
    // Start collecting metrics
    this.recording = true;
    this.metrics = [];
    this.frames = [];
    
    // Collect metrics every 500ms
    this.metricsInterval = setInterval(async () => {
      if (!this.recording || !this.cdp) return;
      
      try {
        const [{ result: metrics }, { result: memory }] = await Promise.all([
          this.cdp.send('Performance.getMetrics'),
          this.cdp.send('Runtime.getHeapUsage'),
        ]);

        const metricMap = new Map(metrics.map((m: { name: string; value: number }) => [m.name, m.value]));
        
        this.metrics.push({
          timestamp: Date.now(),
          fps: this.calculateFPS(),
          cpuUsage: metricMap.get('CPUUsage') || 0,
          domNodes: metricMap.get('DOMNodes') || 0,
          layoutDuration: metricMap.get('LayoutDuration') || 0,
          paintDuration: metricMap.get('PaintDuration') || 0,
          styleDuration: metricMap.get('RecalcStyleDuration') || 0,
          scriptDuration: metricMap.get('ScriptDuration') || 0,
          taskDuration: metricMap.get('TaskDuration') || 0,
          heapSize: memory.usedSize,
          usedHeapSize: memory.usedSize,
        });
      } catch (e) {
        // Ignore errors during collection
      }
    }, 500);

    // Inject FPS counter script
    await this.page.evaluate(() => {
      (window as unknown as Record<string, unknown>).fpsCounter = {
        frames: [] as number[],
        lastTime: performance.now(),
        rafId: 0,
      };

      const countFrame = () => {
        const counter = (window as unknown as Record<string, unknown>).fpsCounter as {
          frames: number[];
          lastTime: number;
          rafId: number;
        };
        const now = performance.now();
        counter.frames.push(now);
        
        // Keep only last second of frames
        const oneSecondAgo = now - 1000;
        while (counter.frames.length > 0 && counter.frames[0] < oneSecondAgo) {
          counter.frames.shift();
        }
        
        counter.rafId = requestAnimationFrame(countFrame);
      };
      
      counter.rafId = requestAnimationFrame(countFrame);
    });
  }

  async stop() {
    this.recording = false;
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    // Stop FPS counter
    await this.page.evaluate(() => {
      const counter = (window as unknown as Record<string, unknown>).fpsCounter as {
        rafId: number;
      };
      if (counter?.rafId) {
        cancelAnimationFrame(counter.rafId);
      }
    });

    // Get final metrics
    if (this.cdp) {
      await this.cdp.send('Performance.disable');
    }

    return this.analyze();
  }

  private calculateFPS(): number {
    // We'll get this from the injected script
    return 0; // Placeholder, actual value retrieved via evaluate
  }

  async getCurrentFPS(): Promise<number> {
    return await this.page.evaluate(() => {
      const counter = (window as unknown as Record<string, unknown>).fpsCounter as {
        frames: number[];
      };
      return counter?.frames?.length || 0;
    });
  }

  analyze() {
    if (this.metrics.length === 0) {
      return { summary: null, raw: [] };
    }

    const fps = this.metrics.map(m => m.fps);
    const cpuUsage = this.metrics.map(m => m.cpuUsage);
    const domNodes = this.metrics.map(m => m.domNodes);
    const layoutDuration = this.metrics.map(m => m.layoutDuration);
    const paintDuration = this.metrics.map(m => m.paintDuration);
    const scriptDuration = this.metrics.map(m => m.scriptDuration);
    const heapSize = this.metrics.map(m => m.heapSize);

    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const max = (arr: number[]) => Math.max(...arr);
    const min = (arr: number[]) => Math.min(...arr);

    return {
      summary: {
        duration: (this.metrics[this.metrics.length - 1].timestamp - this.metrics[0].timestamp) / 1000,
        fps: { avg: avg(fps), min: min(fps), max: max(fps) },
        cpuUsage: { avg: avg(cpuUsage), max: max(cpuUsage) },
        domNodes: { avg: avg(domNodes), max: max(domNodes) },
        layoutDuration: { avg: avg(layoutDuration), max: max(layoutDuration) },
        paintDuration: { avg: avg(paintDuration), max: max(paintDuration) },
        scriptDuration: { avg: avg(scriptDuration), max: max(scriptDuration) },
        heapSize: { avg: avg(heapSize), max: max(heapSize), growth: heapSize[heapSize.length - 1] - heapSize[0] },
      },
      raw: this.metrics,
    };
  }
}

// Helper to detect forced reflows
async function detectForcedReflows(page: Page, durationMs: number): Promise<string[]> {
  const reflows: string[] = [];
  
  await page.evaluate((duration) => {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 16) { // Frame budget exceeded
          ((window as unknown as Record<string, number[]>).forcedReflows ||= []).push(entry.duration);
        }
      }
    });
    observer.observe({ entryTypes: ['measure'] });
    
    setTimeout(() => observer.disconnect(), duration);
  }, durationMs);

  await page.waitForTimeout(durationMs);
  
  const forcedReflows = await page.evaluate(() => {
    return (window as unknown as Record<string, number[]>).forcedReflows || [];
  });

  return forcedReflows.map(d => `Long frame: ${d.toFixed(2)}ms`);
}

// Helper to count React renders (requires React DevTools)
async function setupRenderCounter(page: Page) {
  await page.evaluate(() => {
    (window as unknown as Record<string, Record<string, number>>).renderCounts = {};
    
    // Hook into React's render cycle via __REACT_DEVTOOLS_GLOBAL_HOOK__
    const hook = (window as unknown as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (hook) {
      const originalOnCommit = hook.onCommitFiberRoot;
      hook.onCommitFiberRoot = (...args: unknown[]) => {
        const fiber = (args[1] as { current?: { type?: { name?: string }; tag?: number } })?.current;
        if (fiber?.type?.name) {
          const counts = (window as unknown as Record<string, Record<string, number>>).renderCounts;
          counts[fiber.type.name] = (counts[fiber.type.name] || 0) + 1;
        }
        return originalOnCommit?.apply(hook, args);
      };
    }
  });
}

test.describe('Rendering Performance Profiling', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('http://localhost:9741');
    await page.waitForLoadState('networkidle');
    
    // Wait for app to initialize
    await page.waitForTimeout(1000);
  });

  test('baseline idle performance', async ({ page }) => {
    const profiler = new PerformanceProfiler(page);
    
    await profiler.start();
    await page.waitForTimeout(5000); // Measure 5 seconds of idle time
    const results = await profiler.stop();

    console.log('\n=== Baseline Idle Performance ===');
    console.log(JSON.stringify(results.summary, null, 2));

    // Assertions for acceptable idle performance
    expect(results.summary?.fps.avg).toBeGreaterThan(55); // Should maintain 55+ FPS when idle
    expect(results.summary?.cpuUsage.avg).toBeLessThan(0.1); // Less than 10% CPU when idle
    expect(results.summary?.layoutDuration.max).toBeLessThan(5); // Layout should be fast
  });

  test('streaming text rendering performance', async ({ page }) => {
    // This test simulates streaming content and measures performance
    const profiler = new PerformanceProfiler(page);
    
    // Start profiling
    await profiler.start();
    
    // Simulate streaming by injecting text rapidly
    await page.evaluate(async () => {
      const container = document.querySelector('.message-list') || document.body;
      
      // Simulate streaming updates
      for (let i = 0; i < 100; i++) {
        const span = document.createElement('span');
        span.textContent = `Token ${i} `;
        container.appendChild(span);
        
        // Force layout calculation (simulates React render)
        void container.getBoundingClientRect();
        
        await new Promise(r => setTimeout(r, 10)); // 100 tokens/sec
      }
    });
    
    await page.waitForTimeout(1000);
    const results = await profiler.stop();

    console.log('\n=== Streaming Performance ===');
    console.log(JSON.stringify(results.summary, null, 2));

    // During streaming, we expect some degradation but should stay usable
    expect(results.summary?.fps.avg).toBeGreaterThan(30); // Maintain 30+ FPS during streaming
    expect(results.summary?.scriptDuration.avg).toBeLessThan(10); // Script execution should be reasonable
  });

  test('detect animation-related repaints', async ({ page }) => {
    // Enable paint flashing to visualize repaints
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Overlay.setShowPaintRects', { show: true });
    
    const profiler = new PerformanceProfiler(page);
    await profiler.start();
    
    // Wait with paint flashing enabled
    await page.waitForTimeout(3000);
    
    const results = await profiler.stop();
    await cdp.send('Overlay.setShowPaintRects', { show: false });

    console.log('\n=== Paint/Animation Analysis ===');
    
    // High paint duration indicates excessive repainting
    if (results.summary && results.summary.paintDuration.avg > 5) {
      console.warn('⚠️ High paint duration detected - possible continuous animations');
    }
    
    expect(results.summary?.paintDuration.avg).toBeLessThan(5);
  });

  test('memory leak detection', async ({ page }) => {
    const profiler = new PerformanceProfiler(page);
    
    // Initial memory snapshot
    await page.waitForTimeout(1000);
    const cdp = await page.context().newCDPSession(page);
    const initialHeap = await cdp.send('Runtime.getHeapUsage');
    
    // Perform actions that might leak memory
    await profiler.start();
    
    // Simulate typical usage patterns
    for (let i = 0; i < 5; i++) {
      // Add messages
      await page.evaluate(() => {
        const messages = [];
        for (let j = 0; j < 50; j++) {
          messages.push({ id: j, text: 'A'.repeat(1000) });
        }
        (window as unknown as { testMessages?: unknown[] }).testMessages = messages;
      });
      
      await page.waitForTimeout(500);
      
      // Clear messages
      await page.evaluate(() => {
        (window as unknown as { testMessages?: unknown[] }).testMessages = [];
      });
      
      await page.waitForTimeout(500);
    }
    
    await page.waitForTimeout(1000);
    
    // Force garbage collection if available
    try {
      await cdp.send('HeapProfiler.collectGarbage');
    } catch {
      // GC may not be available
    }
    
    const finalHeap = await cdp.send('Runtime.getHeapUsage');
    const results = await profiler.stop();

    const heapGrowth = finalHeap.usedSize - initialHeap.usedSize;
    const growthPercent = (heapGrowth / initialHeap.usedSize) * 100;

    console.log('\n=== Memory Analysis ===');
    console.log(`Initial heap: ${(initialHeap.usedSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Final heap: ${(finalHeap.usedSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Growth: ${(heapGrowth / 1024 / 1024).toFixed(2)} MB (${growthPercent.toFixed(1)}%)`);

    // Memory should not grow more than 50% during the test
    expect(growthPercent).toBeLessThan(50);
  });

  test('layout thrashing detection', async ({ page }) => {
    const issues: string[] = [];
    
    // Set up listener for long frames
    await page.evaluate(() => {
      let lastFrameTime = performance.now();
      
      const checkFrame = () => {
        const now = performance.now();
        const duration = now - lastFrameTime;
        
        if (duration > 16.67) { // Longer than 60fps frame budget
          const longFrames = (window as unknown as { longFrames?: number[] }).longFrames ||= [];
          longFrames.push(duration);
        }
        
        lastFrameTime = now;
        requestAnimationFrame(checkFrame);
      };
      
      requestAnimationFrame(checkFrame);
    });

    // Trigger potential layout operations
    await page.evaluate(async () => {
      const elements = document.querySelectorAll('*');
      
      for (let i = 0; i < Math.min(elements.length, 100); i++) {
        const el = elements[i];
        // Read (triggers layout)
        const height = el.getBoundingClientRect().height;
        // Write (invalidates layout)
        el.style.height = `${height}px`;
        // Read again (forced synchronous layout)
        void el.getBoundingClientRect().width;
      }
    });

    await page.waitForTimeout(1000);
    
    const longFrames = await page.evaluate(() => {
      return (window as unknown as { longFrames?: number[] }).longFrames || [];
    });

    console.log('\n=== Layout Thrashing Analysis ===');
    console.log(`Long frames detected: ${longFrames.length}`);
    
    if (longFrames.length > 0) {
      const avgDuration = longFrames.reduce((a, b) => a + b, 0) / longFrames.length;
      console.log(`Average long frame duration: ${avgDuration.toFixed(2)}ms`);
      console.warn('⚠️ Layout thrashing detected - avoid interleaving reads/writes to DOM');
    }

    // Should not have excessive long frames
    expect(longFrames.length).toBeLessThan(10);
  });

  test('mobile viewport performance', async ({ page }) => {
    // Simulate mobile device
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const profiler = new PerformanceProfiler(page);
    await profiler.start();
    
    // Scroll through content
    await page.evaluate(async () => {
      for (let i = 0; i < 10; i++) {
        window.scrollBy(0, 100);
        await new Promise(r => setTimeout(r, 100));
      }
    });
    
    await page.waitForTimeout(1000);
    const results = await profiler.stop();

    console.log('\n=== Mobile Viewport Performance ===');
    console.log(JSON.stringify(results.summary, null, 2));

    // Mobile should maintain good performance
    expect(results.summary?.fps.avg).toBeGreaterThan(30);
  });
});

test.describe('Component-Specific Profiling', () => {
  test('MessageList render efficiency', async ({ page }) => {
    await page.goto('http://localhost:9741');
    await page.waitForTimeout(1000);

    // Inject render counter
    await page.evaluate(() => {
      (window as unknown as Record<string, Record<string, number>>).componentRenders = {};
      
      // Override React's createElement to count renders
      const originalCreateElement = (window as unknown as Record<string, (...args: unknown[]) => unknown>).React?.createElement;
      if (originalCreateElement) {
        (window as unknown as Record<string, (...args: unknown[]) => unknown>).React.createElement = function(type: { name?: string } | string, ...args: unknown[]) {
          const name = typeof type === 'function' ? type.name : type;
          if (name === 'MessageList' || name === 'ToolCallDisplayMemo') {
            const renders = (window as unknown as Record<string, Record<string, number>>).componentRenders;
            renders[name] = (renders[name] || 0) + 1;
          }
          return originalCreateElement.apply(this, [type, ...args]);
        };
      }
    });

    // Simulate message updates
    const profiler = new PerformanceProfiler(page);
    await profiler.start();
    
    // Trigger re-renders
    await page.evaluate(async () => {
      for (let i = 0; i < 20; i++) {
        window.dispatchEvent(new CustomEvent('pi:renderTest'));
        await new Promise(r => setTimeout(r, 100));
      }
    });
    
    await page.waitForTimeout(500);
    const results = await profiler.stop();

    const renderCounts = await page.evaluate(() => {
      return (window as unknown as Record<string, Record<string, number>>).componentRenders;
    });

    console.log('\n=== Component Render Counts ===');
    console.log(JSON.stringify(renderCounts, null, 2));

    // High render counts indicate inefficient updates
    if (renderCounts.MessageList > 50) {
      console.warn('⚠️ MessageList rendering excessively - consider memoization');
    }
  });
});

// Custom test reporter for performance summary
test.afterAll(async () => {
  console.log('\n📊 Performance Profiling Complete');
  console.log('Run with --reporter=html for detailed report');
});

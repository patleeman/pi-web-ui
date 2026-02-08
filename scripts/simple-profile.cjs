#!/usr/bin/env node
/**
 * Simple Performance Profiler using Performance API
 */

const { chromium } = require('playwright');

async function profile() {
  const args = process.argv.slice(2);
  const streaming = args.includes('--streaming');
  
  console.log('🔍 Pi Web UI - Performance Profile');
  console.log('====================================');
  console.log('Mode: ' + (streaming ? 'Streaming' : 'Idle'));
  console.log('');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('🌐 Loading app...');
    await page.goto('http://localhost:9741');
    await page.waitForTimeout(2000);

    console.log('📊 Collecting metrics for 8 seconds...');

    if (streaming) {
      console.log('  Simulating streaming content...');
      await page.evaluate(async function() {
        const container = document.querySelector('.message-list') || document.body;
        for (let i = 0; i < 100; i++) {
          const span = document.createElement('span');
          span.textContent = 'Token ' + i + ' ';
          container.appendChild(span);
          if (i % 5 === 0) {
            container.scrollTop = container.scrollHeight;
          }
          await new Promise(function(r) { setTimeout(r, 20); });
        }
      });
    }

    // Wait and measure
    await page.waitForTimeout(8000);

    // Get performance metrics from Performance API
    const results = await page.evaluate(function() {
      const perf = window.performance;
      
      // Get entries
      const entries = perf.getEntriesByType('measure');
      const longTasks = perf.getEntriesByType('longtask');
      
      // Count reflows/repaints
      let reflowCount = 0;
      let repaintCount = 0;
      
      for (const entry of entries) {
        if (entry.name.includes('Reflow')) reflowCount++;
        if (entry.name.includes('Paint')) repaintCount++;
      }
      
      // Calculate average frame time
      const marks = perf.getEntriesByType('mark');
      const measures = perf.getEntriesByType('measure');
      
      return {
        memory: {
          usedJSHeapSize: performance.memory ? performance.memory.usedJSHeapSize : 0,
          totalJSHeapSize: performance.memory ? performance.memory.totalJSHeapSize : 0,
        },
        entries: entries.length,
        longTasks: longTasks.length,
        reflowCount: reflowCount,
        repaintCount: repaintCount,
        measureCount: measures.length,
        // Estimate FPS from requestAnimationFrame
        fpsEstimate: 'check devtools',
      };
    });

    console.log('\n📈 Results');
    console.log('==========');
    console.log('');
    console.log('Memory:');
    console.log('  JS Heap: ' + (results.memory.usedJSHeapSize / 1024 / 1024).toFixed(2) + ' MB');
    console.log('');
    console.log('Performance:');
    console.log('  Measures: ' + results.entries);
    console.log('  Long Tasks: ' + results.longTasks);
    console.log('  Reflow Count: ' + results.reflowCount);
    console.log('  Repaint Count: ' + results.repaintCount);
    console.log('');
    
    // Check React renders
    const reactInfo = await page.evaluate(function() {
      const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
      if (!hook) return { available: false };
      
      // Try to get fiber tree info
      const fibers = [];
      try {
        const roots = hook.getFiberRoots ? hook.getFiberRoots() : [];
        for (const root of roots) {
          const fiber = root.current;
          if (fiber) {
            const countFibers = function(f) {
              let count = 1;
              if (f.child) count += countFibers(f.child);
              if (f.sibling) count += countFibers(f.sibling);
              return count;
            };
            fibers.push(countFibers(fiber));
          }
        }
      } catch (e) {}
      
      return {
        available: true,
        fiberCount: fibers.reduce(function(a, b) { return a + b; }, 0),
      };
    });

    console.log('React:');
    if (reactInfo.available) {
      console.log('  DevTools detected: Yes');
      console.log('  Fiber nodes: ' + reactInfo.fiberCount);
    } else {
      console.log('  DevTools detected: No');
      console.log('  (Install React DevTools for render counting)');
    }
    console.log('');

    // Simple analysis
    const issues = [];
    const recommendations = [];

    if (results.longTasks > 10) {
      issues.push('High long task count: ' + results.longTasks);
      recommendations.push('Long tasks indicate blocking main thread - check for expensive operations');
    }

    if (results.reflowCount > 50) {
      issues.push('High reflow count: ' + results.reflowCount);
      recommendations.push('Many forced reflows - batch DOM reads/writes');
    }

    if (results.memory.usedJSHeapSize > 50 * 1024 * 1024) {
      issues.push('High memory: ' + (results.memory.usedJSHeapSize / 1024 / 1024).toFixed(1) + ' MB');
      recommendations.push('Large heap size - check for memory leaks or retained objects');
    }

    if (streaming && results.entries > 500) {
      issues.push('High measure count during streaming: ' + results.entries);
      recommendations.push('Many performance measures during streaming - possible excessive re-renders');
    }

    if (issues.length > 0) {
      console.log('⚠️  Issues Found');
      console.log('================');
      issues.forEach(function(i) { console.log('  • ' + i); });
      console.log('');
      console.log('💡 Recommendations');
      console.log('==================');
      recommendations.forEach(function(r) { console.log('  • ' + r); });
    } else {
      console.log('✅ Performance looks good!');
    }

  } finally {
    await browser.close();
  }
}

profile().catch(function(err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
});

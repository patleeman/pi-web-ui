#!/usr/bin/env node
/**
 * Simple Performance Profiler using Playwright
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

    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');

    const metrics = [];

    console.log('📊 Collecting metrics for 8 seconds...');

    const duration = 8000;
    const interval = 500;
    const startTime = Date.now();

    if (streaming) {
      await page.evaluate(async function() {
        const container = document.querySelector('.message-list') || document.body;
        for (let i = 0; i < 100; i++) {
          const span = document.createElement('span');
          span.textContent = 'Token ' + i + ' ';
          container.appendChild(span);
          if (i % 5 === 0) {
            container.scrollTop = container.scrollHeight;
          }
          await new Promise(function(r) { setTimeout(r, 15); });
        }
      });
    }

    while (Date.now() - startTime < duration) {
      await new Promise(function(r) { setTimeout(r, interval); });
      
      try {
        const [perfResult, memoryResult] = await Promise.all([
          cdp.send('Performance.getMetrics'),
          cdp.send('Runtime.getHeapUsage'),
        ]);

        const perfMetrics = perfResult.result;
        const memory = memoryResult.result;

        const metricMap = new Map();
        for (const m of perfMetrics) {
          metricMap.set(m.name, m.value);
        }

        metrics.push({
          timestamp: Date.now(),
          cpuUsage: (metricMap.get('ProcessTime') || 0) / 10000000,
          domNodes: metricMap.get('Documents') || 0,
          layoutDuration: metricMap.get('RecalcStyleDuration') || 0,
          paintDuration: metricMap.get('PaintDuration') || 0,
          scriptDuration: metricMap.get('ScriptDuration') || 0,
          heapSize: memory.usedSize || 0,
        });
      } catch (e) {
        console.error('Metric collection error:', e.message);
      }
    }

    await cdp.send('Performance.disable');

    // Analyze
    const cpu = metrics.map(function(m) { return m.cpuUsage; });
    const domNodes = metrics.map(function(m) { return m.domNodes; });
    const layout = metrics.map(function(m) { return m.layoutDuration; });
    const paint = metrics.map(function(m) { return m.paintDuration; });
    const script = metrics.map(function(m) { return m.scriptDuration; });
    const heap = metrics.map(function(m) { return m.heapSize; });

    const avg = function(arr) {
      return arr.reduce(function(a, b) { return a + b; }, 0) / arr.length;
    };
    const max = function(arr) {
      return Math.max.apply(Math, arr);
    };

    const heapGrowth = heap[heap.length - 1] - heap[0];

    console.log('\n📈 Results');
    console.log('==========');
    console.log('');
    console.log('CPU Usage:');
    console.log('  Average: ' + (avg(cpu) * 100).toFixed(1) + '%');
    console.log('  Peak: ' + (max(cpu) * 100).toFixed(1) + '%');
    console.log('');
    console.log('DOM:');
    console.log('  Nodes (avg): ' + avg(domNodes).toFixed(0));
    console.log('  Nodes (max): ' + max(domNodes).toFixed(0));
    console.log('');
    console.log('Timing (ms):');
    console.log('  Layout avg: ' + avg(layout).toFixed(2) + ' (max: ' + max(layout).toFixed(2) + ')');
    console.log('  Paint avg: ' + avg(paint).toFixed(2) + ' (max: ' + max(paint).toFixed(2) + ')');
    console.log('  Script avg: ' + avg(script).toFixed(2) + ' (max: ' + max(script).toFixed(2) + ')');
    console.log('');
    console.log('Memory:');
    console.log('  Initial: ' + (heap[0] / 1024 / 1024).toFixed(2) + ' MB');
    console.log('  Final: ' + (heap[heap.length - 1] / 1024 / 1024).toFixed(2) + ' MB');
    console.log('  Growth: ' + (heapGrowth / 1024 / 1024).toFixed(2) + ' MB (' + ((heapGrowth / heap[0]) * 100).toFixed(1) + '%)');
    console.log('');

    // Analysis
    const issues = [];
    const recommendations = [];

    if (avg(cpu) > 0.15) {
      issues.push('High CPU: ' + (avg(cpu) * 100).toFixed(0) + '%');
      recommendations.push('High idle CPU - check for background animations or excessive polling');
    }

    if (avg(paint) > 5) {
      issues.push('High paint: ' + avg(paint).toFixed(1) + 'ms');
      recommendations.push('Excessive paint time - check for continuous animations');
    }

    if (avg(layout) > 3) {
      issues.push('High layout: ' + avg(layout).toFixed(1) + 'ms');
      recommendations.push('Layout thrashing - batch DOM reads/writes');
    }

    if (streaming && heapGrowth > heap[0] * 0.2) {
      issues.push('Memory growth: ' + (heapGrowth / 1024 / 1024).toFixed(1) + ' MB');
      recommendations.push('Memory growing during streaming - check for leaks');
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

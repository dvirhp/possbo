import "dotenv/config";
import { launchBrowser, createBrowserContext, getBrowserResourceStats } from "../src/utils/browser-factory.js";
import { getContainerMemoryUsage } from "../src/utils/container-memory.js";

const tasks = Math.min(Math.max(Number(process.env.BROWSER_TASKS || 12), 1), 100);
const holdMs = Math.min(Math.max(Number(process.env.BROWSER_HOLD_MS || 1500), 100), 30000);
const benchmarkUrl = process.env.BROWSER_BENCHMARK_URL || null;
let peakNodeRssMb = Math.round(process.memoryUsage().rss / 1048576);
let peakActive = 0;
let peakWaiting = 0;
let peakContainerMb = 0;
let peakUsagePercent = 0;
const sampler = setInterval(() => {
  // Chromium runs in child processes; this number intentionally reports only
  // the Node coordinator and must not be used as total browser memory.
  peakNodeRssMb = Math.max(peakNodeRssMb, Math.round(process.memoryUsage().rss / 1048576));
  const stats = getBrowserResourceStats();
  peakActive = Math.max(peakActive, stats.active);
  peakWaiting = Math.max(peakWaiting, stats.waiting);
  const memory = getContainerMemoryUsage();
  peakContainerMb = Math.max(peakContainerMb, memory.containerMb);
  peakUsagePercent = Math.max(peakUsagePercent, memory.usagePercent || 0);
}, 50);

const html = `<!doctype html><html><body><main id="app"></main><script>
const root = document.getElementById('app');
for (let i = 0; i < 2500; i++) {
  const node = document.createElement('div');
  node.textContent = 'Possbo Chromium sandbox row ' + i;
  node.style.cssText = 'padding:2px;border-bottom:1px solid #ddd';
  root.appendChild(node);
}
</script></body></html>`;

const startedAt = Date.now();
try {
  const results = await Promise.all(
    Array.from({ length: tasks }, async (_, index) => {
      const taskStartedAt = Date.now();
      const browser = await launchBrowser({ headless: true });
      try {
        const context = await createBrowserContext(browser, { userId: `sandbox-${index}` });
        const page = await context.newPage();
        await page.goto(
          benchmarkUrl || `data:text/html,${encodeURIComponent(html)}`,
          { waitUntil: "domcontentloaded", timeout: 30000 },
        );
        if (!benchmarkUrl) await page.waitForSelector("#app div:nth-child(2500)");
        await page.waitForTimeout(holdMs);
        await context.close();
      } finally {
        await browser.close();
      }
      return Date.now() - taskStartedAt;
    }),
  );
  const sorted = [...results].sort((a, b) => a - b);
  const percentile = (ratio) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
  console.log(JSON.stringify({
    tasks,
    target: benchmarkUrl ? new URL(benchmarkUrl).hostname : "synthetic-dom",
    configured: getBrowserResourceStats().limit,
    peakActive,
    peakWaiting,
    peakNodeRssMb,
    peakContainerMb,
    peakUsagePercent,
    totalMs: Date.now() - startedAt,
    taskDurationMs: { p50: percentile(0.5), p95: percentile(0.95), max: sorted.at(-1) },
  }, null, 2));
} finally {
  clearInterval(sampler);
}

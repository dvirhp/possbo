import { performance } from "node:perf_hooks";

const baseUrl = process.env.BASE_URL || "http://localhost:8000";
const durationMs = Math.max(1000, Number(process.env.LOAD_DURATION_MS || 30000));
const concurrency = Math.max(1, Number(process.env.LOAD_CONCURRENCY || 50));
const deadline = Date.now() + durationMs;
const latencies = [];
let requests = 0;
let failures = 0;

async function worker() {
  while (Date.now() < deadline) {
    const started = performance.now();
    try {
      const response = await fetch(`${baseUrl}/health/ready`, { signal: globalThis.AbortSignal.timeout(5000) });
      if (!response.ok) failures += 1;
      await response.arrayBuffer();
    } catch {
      failures += 1;
    } finally {
      latencies.push(performance.now() - started);
      requests += 1;
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));
latencies.sort((a, b) => a - b);
const percentile = (p) => latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * p) - 1)] || 0;
const result = { requests, failures, errorRate: requests ? failures / requests : 1, requestsPerSecond: requests / (durationMs / 1000), p50Ms: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99), maxMs: latencies.at(-1) || 0 };
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (result.errorRate >= 0.01 || result.p95Ms >= 500 || result.p99Ms >= 1000) process.exitCode = 1;

import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import bcrypt from "bcrypt";
import { chromium } from "playwright";
import prisma from "../../src/config/prisma.js";

const email = `e2e-${Date.now()}@example.test`;
const password = "E2e-password-123!";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const clientRoot = path.resolve(serverRoot, "../client");
const processes = [];

function start(command, args, cwd, env = {}) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    detached: process.platform !== "win32",
  });
  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  processes.push(child);
}

async function waitFor(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

let browser;
let user;
try {
  user = await prisma.user.create({ data: { email, name: "Browser E2E", passwordHash: await bcrypt.hash(password, 4), emailVerifiedAt: new Date() } });
  start("node", ["src/index.js"], serverRoot, {
    NODE_ENV: "development", PORT: "8000", CLIENT_URL: "http://127.0.0.1:4200", RUN_SCHEDULER: "false",
  });
  start(npmCommand, ["run", "dev", "--", "--host", "127.0.0.1"], clientRoot);
  await Promise.all([waitFor("http://127.0.0.1:8000/health/ready"), waitFor("http://127.0.0.1:4200/login")]);

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:4200/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  const authStatus = await page.evaluate(async () => {
    const refresh = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
    const { accessToken } = await refresh.json();
    return (await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${accessToken}` } })).status;
  });
  if (authStatus !== 200) throw new Error(`Authenticated API check returned ${authStatus}`);
  console.log("Browser E2E passed: login -> dashboard -> authenticated API");
} finally {
  if (browser) await browser.close();
  for (const child of processes) {
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else {
      // Stop the entire npm/Vite or API process group so inherited stdio
      // handles cannot keep the CI runner alive after the assertions finish.
      try { process.kill(-child.pid, "SIGTERM"); } catch {}
    }
  }
  if (user) await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  await prisma.$disconnect();
}

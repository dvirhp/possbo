import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.js"],
      exclude: [
        "src/index.js",
        "src/config/**",
        "src/jobs/**",
        "src/routes/scheduler.js",
        "src/utils/facebook-automation.js",
        "src/utils/puppeteer.js",
      ],
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 70,
      },
    },
  },
});

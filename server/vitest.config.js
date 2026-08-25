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
        "src/routes/instagram.js",
        "src/routes/feedback.js",
        // External WhatsApp/browser integrations are covered by integration tests,
        // just like the Facebook automation modules below.
        "src/routes/whatsapp.js",
        "src/routes/whatsapp-bot.js",
        "src/utils/facebook-automation.js",
        "src/utils/metrics-scraper.js",
        "src/utils/media-upload.js",
        "src/utils/puppeteer.js",
        "src/utils/whatsapp-bot-api.js",
        "src/utils/whatsapp-conversation.js",
        "src/routes/templates.js",
      ],
      thresholds: {
        statements: 45,
        branches: 45,
        functions: 45,
        lines: 45,
      },
    },
  },
});

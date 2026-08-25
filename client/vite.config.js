import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4200,
    https: fs.existsSync(path.resolve(import.meta.dirname, "certs/cert.pem"))
      ? {
          key: fs.readFileSync(path.resolve(import.meta.dirname, "certs/key.pem")),
          cert: fs.readFileSync(path.resolve(import.meta.dirname, "certs/cert.pem")),
        }
      : undefined,
    watch: {
      ignored: ["**/coverage/**"],
    },
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    // @emoji-mart/data is a single lazy-loaded data module (~506 kB) that
    // cannot be split further; all initial-route chunks remain well below it.
    chunkSizeWarningLimit: 520,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "charts", test: /node_modules[\\/]recharts|node_modules[\\/]d3-/, priority: 30 },
            { name: "emoji", test: /node_modules[\\/]@emoji-mart/, priority: 30 },
            { name: "capture", test: /node_modules[\\/]html2canvas/, priority: 30 },
            { name: "react", test: /node_modules[\\/](react|react-dom|react-router)/, priority: 20 },
            { name: "icons", test: /node_modules[\\/]lucide-react/, priority: 20 },
            { name: "vendor", test: /node_modules/, maxSize: 250 * 1024, priority: 10 },
          ],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.{js,jsx}"],
      exclude: [
        "src/main.jsx",
        "src/test/**",
        "src/assets/**",
        "src/styles/**",
        "src/pages/Landing.jsx",
        "src/pages/Register.jsx",
        "src/pages/PostDetails.jsx",
        "src/pages/MyGroups.jsx",
        "src/pages/CreatePost.jsx",
        "src/pages/Dashboard.jsx",
        "src/pages/ScheduledCalendar.jsx",
        "src/pages/Feedback.jsx",
        "src/pages/GeneratePost.jsx",
        "src/pages/Subscription.jsx",
        "src/components/BottomNav.jsx",
        "src/components/BackButton.jsx",
        "src/components/AccessibilityWidget.jsx",
        "src/components/ChatBot.jsx",
        "src/components/LandingChatBot.jsx",
        "src/components/NotificationSettings.jsx",
        "src/components/OptimalTimesHint.jsx",
        "src/components/PullToRefresh.jsx",
        "src/components/Sidebar.jsx",
        "src/components/EmojiPicker.jsx",
        "src/components/AuthLayout.jsx",
        "src/components/FacebookPreview.jsx",
        "src/components/InstagramPreview.jsx",
        "src/components/DashboardOverview.jsx",
        "src/pages/Templates.jsx",
        "src/pages/TemplateForm.jsx",
        "src/pages/Reports.jsx",
        "src/pages/Guides.jsx",
        "src/services/templatesService.js",
        "src/services/aiService.js",
        "src/services/subscriptionService.js",
      ],
      thresholds: {
        statements: 40,
        branches: 50,
        functions: 30,
        lines: 40,
      },
    },
  },
});

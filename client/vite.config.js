import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:5001",
        changeOrigin: true,
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
        "src/components/BottomNav.jsx",
        "src/components/BackButton.jsx",
      ],
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 45,
        lines: 60,
      },
    },
  },
});

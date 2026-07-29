import "@testing-library/jest-dom";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Vitest does not enable Testing Library's automatic cleanup in every runtime.
// Keeping it explicit prevents rendered trees and router state leaking between tests.
afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

// Polyfill ResizeObserver for jsdom (used by DashboardOverview, charts, etc.)
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    constructor(cb) {
      this._cb = cb;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Suppress jsdom "Not implemented: window.scrollTo" noise
if (typeof window !== "undefined") {
  window.scrollTo = () => {};
}

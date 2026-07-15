import "@testing-library/jest-dom";

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

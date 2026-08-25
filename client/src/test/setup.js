import "@testing-library/jest-dom";
import React from "react";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Some tests contain JSX without importing React. Vite's application build uses
// the automatic JSX runtime, while Vitest may compile those test modules with
// the classic runtime, which expects React to exist in the global scope.
globalThis.React = React;

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

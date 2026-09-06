import { describe, expect, it } from "vitest";
import { parseCgroupBytes } from "../../src/utils/container-memory.js";

describe("container memory", () => {
  it("parses cgroup byte counters", () => {
    expect(parseCgroupBytes("536870912\n")).toBe(536870912);
  });

  it("treats unlimited and invalid values as unavailable", () => {
    expect(parseCgroupBytes("max")).toBeNull();
    expect(parseCgroupBytes("0")).toBeNull();
    expect(parseCgroupBytes("invalid")).toBeNull();
  });
});

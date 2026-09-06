import fs from "fs";

const CGROUP_V2_CURRENT = "/sys/fs/cgroup/memory.current";
const CGROUP_V2_MAX = "/sys/fs/cgroup/memory.max";
const CGROUP_V1_CURRENT = "/sys/fs/cgroup/memory/memory.usage_in_bytes";
const CGROUP_V1_MAX = "/sys/fs/cgroup/memory/memory.limit_in_bytes";
const MB = 1024 * 1024;

export function parseCgroupBytes(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === "max") return null;
  const bytes = Number(normalized);
  return Number.isFinite(bytes) && bytes > 0 ? bytes : null;
}

function readBytes(path) {
  try {
    return parseCgroupBytes(fs.readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function getContainerMemoryUsage() {
  const processBytes = process.memoryUsage().rss;
  const currentBytes =
    readBytes(CGROUP_V2_CURRENT) ?? readBytes(CGROUP_V1_CURRENT) ?? processBytes;
  let limitBytes = readBytes(CGROUP_V2_MAX) ?? readBytes(CGROUP_V1_MAX);

  // cgroup v1 sometimes reports a huge sentinel instead of "unlimited".
  if (limitBytes && limitBytes > 1024 ** 5) limitBytes = null;

  return {
    processRssMb: Math.round(processBytes / MB),
    containerMb: Math.round(currentBytes / MB),
    limitMb: limitBytes ? Math.round(limitBytes / MB) : null,
    usagePercent: limitBytes
      ? Math.round((currentBytes / limitBytes) * 1000) / 10
      : null,
    availableMb: limitBytes
      ? Math.max(0, Math.round((limitBytes - currentBytes) / MB))
      : null,
  };
}

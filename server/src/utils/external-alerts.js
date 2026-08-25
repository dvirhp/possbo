import { createLogger } from "./logger.js";

const log = createLogger("alerts");
const lastSent = new Map();

export async function sendExternalAlert(type, details, { cooldownMs = 15 * 60 * 1000 } = {}) {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return false;
  const previous = lastSent.get(type) || 0;
  if (Date.now() - previous < cooldownMs) return false;
  lastSent.set(type, Date.now());
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ service: "possbo", type, timestamp: new Date().toISOString(), ...details }),
      signal: globalThis.AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`Alert webhook returned ${response.status}`);
    return true;
  } catch (error) {
    log.error("External alert delivery failed", error, { event: "external_alert_failed", alertType: type });
    return false;
  }
}

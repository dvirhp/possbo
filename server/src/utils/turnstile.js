import { createLogger } from "./logger.js";

const log = createLogger("turnstile");
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY || "1x0000000000000000000000000000000AA";

export async function verifyTurnstile(token, ip) {
  if (!token) return false;

  // Allow bypass in development
  if (token === "bypass" && process.env.NODE_ENV !== "production") {
    return true;
  }

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: TURNSTILE_SECRET,
        response: token,
        remoteip: ip || "",
      }),
    });

    const data = await res.json();
    if (!data.success) {
      log.warn("Turnstile verification failed", { errors: data["error-codes"] });
    }
    return data.success;
  } catch (error) {
    log.error("Turnstile verification error", error);
    // Fail open in development, fail closed in production
    return process.env.NODE_ENV !== "production";
  }
}

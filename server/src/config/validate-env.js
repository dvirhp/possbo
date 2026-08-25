const PLACEHOLDER = /(replace-with|your_|changeme|xxxxx)/i;

function isUrl(value, protocols) {
  try { return protocols.includes(new URL(value).protocol); } catch { return false; }
}

export function validateEnvironment({ production = process.env.NODE_ENV === "production" } = {}) {
  if (!production) return;
  const errors = [];
  const required = ["DATABASE_URL", "DIRECT_URL", "CLIENT_URL", "JWT_SECRET", "JWT_REFRESH_SECRET", "SESSION_SECRET", "ENCRYPTION_KEY"];
  for (const name of required) {
    const value = process.env[name];
    if (!value) errors.push(`${name} is required`);
    else if (PLACEHOLDER.test(value)) errors.push(`${name} still contains a placeholder`);
  }
  for (const name of ["JWT_SECRET", "JWT_REFRESH_SECRET", "SESSION_SECRET", "ENCRYPTION_KEY"]) {
    if (process.env[name] && process.env[name].length < 32) errors.push(`${name} must contain at least 32 characters`);
  }
  if (process.env.DATABASE_URL && !isUrl(process.env.DATABASE_URL, ["postgres:", "postgresql:"])) errors.push("DATABASE_URL must be a PostgreSQL URL");
  if (process.env.DIRECT_URL && !isUrl(process.env.DIRECT_URL, ["postgres:", "postgresql:"])) errors.push("DIRECT_URL must be a PostgreSQL URL");
  if (process.env.CLIENT_URL && !isUrl(process.env.CLIENT_URL, ["http:", "https:"])) errors.push("CLIENT_URL must be an HTTP(S) URL");
  if (process.env.RUN_SCHEDULER !== undefined && !["true", "false"].includes(process.env.RUN_SCHEDULER)) errors.push("RUN_SCHEDULER must be true or false");
  if (process.env.STORAGE_DRIVER !== "s3") errors.push("STORAGE_DRIVER must be s3 in production");
  for (const name of ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) if (!process.env[name]) errors.push(`${name} is required for production object storage`);
  const stripeValues = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"];
  if (stripeValues.some((name) => process.env[name]) && stripeValues.some((name) => !process.env[name])) errors.push("STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET must be configured together");
  const vapidValues = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"];
  if (vapidValues.some((name) => process.env[name]) && vapidValues.some((name) => !process.env[name])) errors.push("VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT must be configured together");
  if (errors.length) throw new Error(`Invalid production environment:\n- ${errors.join("\n- ")}`);
}

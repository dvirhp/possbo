import "dotenv/config";
import { validateEnvironment } from "./config/validate-env.js";
import prisma from "./config/prisma.js";
import { startScheduler, stopScheduler } from "./jobs/index.js";
import { restoreWhatsAppSessions } from "./routes/whatsapp.js";
import { createLogger } from "./utils/logger.js";
import { initializeOperationalEvents, stopOperationalEvents } from "./utils/operational-events.js";

validateEnvironment();

const log = createLogger("worker");
initializeOperationalEvents({ service: "worker" });
let shuttingDown = false;

async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info("Worker shutting down", { signal });
  stopScheduler();
  await stopOperationalEvents();
  await prisma.$disconnect().catch(() => {});
  process.exit(exitCode);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", (error) => {
  log.error("Worker uncaught exception", error);
  shutdown("uncaughtException", 1);
});
process.on("unhandledRejection", (error) => {
  log.error("Worker unhandled rejection", error);
  shutdown("unhandledRejection", 1);
});

try {
  await restoreWhatsAppSessions();
  startScheduler();
  log.info("Publication worker started");
} catch (error) {
  log.error("Worker startup failed", error);
  await shutdown("startup-failure", 1);
}

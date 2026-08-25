import prisma from "../config/prisma.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("retention");
const daysAgo = (days) => new Date(Date.now() - days * 86400000);

export async function runRetentionCleanup() {
  const historyDays = Math.max(30, Number(process.env.PUBLICATION_HISTORY_RETENTION_DAYS || 365));
  const completedJobDays = Math.max(7, Number(process.env.COMPLETED_JOB_RETENTION_DAYS || 90));
  const metricDays = Math.max(7, Number(process.env.PUBLICATION_METRIC_RETENTION_DAYS || 180));

  // Delete only terminal operational data. Pending/running jobs are never touched.
  const [metrics, history, jobs] = await prisma.$transaction([
    prisma.publicationMetric.deleteMany({ where: { collectedAt: { lt: daysAgo(metricDays) } } }),
    prisma.publicationHistory.deleteMany({ where: { publishedAt: { lt: daysAgo(historyDays) } } }),
    prisma.publicationJob.deleteMany({
      where: {
        status: { in: ["SUCCESS", "FAILED", "CANCELLED"] },
        completedAt: { lt: daysAgo(completedJobDays) },
        publications: { none: {} },
      },
    }),
  ]);
  log.info("Retention cleanup completed", {
    event: "retention_cleanup_completed",
    deletedMetrics: metrics.count,
    deletedJobs: jobs.count,
    deletedHistory: history.count,
  });
  return { metrics: metrics.count, jobs: jobs.count, history: history.count };
}

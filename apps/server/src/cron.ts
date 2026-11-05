import { activationLog, db } from "@licences-app/db";
import { lt, sql } from "drizzle-orm";

const ACTIVATION_LOG_RETENTION = "6 months";
// Daily at 03:00 (server time zone).
const CLEANUP_SCHEDULE = "0 3 * * *";

export async function cleanupActivationLogs() {
	const result = await db
		.delete(activationLog)
		.where(
			lt(
				activationLog.createdAt,
				sql`now() - ${ACTIVATION_LOG_RETENTION}::interval`,
			),
		);
	return result.rowCount ?? 0;
}

export function registerCronJobs() {
	if (typeof Bun === "undefined" || typeof Bun.cron !== "function") {
		// Bun.cron requires Bun >= 1.4.
		console.warn(
			"[cron] Bun.cron is unavailable; activation log cleanup is disabled",
		);
		return;
	}

	Bun.cron(CLEANUP_SCHEDULE, async () => {
		try {
			const deleted = await cleanupActivationLogs();
			console.log(
				`[cron] activation log cleanup: deleted ${deleted} entries older than ${ACTIVATION_LOG_RETENTION}`,
			);
		} catch (error) {
			// An uncaught rejection inside a cron handler kills the process.
			console.error("[cron] activation log cleanup failed", error);
		}
	}).unref();

	console.log(
		`[cron] activation log cleanup scheduled (${CLEANUP_SCHEDULE}, retention ${ACTIVATION_LOG_RETENTION})`,
	);
}

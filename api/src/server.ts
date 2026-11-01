import { createApp } from "./app";
import { config } from "./config";
import { prisma } from "./db";
import { addDays, todayIn } from "./lib/dates";
import { processRange } from "./modules/attendance/attendance.service";

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`HRMS API listening on http://localhost:${config.port}`);
});

/**
 * Background job: re-process yesterday and today every hour so employees who never
 * punched in are marked absent once the day is over, and late/leave status stays current.
 */
async function refreshAttendance() {
  try {
    const settings = await prisma.companySettings.findUnique({ where: { id: 1 } });
    if (!settings) return;
    const today = todayIn(settings.timezone);
    const result = await processRange({ from: addDays(today, -1), to: today });
    console.log(`[attendance-job] processed ${result.processed} day rows`);
  } catch (err) {
    console.error("[attendance-job] failed", err);
  }
}
setTimeout(refreshAttendance, 10_000);
const job = setInterval(refreshAttendance, 60 * 60 * 1000);

async function shutdown() {
  clearInterval(job);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

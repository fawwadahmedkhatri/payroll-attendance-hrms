/**
 * Stand-alone biometric device simulator.
 * Behaves like a fingerprint / face terminal: sends punches to the public device endpoint
 * using a device API key — exactly what real hardware middleware would do.
 *
 * Usage:
 *   DEVICE_KEY=dev_xxx npm run simulate                       # today, employees BIO1001..BIO1500
 *   DEVICE_KEY=dev_xxx npm run simulate -- --date 2026-03-10 --count 50
 *
 * Get a device key from Settings → Biometric devices → Register device.
 */
import { DateTime } from "luxon";

function arg(name: string, fallback: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const DEVICE_KEY = process.env.DEVICE_KEY;
const TIMEZONE = process.env.TZ_NAME ?? "Asia/Kolkata";
const date = arg("date", DateTime.now().setZone(TIMEZONE).toISODate()!);
const count = Number(arg("count", "500"));

if (!DEVICE_KEY) {
  console.error("Set DEVICE_KEY to a device API key (Settings → Biometric devices).");
  process.exit(1);
}

const rand = (min: number, max: number) => Math.round(min + Math.random() * (max - min));

async function main() {
  const shiftStart = DateTime.fromISO(`${date}T09:30`, { zone: TIMEZONE });
  const shiftEnd = DateTime.fromISO(`${date}T18:30`, { zone: TIMEZONE });
  const now = DateTime.now();
  const punches: { userId: string; timestamp: string }[] = [];

  for (let i = 1; i <= count; i++) {
    if (Math.random() < 0.05) continue; // absent
    const late = Math.random() < 0.12;
    const inAt = shiftStart.plus({ minutes: late ? rand(16, 70) : rand(-20, 12), seconds: rand(0, 59) });
    const outAt = shiftEnd.plus({ minutes: rand(-5, 45), seconds: rand(0, 59) });
    for (const t of [inAt, outAt]) {
      if (t <= now) punches.push({ userId: `BIO${1000 + i}`, timestamp: t.toISO()! });
    }
  }

  console.log(`Sending ${punches.length} punches for ${date} to ${API_URL}…`);
  const res = await fetch(`${API_URL}/api/device/punches`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Key": DEVICE_KEY! },
    body: JSON.stringify({ punches }),
  });
  console.log(res.status, await res.json());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

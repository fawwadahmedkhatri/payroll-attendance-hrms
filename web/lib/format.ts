export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function money(value: number | string | null | undefined, symbol = "") {
  const n = Number(value ?? 0);
  return `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function compactMoney(value: number, symbol = "") {
  return `${symbol}${Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;
}

/** "2026-03-10" (or ISO timestamp) -> "10 Mar 2026" without timezone shifts. */
export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function monthLabel(year: number, month: number) {
  return `${MONTHS[month - 1]} ${year}`;
}

export function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function minutesToHours(minutes: number) {
  if (!minutes) return "—";
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export const STATUS_LABEL: Record<string, string> = {
  PRESENT: "Present",
  HALF_DAY: "Half day",
  ABSENT: "Absent",
  ON_LEAVE: "On leave",
  HOLIDAY: "Holiday",
  WEEKLY_OFF: "Weekly off",
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  DRAFT: "Draft",
  FINALIZED: "Finalized",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

export const STATUS_TONE: Record<string, "green" | "red" | "amber" | "blue" | "gray" | "violet"> = {
  PRESENT: "green",
  HALF_DAY: "amber",
  ABSENT: "red",
  ON_LEAVE: "blue",
  HOLIDAY: "violet",
  WEEKLY_OFF: "gray",
  PENDING: "amber",
  APPROVED: "green",
  REJECTED: "red",
  CANCELLED: "gray",
  DRAFT: "amber",
  FINALIZED: "green",
  ACTIVE: "green",
  INACTIVE: "gray",
};

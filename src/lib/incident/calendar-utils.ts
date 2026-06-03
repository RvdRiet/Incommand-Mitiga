/** Calendar helpers (no external date library) */

export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function toDateKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseDateKey(key: string) {
  const [y, m, day] = key.split("-").map(Number);
  return new Date(y, m - 1, day);
}

export function startOfMonth(year: number, month: number) {
  return new Date(year, month, 1);
}

export function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

export function addMonths(year: number, month: number, delta: number) {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function monthLabel(year: number, month: number) {
  return `${MONTHS[month]} ${year}`;
}

export function weekdayLabels() {
  return WEEKDAYS;
}

/** Grid cells for month view: null = padding, else day number */
export function buildMonthGrid(year: number, month: number) {
  const first = startOfMonth(year, month);
  const startPad = first.getDay();
  const total = daysInMonth(year, month);
  const cells: (number | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function eventOverlapsDay(
  startIso: string,
  endIso: string,
  year: number,
  month: number,
  day: number,
) {
  const dayStart = new Date(year, month, day, 0, 0, 0, 0);
  const dayEnd = new Date(year, month, day, 23, 59, 59, 999);
  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : start;
  return start <= dayEnd && end >= dayStart;
}

export function formatEventRange(startIso: string, endIso: string, allDay: boolean) {
  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : null;
  if (allDay) {
    const s = start.toLocaleDateString();
    if (!end || toDateKey(start) === toDateKey(end)) return s;
    return `${s} – ${end.toLocaleDateString()}`;
  }
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };
  if (!end) return start.toLocaleString(undefined, opts);
  return `${start.toLocaleString(undefined, opts)} – ${end.toLocaleString(undefined, opts)}`;
}

// Business-day arithmetic using an admin-configurable holiday list.
// Default seed: US federal holidays 2025-2030 (approximate fixed/observed dates).

const DEFAULT_HOLIDAYS = [
  // YYYY-MM-DD
  '2025-01-01','2025-01-20','2025-02-17','2025-05-26','2025-06-19','2025-07-04','2025-09-01','2025-10-13','2025-11-11','2025-11-27','2025-12-25',
  '2026-01-01','2026-01-19','2026-02-16','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-10-12','2026-11-11','2026-11-26','2026-12-25',
  '2027-01-01','2027-01-18','2027-02-15','2027-05-31','2027-06-18','2027-07-05','2027-09-06','2027-10-11','2027-11-11','2027-11-25','2027-12-24',
  '2028-01-03','2028-01-17','2028-02-21','2028-05-29','2028-06-19','2028-07-04','2028-09-04','2028-10-09','2028-11-10','2028-11-23','2028-12-25',
  '2029-01-01','2029-01-15','2029-02-19','2029-05-28','2029-06-19','2029-07-04','2029-09-03','2029-10-08','2029-11-12','2029-11-22','2029-12-25',
  '2030-01-01','2030-01-21','2030-02-18','2030-05-27','2030-06-19','2030-07-04','2030-09-02','2030-10-14','2030-11-11','2030-11-28','2030-12-25',
];

function toYmd(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isWeekend(d) {
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6;
}

function isBusinessDay(d, calendar = DEFAULT_HOLIDAYS) {
  if (isWeekend(d)) return false;
  return !calendar.includes(toYmd(d));
}

function addBusinessDays(start, nDays, calendar = DEFAULT_HOLIDAYS) {
  const d = new Date(start);
  d.setUTCHours(0, 0, 0, 0);
  let remaining = nDays;
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isBusinessDay(d, calendar)) remaining--;
  }
  return d;
}

function businessDaysBetween(start, end, calendar = DEFAULT_HOLIDAYS) {
  const a = new Date(start); a.setUTCHours(0, 0, 0, 0);
  const b = new Date(end); b.setUTCHours(0, 0, 0, 0);
  if (a > b) return -businessDaysBetween(end, start, calendar);
  let count = 0;
  const d = new Date(a);
  while (d < b) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isBusinessDay(d, calendar)) count++;
  }
  return count;
}

module.exports = { DEFAULT_HOLIDAYS, isWeekend, isBusinessDay, addBusinessDays, businessDaysBetween, toYmd };

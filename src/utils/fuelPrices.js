// The UK's average pump prices, week by week: the government's "Weekly road fuel
// prices" (DESNZ, Open Government Licence). The app's server reads its CSVs
// (server/app/src/fuelPrice.js) and the phone keeps the table it hands back.
// Shared by both, so they read the figures the same way.

const PETROL = /ULSP.*pump price/i;
const DIESEL = /ULSD.*pump price/i;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "23/11/2026" -> "2026-11-23", or null. */
function isoDate(text) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/**
 * One of the CSVs as [[week, petrol, diesel]]: the Monday each week starts
 * ("2026-11-23") and pence a litre, oldest first. Rows without both prices are
 * left out; a file without the columns gives [].
 */
export function parseWeeklyPrices(csv) {
  const [header, ...rows] = csv.replace(/^﻿/, '').split(/\r?\n/);
  const columns = header.split(',');
  const petrol = columns.findIndex((c) => PETROL.test(c));
  const diesel = columns.findIndex((c) => DIESEL.test(c));
  if (petrol < 0 || diesel < 0) return [];
  return rows
    .map((row) => row.split(','))
    .map((cells) => [isoDate(cells[0] ?? ''), Number(cells[petrol]), Number(cells[diesel])])
    .filter(([week, p, d]) => week && p > 0 && d > 0)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/** Several files' weeks as one table, oldest first; a week in two files is kept once. */
export function mergeWeeks(tables) {
  const byWeek = new Map(tables.flat().map((row) => [row[0], row]));
  return [...byWeek.values()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/**
 * Pounds a litre of petrol or diesel (`diesel` true) cost in the UK the week
 * `time` (ms) fell in: that week's figure, or the latest one for a time after
 * it (the figures come out a week or so late). Null before the table starts,
 * or with no table.
 */
export function ukPriceAt(weeks, time, diesel = false) {
  if (!weeks?.length) return null;
  const day = new Date(time).toISOString().slice(0, 10);
  // The last week starting on or before that day.
  let lo = 0;
  let hi = weeks.length - 1;
  if (day < weeks[0][0]) return null;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (weeks[mid][0] <= day) lo = mid;
    else hi = mid - 1;
  }
  const row = weeks[lo];
  // A gap in the figures of more than a few weeks: too far off to call it that week's.
  const age = Date.parse(day) - Date.parse(row[0]);
  if (lo < weeks.length - 1 && age > 4 * 7 * DAY_MS) return null;
  return Math.round((diesel ? row[2] : row[1]) * 100) / 10000;
}

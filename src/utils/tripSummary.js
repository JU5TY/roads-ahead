// Combining drives into trip-level and day-level views. Pure functions over the
// drive objects from storage: { startedAt, endedAt, stats, places }.

/** Wall-clock length of a drive (start to STOP, rest stops included). */
export const driveElapsedMs = (drive) => (drive.endedAt ?? Date.now()) - drive.startedAt;

/**
 * Totals across drives, in the same shape as a drive's stats so the same
 * formatting code works for both. `elapsedMs` covers time on the road only;
 * overnight gaps between drives are excluded.
 */
export function summarizeDrives(drives) {
  const sum = (pick) => drives.reduce((acc, d) => acc + (pick(d) ?? 0), 0);
  const max = (pick) => {
    const values = drives.map(pick).filter((v) => v !== null && v !== undefined);
    return values.length ? Math.max(...values) : null;
  };
  return {
    distanceM: sum((d) => d.stats.distanceM),
    movingTimeMs: sum((d) => d.stats.movingTimeMs),
    elapsedMs: sum(driveElapsedMs),
    topSpeedMps: max((d) => d.stats.topSpeedMps) ?? 0,
    maxAltitudeM: max((d) => d.stats.maxAltitudeM),
    elevationGainM: sum((d) => d.stats.elevationGainM),
    stopCount: sum((d) => d.stats.stopCount),
    totalStopMs: sum((d) => d.stats.totalStopMs),
    // Trips recorded before this stat existed have no value.
    longestStintMs: max((d) => d.stats.longestStintMs),
  };
}

/** Local calendar date of a timestamp, e.g. "2026-11-03". */
function localDateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * Group drives by the local date they started on. Days are numbered by driving
 * days only (a day without driving doesn't get a number).
 * Returns [{ number, date, drives, summary }], oldest first.
 */
export function groupIntoDays(drives) {
  const days = [];
  for (const drive of [...drives].sort((a, b) => a.startedAt - b.startedAt)) {
    const last = days.at(-1);
    if (last && localDateKey(last.date) === localDateKey(drive.startedAt)) {
      last.drives.push(drive);
    } else {
      days.push({ number: days.length + 1, date: drive.startedAt, drives: [drive] });
    }
  }
  return days.map((day) => ({ ...day, summary: summarizeDrives(day.drives) }));
}

/** Day number a drive starting at `ts` would get in this trip. */
export function dayNumberFor(drives, ts) {
  const days = groupIntoDays(drives);
  const last = days.at(-1);
  if (!last) return 1;
  return localDateKey(last.date) === localDateKey(ts) ? last.number : last.number + 1;
}

/** "Manchester → Edinburgh", "Manchester" for a round trip, or null if unknown. */
export function routeLabel(places) {
  const { start, end } = places ?? {};
  if (!start && !end) return null;
  if (start && end && start !== end) return `${start} → ${end}`;
  return start || end;
}

/** routeLabel for showing beside a title: null for a round trip, which has nothing to add. */
export function oneWayLabel(places) {
  return places?.start && places.start === places.end ? null : routeLabel(places);
}

/** Where a whole trip went: first drive's start to the latest drive's end. */
const tripPlaces = (trip) => ({
  start: trip.drives[0]?.places.start,
  end: trip.drives.at(-1)?.places.end,
});

/** Route of a whole trip. */
export const tripRouteLabel = (trip) => routeLabel(tripPlaces(trip));

/** oneWayLabel of a whole trip. */
export const tripOneWayLabel = (trip) => oneWayLabel(tripPlaces(trip));

/** Display title: the user's name, else the route, else null (caller falls back to a date). */
export function tripTitle(trip) {
  return trip.name || tripRouteLabel(trip);
}

/** Month and year of the first drive across `trips`: "June 2025" (Home and Your map). */
export const firstDriveMonth = (trips) =>
  new Date(Math.min(...trips.flatMap((t) => t.drives.map((d) => d.startedAt)))).toLocaleDateString(
    undefined,
    { month: 'long', year: 'numeric' }
  );

/** Body of the "Delete this trip?" dialog on the Trip page. */
export function deleteTripMessage(trip, fallbackName) {
  const name = tripTitle(trip) ?? fallbackName;
  const count = trip.drives.length;
  return `${name}${count > 1 ? ` and its ${count} drives` : ''} will be deleted. This can't be undone.`;
}

/** Offer "Continue" on a trip whose latest drive ended within this long. */
export const CONTINUE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/** Whether a new drive started at `now` would be offered as a continuation of `trip`. */
export const isContinuable = (trip, now = Date.now()) =>
  now - trip.drives.at(-1).endedAt <= CONTINUE_WINDOW_MS;

/**
 * Lifetime-style totals over all drives that started at or after `sinceTs`:
 * { distanceM, movingTimeMs, tripCount, drivingDays, maxAltitudeM }.
 */
export function computeTotals(trips, sinceTs = 0) {
  const inRange = trips
    .map((t) => t.drives.filter((d) => d.startedAt >= sinceTs))
    .filter((drives) => drives.length > 0);
  const drives = inRange.flat();
  const summary = summarizeDrives(drives);
  return {
    distanceM: summary.distanceM,
    movingTimeMs: summary.movingTimeMs,
    tripCount: inRange.length,
    drivingDays: new Set(drives.map((d) => localDateKey(d.startedAt))).size,
    maxAltitudeM: summary.maxAltitudeM,
  };
}

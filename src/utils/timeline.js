// Stop-by-stop timelines for drives and trips. Pure functions over drives
// ({ startedAt, endedAt, stats, places, seaCrossings }) and their GPS points ({ latitude,
// longitude, timestamp }, oldest first).
//
// Item types:
//   { type: 'start' | 'finish', time, place, dayNumber?, driveId? } (trip timelines add `day`;
//                                                                 a start has its drive's id)
//   { type: 'leg', distanceM, durationMs }                      driving between events
//   { type: 'stop', time, endTime, place, latitude, longitude } rest stop
//   { type: 'crossing', time, country, from }                   crossed a border (names)
//   { type: 'seaCrossing', kind, time, endTime, distanceM,      a ferry, tunnel or pause
//     durationMs }                                              (kind 'pause'), between legs
//   { type: 'break', durationMs, day }                          same-day gap between drives
//   { type: 'overnight', durationMs, place }                    gap to the next driving day
import { getCountry } from './countries';
import { driveGaps } from './crossings';
import { haversineDistance } from './geoMath';
import { groupIntoDays } from './tripSummary';

/** Cumulative distance (m) at each point. */
function cumulativeDistance(points) {
  const cum = new Array(points.length);
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) total += haversineDistance(points[i - 1], points[i]);
    cum[i] = total;
  }
  return cum;
}

/** Index of the last point at or before `t` (0 if none). */
function indexAt(points, t) {
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (points[mid].timestamp <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Scale raw values so they add up to `total` (keeps legs consistent with the
 * drive's filtered totals). Falls back to an even split when raw sums to 0.
 */
function scaleTo(raw, total) {
  const sum = raw.reduce((a, b) => a + b, 0);
  if (sum > 0) return raw.map((v) => (v / sum) * total);
  return raw.map(() => total / raw.length);
}

/**
 * Border crossings of a drive as timeline events, oldest first. A crossing
 * during a rest stop is left out (it would split the stop); one during a ferry,
 * tunnel or pause moves to where it ends.
 */
function crossingEvents(drive) {
  const visits = drive.countries ?? [];
  const landing = (t) =>
    driveGaps(drive).find((c) => t > c.startedAt && t < c.endedAt)?.endedAt ?? t;
  return visits
    .slice(1)
    .map((v, k) => ({
      type: 'crossing',
      time: landing(v.enteredAt),
      country: getCountry(v.code)?.name,
      from: getCountry(visits[k].code)?.name,
    }))
    .filter(
      (x) =>
        x.country &&
        x.time > drive.startedAt &&
        x.time < drive.endedAt &&
        !drive.stats.stops.some((s) => x.time >= s.startedAt && x.time <= s.endedAt)
    );
}

/** Timeline of one drive: start, legs, rest stops, ferries, pauses and border crossings, finish. */
export function buildDriveTimeline(drive, points, { dayNumber } = {}) {
  const stopName = (i) => drive.places.stops?.[i] || 'Rest stop';
  const events = [
    ...drive.stats.stops.map((stop, i) => ({
      type: 'stop',
      time: stop.startedAt,
      endTime: stop.endedAt,
      place: stopName(i),
      latitude: stop.latitude,
      longitude: stop.longitude,
    })),
    ...driveGaps(drive).map((c) => ({
      type: 'seaCrossing',
      kind: c.kind,
      time: c.startedAt,
      endTime: c.endedAt,
      distanceM: c.distanceM,
      durationMs: c.endedAt - c.startedAt,
    })),
    ...crossingEvents(drive),
  ].sort((a, b) => a.time - b.time);

  // Leg boundaries: drive start → event 1 → … → event n → drive end.
  const bounds = [
    drive.startedAt,
    ...events.flatMap((e) => [e.time, e.endTime ?? e.time]),
    drive.endedAt,
  ];
  const legs = [];
  for (let i = 0; i < bounds.length; i += 2) legs.push([bounds[i], bounds[i + 1]]);

  let rawDistances = legs.map(() => 0);
  if (points.length > 1) {
    const cum = cumulativeDistance(points);
    rawDistances = legs.map(([from, to]) =>
      Math.max(0, cum[indexAt(points, to)] - cum[indexAt(points, from)])
    );
  }
  const distances = scaleTo(rawDistances, drive.stats.distanceM);
  const durations = scaleTo(
    legs.map(([from, to]) => Math.max(0, to - from)),
    drive.stats.movingTimeMs
  );

  const items = [{ type: 'start', time: drive.startedAt, place: drive.places.start, dayNumber, driveId: drive.id }];
  legs.forEach(([from, to], i) => {
    // No empty leg beside a ferry or tunnel (e.g. a border right where it lands).
    const bySea = events[i - 1]?.type === 'seaCrossing' || events[i]?.type === 'seaCrossing';
    if (!(bySea && to <= from)) {
      items.push({ type: 'leg', distanceM: distances[i], durationMs: durations[i] });
    }
    if (events[i]) items.push(events[i]);
  });
  items.push({ type: 'finish', time: drive.endedAt, place: drive.places.end, dayNumber });
  return items;
}

/**
 * Timeline of a whole trip: each drive's timeline in order, joined by a
 * same-day "break" or an "overnight" before the next driving day. Each item
 * carries its `day` (for its colour); on a trip of several days, each day's
 * first start also has its `dayNumber` (shown as "Day 2").
 * `pointsByDrive` is a Map of drive id → points.
 */
export function buildTripTimeline(trip, pointsByDrive) {
  const items = [];
  let prev = null;
  const days = groupIntoDays(trip.drives);
  for (const day of days) {
    day.drives.forEach((drive, i) => {
      if (prev) {
        const gap = Math.max(0, drive.startedAt - prev.endedAt);
        items.push(
          i === 0
            ? { type: 'overnight', durationMs: gap, place: prev.places.end }
            : { type: 'break', durationMs: gap, day: day.number }
        );
      }
      // Only label the first drive of each day with its day number.
      items.push(
        ...buildDriveTimeline(drive, pointsByDrive.get(drive.id) ?? [], {
          dayNumber: i === 0 && days.length > 1 ? day.number : undefined,
        }).map((item) => ({ ...item, day: day.number }))
      );
      prev = drive;
    });
  }
  return items;
}

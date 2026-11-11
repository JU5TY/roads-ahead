// Ferry and tunnel crossings: stretches of a drive over open water (a car
// ferry) or a long GPS gap under it (the Channel Tunnel). Found offline from the
// bundled borders, drawn dotted, and left out of driving distance, moving time,
// stops and top speed. Pure functions over drive points ({ latitude, longitude,
// timestamp, ... }, oldest first).
//
// A crossing: { kind: 'ferry' | 'tunnel', startedAt, endedAt, from, to, distanceM },
// where from / to ({ latitude, longitude }) are the last fix before it and the
// first fix after, and startedAt / endedAt their times. Pauses from the Pause
// button (stats.pauses, kind 'pause') have the same shape; together they're a
// drive's gaps (driveGaps), drawn dotted and left out of driving.
import { COUNTRIES_VERSION, countryAt } from './countries';
import {
  BREAK_MIN_MS,
  applyFix,
  createTripStats,
  finalizeStats,
  haversineDistance,
  skipTo,
} from './geoMath';

const SAMPLE_M = 250; // look for land every this many metres
const GAP_SAMPLE_M = 1000; // along a GPS gap, this often
const MAX_GAP_SAMPLES = 60;
const MERGE_MS = 3 * 60 * 1000; // a brief fix "on land" mid-crossing (a breakwater) doesn't split it
const MIN_DURATION_MS = 15 * 60 * 1000; // shorter stretches over water are bridges and causeways
const MIN_SPAN_M = 3000; // start to end, so parking on a seafront isn't a crossing
const TUNNEL_SPEED_MPS = 60 / 3.6; // end to end, faster than a car ferry
const TUNNEL_GAP_SHARE = 0.6; // and mostly one GPS gap

/**
 * Changes whenever detection, rest stops or the borders change, so past drives
 * are checked again. 2: rest stops a walk apart join into one.
 */
export const CROSSINGS_VERSION = `2:${COUNTRIES_VERSION}`;

const atSea = (p) => countryAt(p.latitude, p.longitude) === null;

/** Whether each point is at sea, checked every SAMPLE_M (points in between take the last answer). */
function seaFlags(points) {
  let checked = null;
  let wet = false;
  return points.map((p) => {
    if (!checked || haversineDistance(checked, p) >= SAMPLE_M) {
      wet = atSea(p);
      checked = p;
    }
    return wet;
  });
}

/** Whether the straight line between two fixes far apart (a GPS gap) passes over water. */
function gapCrossesWater(a, b) {
  const n = Math.min(MAX_GAP_SAMPLES, Math.floor(haversineDistance(a, b) / GAP_SAMPLE_M));
  for (let k = 1; k < n; k++) {
    const t = k / n;
    const p = {
      latitude: a.latitude + (b.latitude - a.latitude) * t,
      longitude: a.longitude + (b.longitude - a.longitude) * t,
    };
    if (atSea(p)) return true;
  }
  return false;
}

/** The ferry and tunnel crossings in a drive's points, oldest first. */
export function detectCrossings(points) {
  if (points.length < 2) return [];
  const wet = seaFlags(points);
  // Runs of point indexes [a, b] over water: a is the last fix before, b the first after.
  const runs = [];
  for (let i = 1; i < points.length; i++) {
    if (!(wet[i - 1] || wet[i] || gapCrossesWater(points[i - 1], points[i]))) continue;
    const prev = runs.at(-1);
    if (prev && points[i - 1].timestamp - points[prev.b].timestamp <= MERGE_MS) prev.b = i;
    else runs.push({ a: i - 1, b: i });
  }

  const crossings = [];
  for (const { a, b } of runs) {
    const from = points[a];
    const to = points[b];
    const durationMs = to.timestamp - from.timestamp;
    const spanM = haversineDistance(from, to);
    if (durationMs < MIN_DURATION_MS || spanM < MIN_SPAN_M) continue;
    let pathM = 0;
    let longestGapMs = 0;
    for (let i = a + 1; i <= b; i++) {
      pathM += haversineDistance(points[i - 1], points[i]);
      longestGapMs = Math.max(longestGapMs, points[i].timestamp - points[i - 1].timestamp);
    }
    const tunnel =
      longestGapMs >= durationMs * TUNNEL_GAP_SHARE &&
      spanM / (durationMs / 1000) >= TUNNEL_SPEED_MPS;
    crossings.push({
      kind: tunnel ? 'tunnel' : 'ferry',
      startedAt: from.timestamp,
      endedAt: to.timestamp,
      from: { latitude: from.latitude, longitude: from.longitude },
      to: { latitude: to.latitude, longitude: to.longitude },
      distanceM: Math.round(tunnel ? spanM : pathM),
    });
  }
  return crossings;
}

// Saved points were checked when recorded; only their accuracy isn't kept.
const asFix = (p) => ({
  latitude: p.latitude,
  longitude: p.longitude,
  altitude: p.altitude ?? null,
  speed: p.speed ?? null,
  accuracy: null,
  altitudeAccuracy: null,
  timestamp: p.timestamp,
});

/** A drive's ferry and tunnel crossings and its finished pauses, oldest first. */
export const driveGaps = (drive) =>
  [
    ...(drive.seaCrossings ?? []),
    ...(drive.stats.pauses ?? []).filter((p) => p.endedAt !== null && p.from),
  ].sort((a, b) => a.startedAt - b.startedAt);

/**
 * What a drive's line leaves out: its gaps, plus each rest stop
 * ({ kind: 'stop', startedAt, endedAt }). A stop's fixes are walking or GPS
 * drift while parked, so the line runs straight from arriving to driving off.
 * For drawing and charts; the timeline uses driveGaps.
 */
export const routeGaps = (drive) => [
  ...driveGaps(drive),
  ...(drive.stats.stops ?? []).map((s) => ({
    kind: 'stop',
    startedAt: s.startedAt,
    endedAt: s.endedAt,
  })),
];

/** Points outside the rest stops in `gaps` (a stop's first and last fixes stay), and the other gaps. */
function leaveOutStops(points, gaps) {
  const stops = gaps.filter((g) => g.kind === 'stop');
  if (stops.length === 0) return [points, gaps];
  return [
    points.filter((p) => !stops.some((s) => p.timestamp > s.startedAt && p.timestamp < s.endedAt)),
    gaps.filter((g) => g.kind !== 'stop'),
  ];
}

/** Whether a crossing overlaps one of the gaps (a pause over the ferry already covers it). */
export const overlapsAny = (c, gaps) =>
  gaps.some((g) => c.startedAt < g.endedAt && g.startedAt < c.endedAt);

/**
 * A drive's stats worked out again from its points, jumping over its gaps
 * (crossings and pauses, oldest first). A pause shorter than a break doesn't
 * reset the break timer.
 */
export function statsWithoutCrossings(points, crossings) {
  let stats = createTripStats();
  let i = 0;
  for (const p of points) {
    const c = crossings[i];
    if (c && p.timestamp > c.startedAt && p.timestamp < c.endedAt) continue;
    if (c && p.timestamp >= c.endedAt) {
      const resetStint =
        c.kind !== 'pause' ||
        (c.resumedAt ?? c.endedAt) - (c.pausedAt ?? c.startedAt) >= BREAK_MIN_MS;
      stats = skipTo(stats, asFix(p), { resetStint });
      i++;
    } else {
      stats = applyFix(stats, asFix(p));
    }
  }
  return finalizeStats(stats);
}

/**
 * A route split at its crossings, for drawing: [{ coordinates, crossing }],
 * where `crossing` is null for driving and 'ferry' / 'tunnel' for a crossing.
 * Rest stops among the gaps (routeGaps) are left out without a split.
 * Works on thinned routes too: each crossing starts and ends at its own fixes.
 */
export function splitAtCrossings(allPoints, gaps = []) {
  const [points, crossings] = leaveOutStops(allPoints, gaps);
  const parts = [];
  let rest = points;
  for (const c of crossings) {
    const from = { ...c.from, timestamp: c.startedAt };
    const to = { ...c.to, timestamp: c.endedAt };
    const during = rest.filter((p) => p.timestamp > c.startedAt && p.timestamp < c.endedAt);
    parts.push({
      coordinates: [...rest.filter((p) => p.timestamp < c.startedAt), from],
      crossing: null,
    });
    // A tunnel has no fixes inside; draw it straight.
    parts.push({ coordinates: [from, ...during, to], crossing: c.kind });
    rest = [to, ...rest.filter((p) => p.timestamp > c.endedAt)];
  }
  parts.push({ coordinates: rest, crossing: null });
  return parts.filter((p) => p.coordinates.length > 1);
}

/**
 * Points with each crossing's fixes left out, for charts: the first fix after a
 * crossing has `afterCrossing: true`, so no distance is counted across it.
 */
export function withoutCrossings(allPoints, gaps = []) {
  const [points, crossings] = leaveOutStops(allPoints, gaps);
  if (crossings.length === 0) return points;
  return points
    .filter((p) => !crossings.some((c) => p.timestamp > c.startedAt && p.timestamp < c.endedAt))
    .map((p) =>
      crossings.some((c) => p.timestamp === c.endedAt) ? { ...p, afterCrossing: true } : p
    );
}

/** Map segments for one route in `color`: driving solid, crossings `dotted`. */
export const routeSegments = (key, points, crossings, color) =>
  splitAtCrossings(points, crossings).map((part, i) => ({
    key: `${key}-${i}`,
    coordinates: part.coordinates,
    color,
    dotted: part.crossing !== null,
  }));

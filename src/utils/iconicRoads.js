// Iconic Roads: the bundled road list and the offline check of a drive against
// it. Pure functions over drive points ({ latitude, longitude, timestamp },
// oldest first) and the road lines in src/data/iconicRoads.json ([lat, lng],
// about 40 m apart).
import data from '../data/iconicRoads.json';

/** Drive points within this distance of the road's line count as on the road. */
const ON_ROAD_M = 50;
/** A drive starts or ends "at" a road when within this distance of either end. */
const GATE_M = 300;
/** Share of the road's line that must be driven for a completion. */
const MIN_COVERAGE = 0.9;
/** Leaving the road for longer than this (driving distance) ends the attempt. */
const MAX_OFF_ROAD_M = 1000;
/** Gaps between matched points up to this many line points are filled in (GPS is sparser at speed). */
const MAX_FILL = 12;

export const ICONIC_ROADS = data.roads;
export const ROADS_ATTRIBUTION = data.attribution;
/** Changes whenever the list changes, so past drives are checked again. */
export const ROADS_VERSION = ICONIC_ROADS.map((r) => `${r.id}:${r.line.length}`).join('|');

const byId = new Map(ICONIC_ROADS.map((r) => [r.id, r]));
export const getRoad = (id) => byId.get(id) ?? null;

const BRITAIN = new Set(['England', 'Scotland', 'Wales']);
/** True for a road in England, Scotland or Wales; the rest are "Europe". */
export const inBritain = (road) => BRITAIN.has(road.country);

const ukCount = ICONIC_ROADS.filter(inBritain).length;
/** What the list is, for Home and the Roads page. */
export const ROADS_INTRO = `The UK's top ${ukCount} driving roads and Europe's top ${ICONIC_ROADS.length - ukCount}, waiting to be driven.`;

const toRad = (d) => (d * Math.PI) / 180;

/** Fast flat-earth distance in metres; accurate enough over a few hundred metres. */
function distM(lat1, lng1, lat2, lng2) {
  const x = toRad(lng2 - lng1) * Math.cos(toRad((lat1 + lat2) / 2));
  const y = toRad(lat2 - lat1);
  return Math.sqrt(x * x + y * y) * 6371000;
}

const bboxCache = new Map();
/** Road bounding box, padded by `GATE_M`. */
function bboxOf(road) {
  if (!bboxCache.has(road.id)) {
    const lats = road.line.map((p) => p[0]);
    const lngs = road.line.map((p) => p[1]);
    const padLat = GATE_M / 111000;
    const padLng = padLat / Math.cos(toRad(lats[0]));
    bboxCache.set(road.id, {
      minLat: Math.min(...lats) - padLat,
      maxLat: Math.max(...lats) + padLat,
      minLng: Math.min(...lngs) - padLng,
      maxLng: Math.max(...lngs) + padLng,
    });
  }
  return bboxCache.get(road.id);
}

const inBox = (b, p) =>
  p.latitude >= b.minLat &&
  p.latitude <= b.maxLat &&
  p.longitude >= b.minLng &&
  p.longitude <= b.maxLng;

/** Index of the nearest line point within ON_ROAD_M of `p`, or -1. */
function nearestIndex(line, p) {
  let best = -1;
  let bestD = ON_ROAD_M;
  for (let i = 0; i < line.length; i++) {
    const d = distM(p.latitude, p.longitude, line[i][0], line[i][1]);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Times the drive completed `line` start → end: it passes the start, follows
 * the line in order over at least MIN_COVERAGE of it, and reaches the end.
 * Several passes in one drive (e.g. two laps) each count.
 */
function passesAlong(line, points) {
  const n = line.length;
  const gate = Math.max(1, Math.round(ON_ROAD_M / 40)); // line points within ~50 m of an end
  const found = [];
  let run = null; // { covered: Set, last, offRoadM, startedAt }
  let prev = null;
  for (const p of points) {
    const step = prev ? distM(prev.latitude, prev.longitude, p.latitude, p.longitude) : 0;
    prev = p;
    const i = nearestIndex(line, p);
    if (i >= 0 && i <= gate) {
      // At (or back at) the start: begin a fresh attempt.
      run = { covered: new Set([i]), last: i, offRoadM: 0, startedAt: p.timestamp };
      continue;
    }
    if (!run) continue;
    if (i < 0) {
      run.offRoadM += step;
      if (run.offRoadM > MAX_OFF_ROAD_M) run = null;
      continue;
    }
    run.offRoadM = 0;
    if (i > run.last) {
      if (i - run.last <= MAX_FILL) for (let k = run.last + 1; k < i; k++) run.covered.add(k);
      run.last = i;
    }
    run.covered.add(i);
    if (i >= n - 1 - gate) {
      if (run.covered.size / n >= MIN_COVERAGE) {
        found.push({ startedAt: run.startedAt, completedAt: p.timestamp });
      }
      run = null;
    }
  }
  return found;
}

/**
 * Iconic Roads completed on a drive: [{ roadId, completedAt }] in time order.
 * Every road counts in either direction.
 */
export function detectCompletions(points) {
  if (points.length < 2) return [];
  const results = [];
  for (const road of ICONIC_ROADS) {
    const box = bboxOf(road);
    const near = points.filter((p) => inBox(box, p));
    if (near.length < 2) continue;
    const passes = [...passesAlong(road.line, near)];
    passes.push(...passesAlong([...road.line].reverse(), near));
    for (const pass of passes) results.push({ roadId: road.id, completedAt: pass.completedAt });
  }
  return results.sort((a, b) => a.completedAt - b.completedAt);
}

const nearGate = (road, p) =>
  [road.line[0], road.line.at(-1)].some(
    (g) => distM(p.latitude, p.longitude, g[0], g[1]) <= GATE_M
  );

/**
 * Whether a drive's times should be hidden: it starts and ends at the gates of
 * an Iconic Road it completed, so its time would effectively be the road's time.
 */
export function shouldHideTimes(points, completions) {
  if (points.length < 2 || completions.length === 0) return false;
  const first = points[0];
  const last = points.at(-1);
  return completions.some(({ roadId }) => {
    const road = getRoad(roadId);
    return road && nearGate(road, first) && nearGate(road, last);
  });
}

/** Completions grouped per road in first-seen order: [{ road, count, times: [ms] }]. */
export function groupByRoad(completions) {
  const groups = new Map();
  for (const c of completions) {
    const road = getRoad(c.roadId);
    if (!road) continue;
    const g = groups.get(c.roadId) ?? { road, count: 0, times: [] };
    g.count += 1;
    g.times.push(c.completedAt);
    groups.set(c.roadId, g);
  }
  return [...groups.values()];
}

/** "Completed", or "Completed 4 times". */
export const completedLabel = (count) => (count > 1 ? `Completed ${count} times` : 'Completed');

/** "Day 3", "Days 2–3" or "Days 1, 3" for a set of day numbers. */
export function dayLabel(dayNumbers) {
  const days = [...new Set(dayNumbers)].sort((a, b) => a - b);
  if (days.length === 1) return `Day ${days[0]}`;
  const consecutive = days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  return consecutive ? `Days ${days[0]}–${days.at(-1)}` : `Days ${days.join(', ')}`;
}

/**
 * How twisty a road is, from the total turning along its line per km:
 * "Gentle", "Twisty" or "Very twisty" (Glen Coe ~80°/km, Bealach na Bà ~280°/km).
 */
export function bendsLabel(road) {
  const line = road.line;
  const heading = (a, b) =>
    Math.atan2((b[1] - a[1]) * Math.cos(toRad(a[0])), b[0] - a[0]) / (Math.PI / 180);
  let turn = 0;
  for (let i = 2; i < line.length; i++) {
    const t = heading(line[i - 1], line[i]) - heading(line[i - 2], line[i - 1]);
    turn += Math.abs(((t + 540) % 360) - 180);
  }
  const perKm = turn / (road.lengthM / 1000);
  if (perKm < 120) return 'Gentle';
  return perKm < 220 ? 'Twisty' : 'Very twisty';
}

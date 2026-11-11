// The trip planner's rules, as pure functions over a plan from planStorage:
// { id, name, startDate, routeId, createdAt,
//   drives: [{ id, position, start, stops: [{ id, position, name, latitude,
//              longitude, source, roadId, reversed }] }] }
// A drive's `start` is { name, latitude, longitude } when set by hand ("Start
// somewhere else"), or null: where the drive before ends, or for Drive 1,
// wherever the phone is when it starts. A stop with `roadId` is an Iconic Road
// driven through, not a place to stop.
import { haversineDistance } from './geoMath';
import { ICONIC_ROADS, getRoad } from './iconicRoads';
import { roadGuidePoints } from './navLinks';

/** The end of an Iconic Road stop, in the direction it's driven. */
function roadEnd(stop) {
  const road = getRoad(stop.roadId);
  if (!road) return null;
  const [latitude, longitude] = stop.reversed ? road.line[0] : road.line.at(-1);
  return { name: road.name, latitude, longitude };
}

/** Where a stop leaves you: a place itself, or the far end of an Iconic Road. */
function endOfStop(stop) {
  if (stop.roadId) return roadEnd(stop);
  return { name: stop.name, latitude: stop.latitude, longitude: stop.longitude };
}

/**
 * Where drive `index` (from 0) starts: { name, latitude, longitude, linked }, with
 * `linked` true when it's where the drive before ends. Null for a Drive 1 with
 * no start set (it starts wherever the phone is), or after a drive with no stops.
 */
export function driveStart(plan, index) {
  const drive = plan.drives[index];
  if (drive.start) return { ...drive.start, linked: false };
  if (index === 0) return null;
  const before = plan.drives[index - 1];
  const last = before.stops.at(-1);
  if (last) {
    const end = endOfStop(last);
    return end ? { ...end, linked: true } : null;
  }
  const start = driveStart(plan, index - 1);
  return start ? { ...start, linked: true } : null;
}

/**
 * The points to hand to the sat nav for drive `index`, in driving order, the
 * finish last (see navLinks.js). The route starts from where the phone is, so
 * the drive's own start is left out unless it's somewhere else. An Iconic Road
 * becomes one guide point; a road that ends the drive adds its far end as the
 * finish. A stop picked from search carries its name, so the sat nav shows it.
 */
export function drivePoints(plan, index, { fromStart = false } = {}) {
  const drive = plan.drives[index];
  const points = [];
  const start = fromStart ? driveStart(plan, index) : null;
  if (start) points.push({ latitude: start.latitude, longitude: start.longitude, name: start.name });
  for (const stop of drive.stops) {
    if (stop.roadId) {
      const road = getRoad(stop.roadId);
      if (road) points.push(...roadGuidePoints(road, 1, { reversed: stop.reversed }));
    } else {
      points.push({
        latitude: stop.latitude,
        longitude: stop.longitude,
        ...(stop.source === 'search' && stop.name ? { name: stop.name } : {}),
      });
    }
  }
  const last = drive.stops.at(-1);
  if (last?.roadId) {
    const end = roadEnd(last);
    if (end) points.push({ latitude: end.latitude, longitude: end.longitude });
  }
  return points;
}

/**
 * The Planned tab's groups: { comingUp, someday, done }. Done is a plan whose
 * every drive has been driven (`driven`: the planned drive ids with a
 * recording); Coming up has a start date, soonest first; Someday has none,
 * newest first.
 */
export function groupPlans(plans, driven) {
  const isDone = (p) => p.drives.length > 0 && p.drives.every((d) => driven.has(d.id));
  const open = plans.filter((p) => !isDone(p));
  return {
    comingUp: open.filter((p) => p.startDate).sort((a, b) => a.startDate.localeCompare(b.startDate)),
    someday: open.filter((p) => !p.startDate).sort((a, b) => b.createdAt - a.createdAt),
    done: plans.filter(isDone),
  };
}

/** A 'YYYY-MM-DD' start date as a local Date. */
export const dateOf = (startDate) => {
  const [y, m, d] = startDate.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** A local Date as 'YYYY-MM-DD'. */
export const dateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** "14 MAY 2027 · 7 DRIVES", or "7 DRIVES" with no date: the blue line above a plan's name. */
export function planKicker(plan) {
  const n = plan.drives.length;
  const drives = `${n} ${n === 1 ? 'DRIVE' : 'DRIVES'}`;
  if (!plan.startDate) return drives;
  const date = dateOf(plan.startDate)
    .toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    .toUpperCase();
  return `${date} · ${drives}`;
}

/** { stops, roads }: a plan's (or one drive's) places and Iconic Roads. */
export function stopCounts(drives) {
  const all = drives.flatMap((d) => d.stops);
  return { stops: all.filter((s) => !s.roadId).length, roads: all.filter((s) => s.roadId).length };
}

/**
 * Each drive's planned outline for a map or thumbnail: [{ index, coordinates }],
 * from its start (when known) through its stops, an Iconic Road along its own
 * line. Straight between stops: real roads come with leg routing.
 */
export function planOutline(plan) {
  return plan.drives.map((drive, index) => {
    const coordinates = [];
    const start = driveStart(plan, index);
    if (start) coordinates.push({ latitude: start.latitude, longitude: start.longitude });
    for (const stop of drive.stops) {
      const road = stop.roadId ? getRoad(stop.roadId) : null;
      if (road) {
        const line = stop.reversed ? [...road.line].reverse() : road.line;
        coordinates.push(...line.map(([latitude, longitude]) => ({ latitude, longitude })));
      } else {
        coordinates.push({ latitude: stop.latitude, longitude: stop.longitude });
      }
    }
    return { index, coordinates };
  });
}

/**
 * Whether an Iconic Road added after `from` ({ latitude, longitude }, where the
 * drive has got to) is driven from its finish: true when its finish is nearer.
 */
export function roadReversedFrom(road, from) {
  if (!from) return false;
  const dist = ([la, lo]) => (la - from.latitude) ** 2 + ((lo - from.longitude) * Math.cos((la * Math.PI) / 180)) ** 2;
  return dist(road.line.at(-1)) < dist(road.line[0]);
}

/** Where drive `index` has got to after its stops so far: the end of its last stop, or its start. */
export function driveReach(plan, index) {
  const last = plan.drives[index].stops.at(-1);
  return last ? endOfStop(last) : driveStart(plan, index);
}

/**
 * Iconic Roads to suggest for drive `index` (from 0): those within `withinM`
 * of where the drive goes so far (its start, stops and roads), nearest first:
 * [{ road, metres, inPlan }], `inPlan` when any drive of the plan has it. A
 * drive with nowhere yet (Drive 1, nothing added) gets none.
 */
export function roadsNear(plan, index, { withinM = 80000, limit = 4 } = {}) {
  const here = planOutline(plan)[index].coordinates;
  if (here.length === 0) return [];
  const inPlan = new Set(plan.drives.flatMap((d) => d.stops.map((s) => s.roadId).filter(Boolean)));
  return ICONIC_ROADS.map((road) => {
    let metres = Infinity;
    for (const [latitude, longitude] of road.line) {
      for (const point of here) metres = Math.min(metres, haversineDistance(point, { latitude, longitude }));
    }
    return { road, metres, inPlan: inPlan.has(road.id) };
  })
    .filter((r) => r.metres <= withinM)
    .sort((a, b) => a.metres - b.metres)
    .slice(0, limit);
}

/**
 * The stop for an Iconic Road added at the end of drive `index`: driven from
 * whichever end is nearer where the drive has got to.
 */
export function roadStop(plan, index, road) {
  const [latitude, longitude] = road.line[0];
  return {
    name: road.name,
    latitude,
    longitude,
    source: 'pin',
    roadId: road.id,
    reversed: roadReversedFrom(road, driveReach(plan, index)),
  };
}

/**
 * Drive `index`'s map markers, as RouteMap takes them less their colour: its
 * start, a ring per place, and the finish. An Iconic Road has no marker; one
 * that ends the drive puts the finish at its far end.
 */
export function driveMarkers(plan, index) {
  const drive = plan.drives[index];
  const start = driveStart(plan, index);
  const finish = drive.stops.length ? driveReach(plan, index) : null;
  const places = drive.stops.filter((s) => !s.roadId);
  // The last place is the finish, unless an Iconic Road comes after it.
  if (finish && !drive.stops.at(-1).roadId) places.pop();
  return [
    ...(start ? [{ key: 'start', kind: 'start', coordinate: start, title: start.name ?? 'Start' }] : []),
    ...places.map((s) => ({ key: `stop-${s.id}`, kind: 'stop', coordinate: s, title: s.name ?? 'Dropped pin' })),
    ...(finish ? [{ key: 'finish', kind: 'finish', coordinate: finish, title: finish.name ?? 'Finish' }] : []),
  ];
}

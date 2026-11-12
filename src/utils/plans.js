// The trip planner's rules, as pure functions over a plan from planStorage:
// { id, name, startDate, routeId, roundTrip, createdAt, setOff,
//   drives: [{ id, position, start, stops: [{ id, position, name, latitude,
//              longitude, source, roadId, reversed }] }] }
// A drive's `start` is { name, latitude, longitude } when set by hand ("Start
// somewhere else"), or null: where the drive before ends, or for Drive 1,
// wherever the phone is when it starts. A stop with `roadId` is an Iconic Road
// driven through, not a place to stop. A round trip's last drive ends back
// where Drive 1 starts (withWayBack); `setOff` is where Drive 1 was recorded
// setting off, or null (getPlan only).
import { haversineDistance } from './geoMath';
import { ICONIC_ROADS, getRoad } from './iconicRoads';
import { NAV_APPS, navLinks, roadGuidePoints, takesWholeDrive } from './navLinks';

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

/** "14 MAY 2027 · 7 DAYS", or "7 DAYS" with no date: the blue line above a plan's name. */
export function planKicker(plan) {
  const n = plan.drives.length;
  const drives = `${n} ${n === 1 ? 'DAY' : 'DAYS'}`;
  if (!plan.startDate) return drives;
  const date = dateOf(plan.startDate)
    .toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    .toUpperCase();
  return `${date} · ${drives}`;
}

/**
 * { stops, roads }: the places and Iconic Roads on a plan, or on its day `index`.
 * Where it ends isn't a stop: a day's finish (its stay, or the trip's end), or
 * on the whole trip just the trip's end, its stays being places on the way. A
 * round trip ends back at the start, so its last place is a stop; so is a
 * place before an Iconic Road a day ends on.
 */
export function stopCounts(plan, index = null) {
  const drives = index === null ? plan.drives : [plan.drives[index]];
  const lastDay = index === null || index === plan.drives.length - 1;
  let stops = 0;
  drives.forEach((d) => {
    const ends = d === drives.at(-1);
    const places = d.stops.filter((s) => !s.roadId).length;
    const finish = ends && d.stops.at(-1) && !d.stops.at(-1).roadId && !(lastDay && plan.roundTrip);
    stops += finish ? places - 1 : places;
  });
  return { stops, roads: drives.flatMap((d) => d.stops).filter((s) => s.roadId).length };
}

/**
 * Each drive's planned outline for a map or thumbnail: [{ index, coordinates }],
 * from its start (when known) through its stops, an Iconic Road along its own
 * line. Straight between stops: the plan card thumbnail, and the map until
 * the road route comes back (hooks/usePlanRoutes.js).
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
  // A round trip of one drive ends where it starts: one dot for both.
  const loop = drive.stops.at(-1)?.home && index === 0;
  return [
    ...(start && !loop ? [{ key: 'start', kind: 'start', coordinate: start, title: start.name ?? 'Start' }] : []),
    ...places.map((s) => ({ key: `stop-${s.id}`, kind: 'stop', coordinate: s, title: s.name ?? 'Dropped pin' })),
    ...(finish ? [{ key: 'finish', kind: 'finish', coordinate: finish, title: finish.name ?? 'Finish' }] : []),
  ];
}

/**
 * The plan for its map: a Drive 1 with no start set starts at `here` (where the
 * phone is, { latitude, longitude }), so its line runs from there. Unchanged
 * without `here`. The timeline keeps "Your location".
 */
export function fromHere(plan, here) {
  const [first, ...rest] = plan.drives;
  if (!here || !first || first.start) return plan;
  return { ...plan, drives: [{ ...first, start: { name: 'Your location', ...here } }, ...rest] };
}

/**
 * A round trip with its way back as the last drive's final stop: { id: 'home',
 * home: true }, at Drive 1's start as set, else where Drive 1 was recorded
 * setting off (`setOff`), else `here` (the phone, before setting off). One way,
 * or with nowhere to go back to, the plan as it is. A lone drive needs a stop
 * first; a later drive goes back even with none (Drive 3: home).
 */
export function withWayBack(plan, here) {
  const first = plan.drives[0];
  const last = plan.drives.at(-1);
  if (!plan.roundTrip || !first) return plan;
  const to = first.start ?? plan.setOff ?? here;
  if (!to || (plan.drives.length === 1 && last.stops.length === 0)) return plan;
  const home = {
    id: 'home',
    home: true,
    name: first.start?.name ?? 'Where you set off',
    latitude: to.latitude,
    longitude: to.longitude,
    source: 'pin', // sent to the sat nav as a point, not a name
    roadId: null,
    reversed: false,
  };
  return { ...plan, drives: [...plan.drives.slice(0, -1), { ...last, stops: [...last.stops, home] }] };
}

/** The plan as its map draws it: the way back added, and Drive 1 from where it set off or where the phone is. */
export function mapPlanOf(plan, here) {
  return fromHere(withWayBack(plan, here), plan.setOff ?? here);
}

/**
 * What to ask the routing service for drive `index`: { points, legStops }, or
 * null with nowhere to go. `points` ([{ latitude, longitude, via }]) run from
 * the start through each stop; an Iconic Road is driven through (its start,
 * middle and end as `via` points), ending the drive at its far end if it's
 * last. `legStops` gives, for each leg the route comes back with, the index of
 * the stop it arrives at. Pass the map's plan (fromHere) for Drive 1 to start
 * where the phone is.
 */
export function driveRoute(plan, index) {
  const drive = plan.drives[index];
  const points = [];
  const owners = [];
  const add = (latitude, longitude, via, owner) => {
    points.push({ latitude, longitude, via });
    owners.push(owner);
  };
  const start = driveStart(plan, index);
  if (start) add(start.latitude, start.longitude, false, null);
  drive.stops.forEach((stop, i) => {
    const road = stop.roadId ? getRoad(stop.roadId) : null;
    if (stop.roadId && !road) return;
    if (!road) {
      add(stop.latitude, stop.longitude, false, i);
      return;
    }
    const line = stop.reversed ? [...road.line].reverse() : road.line;
    const [middle] = roadGuidePoints(road, 1, { reversed: stop.reversed });
    add(line[0][0], line[0][1], true, null);
    add(middle.latitude, middle.longitude, true, null);
    const last = i === drive.stops.length - 1;
    add(line.at(-1)[0], line.at(-1)[1], !last, last ? i : null);
  });
  const legStops = owners.slice(1).filter((owner, k) => !points[k + 1].via);
  if (points.length < 2 || legStops.length === 0) return null;
  // The first point is where the route starts, whatever it is.
  points[0] = { ...points[0], via: false };
  return { points, legStops };
}

/**
 * The days re-formed around their stays after a stop is dragged on All. `days`
 * is each day's stop ids in order, `order` every stop id as dropped. Each day
 * but the last ends at a stay, its last stop: a stay ends its day wherever it's
 * dragged, so the stops between two stays make a day. A day with no stops
 * keeps its place after the stay before it. Returns each day's stop ids, as
 * many days as before.
 */
export function regroupDays(days, order) {
  const last = days.length - 1;
  // Each stay, and how many empty days follow it (not the last day).
  const emptiesAfter = new Map();
  days.forEach((ids, k) => {
    if (k === last || ids.length === 0) return;
    let empties = 0;
    while (k + 1 + empties < last && days[k + 1 + empties].length === 0) empties += 1;
    emptiesAfter.set(ids.at(-1), empties);
  });
  let leading = 0;
  while (leading < last && days[leading].length === 0) leading += 1;
  const groups = Array.from({ length: leading }, () => []);
  let current = [];
  for (const id of order) {
    current.push(id);
    if (!emptiesAfter.has(id)) continue;
    groups.push(current, ...Array.from({ length: emptiesAfter.get(id) }, () => []));
    current = [];
  }
  groups.push(current);
  return groups;
}

/** How far from a drive's start counts as away from it: the sat nav takes you there first. */
export const AWAY_M = 1000;

/** How close the recorded route must come to a stop (or an Iconic Road's middle or far end) to have passed it. */
export const PASSED_M = 500;

/**
 * How many of drive `index`'s stops are behind you, from `points` (the
 * recording so far, { latitude, longitude }): up to and including the furthest
 * stop the route has come within PASSED_M of. An Iconic Road counts from its
 * middle (the guide point the sat nav was given, so it isn't sent back there)
 * or its far end. Stops skipped on the way count as passed too.
 */
export function stopsPassed(plan, index, points) {
  const { stops } = plan.drives[index];
  // A round trip sets off from where it ends, so the way back only counts
  // once every stop is passed and you're back there now.
  const back = stops.at(-1)?.home ? stops.length - 1 : stops.length;
  const here = points.at(-1);
  const isBack = back < stops.length && !!here && haversineDistance(here, stops[back]) <= PASSED_M;
  for (let i = back - 1; i >= 0; i--) {
    const road = stops[i].roadId ? getRoad(stops[i].roadId) : null;
    const targets = [endOfStop(stops[i]), ...(road ? roadGuidePoints(road, 1) : [])].filter(Boolean);
    if (points.some((p) => targets.some((t) => haversineDistance(p, t) <= PASSED_M))) {
      return i === back - 1 && isBack ? stops.length : i + 1;
    }
  }
  return back === 0 && isBack ? stops.length : 0;
}

/** "Fort Augustus", "Fort Augustus and Eilean Donan", "A, B and C". */
const listed = (items) =>
  items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : (items[0] ?? '');

/** What a stop is called on Record: its place name, its Iconic Road's name, or "Dropped pin". */
export function stopName(stop) {
  if (stop.roadId) return getRoad(stop.roadId)?.name ?? 'Iconic Road';
  return stop.name ?? 'Dropped pin';
}

/**
 * How a planned drive is going, for Record's card, from `points` (the
 * recording so far, oldest first): { passed, next, then, at, finished }.
 * `next` is the stop ahead and `then` the one after it (null at the finish);
 * `at` is the stop you're at now (the last passed one, while still within
 * PASSED_M of it), or null; `finished` once the last stop is passed.
 */
export function planProgress(plan, index, points) {
  const { stops } = plan.drives[index];
  const passed = stopsPassed(plan, index, points);
  const here = points.at(-1);
  const lastPassed = passed > 0 ? stops[passed - 1] : null;
  const target = lastPassed ? endOfStop(lastPassed) : null;
  const at = here && target && haversineDistance(here, target) <= PASSED_M ? lastPassed : null;
  return {
    passed,
    next: stops[passed] ?? null,
    then: stops[passed + 1] ?? null,
    at,
    finished: passed === stops.length,
  };
}

/**
 * Handing drive `index` to the sat nav `app` ('google' | 'waze' | 'apple'),
 * from `here` (the phone, or null when unknown): { links, start, awayM,
 * summary }. A drive with a start of its own (or linked to the drive before)
 * goes there first when the phone is AWAY_M or more from it, or when where the
 * phone is isn't known; `awayM` is how far, null when not away or unknown.
 * `wholeDrive` says whether `app` takes it all at once (Waze: one stop at a time).
 * `summary` is the Start drive sheet's line: "Fort William, 2 stops and
 * Bealach na Bà, to Applecross", or for Waze "One stop at a time, starting
 * with Fort Augustus". Once `underway` (Record's Navigate), the start is never
 * gone back to and the first `passed` stops (stopsPassed) are left out; with
 * none left, there are no links.
 */
export function planHandover(plan, index, { here, app, underway = false, passed = 0 }) {
  const start = driveStart(plan, index);
  if (passed > 0) {
    const drives = plan.drives.map((d, i) => (i === index ? { ...d, stops: d.stops.slice(passed) } : d));
    plan = { ...plan, drives };
  }
  const drive = plan.drives[index];
  const metres = start && here ? haversineDistance(here, start) : null;
  const fromStart = !underway && !!start && (metres == null || metres >= AWAY_M);
  const links = drive.stops.length ? navLinks(app, drivePoints(plan, index, { fromStart })) : [];
  const finish = drive.stops.length ? driveReach(plan, index) : null;
  const finishName = finish?.name ?? 'Dropped pin';

  let summary;
  if (!takesWholeDrive(app)) {
    const first = fromStart ? start : drive.stops[0] && (drive.stops[0].roadId ? getRoad(drive.stops[0].roadId) : drive.stops[0]);
    summary = `One stop at a time, starting with ${first?.name ?? 'Dropped pin'}`;
  } else {
    // The last place is the finish, unless an Iconic Road comes after it.
    const places = drive.stops.filter((s) => !s.roadId);
    if (!drive.stops.at(-1)?.roadId) places.pop();
    const roads = drive.stops.filter((s) => s.roadId).map((s) => getRoad(s.roadId)?.name).filter(Boolean);
    // A drive that ends on an Iconic Road ends "on" it rather than "to" its far end.
    const endsOnRoad = !!drive.stops.at(-1)?.roadId && roads.length > 0;
    const lastRoad = endsOnRoad ? roads.pop() : null;
    const parts = [
      ...(fromStart && start?.name ? [start.name] : []),
      ...(places.length ? [`${places.length} ${places.length === 1 ? 'stop' : 'stops'}`] : []),
      ...roads,
    ];
    if (endsOnRoad) summary = parts.length ? `${listed(parts)}, ending on ${lastRoad}` : `Along ${lastRoad}`;
    else if (drive.stops.at(-1)?.home) summary = parts.length ? `${listed(parts)}, then back to the start` : 'Straight back to the start';
    else summary = parts.length ? `${listed(parts)}, to ${finishName}` : `Straight to ${finishName}`;
  }
  return {
    links,
    start,
    awayM: fromStart && metres != null ? metres : null,
    summary,
    wholeDrive: takesWholeDrive(app),
    appName: NAV_APPS[app],
  };
}

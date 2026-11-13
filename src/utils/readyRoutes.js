// Iconic Trips (the planner's Iconic Trips list), bundled from
// scripts/build-routes.mjs: OpenStreetMap lines and miles, so they're ours to
// keep and draw anywhere. A route's drives are copied into a plan as they are
// (plans.route_id says which route); a copied plan can't be changed for now.
import data from '../data/routes.json';
import { formatDistance } from './format';
import { haversineDistance } from './geoMath';
import { getRoad } from './iconicRoads';

/**
 * [{ id, name, country, blurb, metres, drives: [{ start? (Drive 1), stops,
 * legs (metres to each stop), metres, line: [[latitude, longitude]] }] }]
 */
export const READY_ROUTES = data.routes;
export const READY_ROUTES_ATTRIBUTION = data.attribution;

/** "The UK's top 3 road trips and Europe's top 2, waiting to be driven.": the list's intro, like Iconic Roads'. */
const UK = new Set(['England', 'Scotland', 'Wales', 'Northern Ireland']);
export function tripsIntro(routes = READY_ROUTES) {
  const top = (n) => (n === 1 ? 'top road trip' : `top ${n} road trips`);
  const uk = routes.filter((r) => UK.has(r.country)).length;
  const europe = routes.length - uk;
  if (!europe) return `The UK's ${top(uk)}, waiting to be driven.`;
  if (!uk) return `Europe's ${top(europe)}, waiting to be driven.`;
  return `The UK's top ${uk} road trips and Europe's top ${europe}, waiting to be driven.`;
}

export const getReadyRoute = (id) => READY_ROUTES.find((r) => r.id === id) ?? null;

/** The route as a plan's drives, for createPlan: Drive 1's start set, the rest following on. */
export const routePlanDrives = (route) =>
  route.drives.map(({ start, stops }) => ({ start: start ?? null, stops }));

/** The whole route's line, every drive's joined, [{ latitude, longitude }]: a thumbnail's shape. */
export const routeShape = (route) =>
  route.drives.flatMap((d) => d.line.map(([latitude, longitude]) => ({ latitude, longitude })));

/** Where drive `index` starts: Drive 1's own start, or where the drive before ends. */
export function routeDriveFrom(route, index) {
  if (index === 0) return route.drives[0].start?.name ?? 'Start';
  return route.drives[index - 1].stops.at(-1).name;
}

/** Whether the route ends where it starts (within a kilometre), as the NC500 does. */
export function routeLoops(route) {
  const start = route.drives[0].start;
  const end = route.drives.at(-1).stops.at(-1);
  return !!start && haversineDistance(start, end) < 1000;
}

/** "Round trip from Inverness", or "Inverness → Thurso": the line under its name. */
export function routeLabel(route) {
  const from = routeDriveFrom(route, 0);
  return routeLoops(route) ? `Round trip from ${from}` : `${from} → ${route.drives.at(-1).stops.at(-1).name}`;
}

/** The names of the Iconic Roads drive `index` takes in, in order. */
export const routeDriveRoads = (route, index) =>
  route.drives[index].stops
    .filter((s) => s.roadId)
    .map((s) => getRoad(s.roadId)?.name)
    .filter(Boolean);

/**
 * "81 mi · 2 stops": the drive's miles and the places on the way (the finish
 * aside); its Iconic Roads are shown on their own (routeDriveRoads).
 */
export function routeDriveLine(route, index, units) {
  const { stops, metres } = route.drives[index];
  const places = stops.filter((s) => !s.roadId).length - (stops.at(-1).roadId ? 0 : 1);
  return [formatDistance(metres, units, 0), ...(places > 0 ? [`${places} ${places === 1 ? 'stop' : 'stops'}`] : [])].join(
    ' · '
  );
}

/** How close a recording must pass to a point on a route's line to cover it. */
export const ROUTE_ON_M = 200;
/** How much of a route's line must be covered to complete it, as for an Iconic Road. */
export const ROUTE_MIN_COVERAGE = 0.9;

// Grid cells ROUTE_ON_M or more across (0.005° is about 280 m of longitude at 60°N).
const CELL = 0.005;
const cellOf = (lat, lng) => [Math.floor(lat / CELL), Math.floor(lng / CELL)];

/**
 * How much of `line` ([[latitude, longitude]], evenly spaced) `points` (the
 * recordings, { latitude, longitude }) came within ROUTE_ON_M of, from 0 to 1,
 * in any order and across any number of drives.
 */
export function lineCoverage(line, points) {
  if (!line.length) return 0;
  const grid = new Map();
  for (const p of points) {
    const key = cellOf(p.latitude, p.longitude).join(':');
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(p);
  }
  let covered = 0;
  for (const [latitude, longitude] of line) {
    const [i, j] = cellOf(latitude, longitude);
    const here = { latitude, longitude };
    search: for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        for (const p of grid.get(`${i + di}:${j + dj}`) ?? []) {
          if (haversineDistance(here, p) <= ROUTE_ON_M) {
            covered++;
            break search;
          }
        }
      }
    }
  }
  return covered / line.length;
}

/** Whether `points` complete `route`: about 90% of its line covered. */
export const routeCompleted = (route, points) =>
  lineCoverage(route.drives.flatMap((d) => d.line), points) >= ROUTE_MIN_COVERAGE;

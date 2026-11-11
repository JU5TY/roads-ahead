// Builds src/data/routes.json, the bundled ready-made routes (the planner's
// Ready-made routes list). Run by hand when a route changes:
// `node scripts/build-routes.mjs`
//
// Stops are looked up by name with Photon (OpenStreetMap data), near a rough
// position given here, and must land within MAX_LOOKUP_M of it. Each drive is
// routed with the OSRM demo server (OpenStreetMap data), through an Iconic
// Road's start, middle and end. Everything is © OpenStreetMap contributors,
// ODbL, so the lines and miles can be kept and drawn anywhere (unlike
// Google's). No times: OSRM drives single-track Highland roads far too fast,
// so a copied plan gets its times from Google like any other.
// Responses are cached in node_modules/.cache/routes.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const UA = { 'User-Agent': 'road-trip-app-build/0.1 (justwoodford@gmail.com)' };
const OUT = new URL('../src/data/routes.json', import.meta.url);
const ROADS = new URL('../src/data/iconicRoads.json', import.meta.url);
const CACHE = new URL('../node_modules/.cache/routes/', import.meta.url);
const SPACING_M = 150; // distance between stored line points
const MAX_LOOKUP_M = 8000; // a looked-up stop further than this from its rough position is wrong

/**
 * Each drive: `from` (Drive 1 only; later drives start where the one before
 * ends) and `stops` in order, the finish last. A stop is a place, [lat, lng]
 * its rough position, or { road } for an Iconic Road driven through.
 * `byPosition` sends a place to the sat nav by its position rather than its
 * name, where the name alone is too vague.
 */
const ROUTES = [
  {
    id: 'nc500',
    name: 'North Coast 500',
    country: 'Scotland',
    blurb:
      'A loop from Inverness round the far north of Scotland. Single-track roads, beaches and the Bealach na Bà climb',
    drives: [
      {
        from: { name: 'Inverness', at: [57.4778, -4.2247] },
        stops: [
          { name: 'Rogie Falls', at: [57.5875, -4.5945] },
          { name: 'Lochcarron', at: [57.4005, -5.4905] },
          { road: 'bealach-na-ba' },
          { name: 'Applecross', at: [57.4335, -5.815] },
        ],
      },
      {
        stops: [
          { name: 'Shieldaig', at: [57.5246, -5.6475] },
          { name: 'Torridon', at: [57.544, -5.512] },
          { name: 'Gairloch Beach', at: [57.7238, -5.694] },
          { name: 'Inverewe Garden', at: [57.7752, -5.5975] },
          { name: 'Corrieshalloch Gorge', at: [57.7547, -5.0228] },
          { name: 'Ullapool', at: [57.8955, -5.1605] },
        ],
      },
      {
        stops: [
          { name: 'Ardvreck Castle', at: [58.1667, -4.9965] },
          { name: 'Kylesku Bridge', at: [58.2595, -5.0195] },
          { name: 'Durness', at: [58.5675, -4.7465] },
        ],
      },
      {
        stops: [
          { name: 'Smoo Cave', at: [58.5635, -4.7205] },
          { name: 'Tongue', at: [58.478, -4.418], byPosition: true },
          { name: 'Bettyhill', at: [58.5285, -4.2345] },
          { name: 'Dunnet Head', at: [58.6708, -3.377] },
          { name: "John o' Groats", at: [58.643, -3.07] },
        ],
      },
      {
        stops: [
          { name: 'Duncansby Stacks', at: [58.6345, -3.0255] },
          { name: 'Whaligoe Steps', at: [58.3465, -3.1635] },
          { name: 'Dunrobin Castle', at: [57.9817, -3.9465] },
          { name: 'Dornoch', at: [57.8805, -4.0285] },
          { name: 'Inverness', at: [57.4778, -4.2247] },
        ],
      },
    ],
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (n) => Math.round(n * 1e5) / 1e5;

function haversine([lat1, lng1], [lat2, lng2]) {
  const R = 6371008.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** fetch(url) as JSON, cached on disk by URL. */
async function cachedJson(url, isGood) {
  await mkdir(CACHE, { recursive: true });
  const file = new URL(`${createHash('sha1').update(url).digest('hex')}.json`, CACHE);
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {}
  let data;
  for (let attempt = 0; attempt < 5; attempt++) {
    data = await (await fetch(url, { headers: UA })).json();
    if (isGood(data)) break;
    console.warn(`${data.error ?? data.code ?? 'failed'}, retrying in 10 s`);
    await sleep(10000);
  }
  if (!isGood(data)) throw new Error(`${url}: ${JSON.stringify(data).slice(0, 200)}`);
  await writeFile(file, JSON.stringify(data));
  await sleep(1000);
  return data;
}

/** A place's position from Photon, near its rough one: [lat, lng]. */
async function lookUp({ name, at }) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(name)}&lat=${at[0]}&lon=${at[1]}&limit=5`;
  const data = await cachedJson(url, (d) => Array.isArray(d.features));
  const found = data.features
    .map((f) => [f.geometry.coordinates[1], f.geometry.coordinates[0]])
    .find((p) => haversine(p, at) <= MAX_LOOKUP_M);
  if (!found) throw new Error(`${name}: nothing found within ${MAX_LOOKUP_M / 1000} km of ${at}`);
  console.log(`  ${name}: ${Math.round(haversine(found, at))} m from its rough position`);
  return found.map(round);
}

/** Points every SPACING_M along a line. */
function resample(line) {
  const out = [line[0]];
  let carried = 0;
  for (let i = 1; i < line.length; i++) {
    let a = line[i - 1];
    const b = line[i];
    let seg = haversine(a, b);
    while (carried + seg >= SPACING_M) {
      const f = (SPACING_M - carried) / seg;
      a = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      out.push(a);
      seg = haversine(a, b);
      carried = 0;
    }
    carried += seg;
  }
  out.push(line.at(-1));
  return out.map(([lat, lng]) => [round(lat), round(lng)]);
}

/** Route through `points` ([lat, lng]): the line and each leg's metres. */
async function routeThrough(points) {
  const coords = points.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const data = await cachedJson(
    `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&annotations=duration,distance`,
    (d) => d.code === 'Ok'
  );
  const route = data.routes[0];
  const legs = route.legs.map((leg) => leg.distance);
  return { line: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]), legs };
}

const roads = JSON.parse(await readFile(ROADS, 'utf8')).roads;

const routes = [];
for (const route of ROUTES) {
  console.log(route.name);
  const first = route.drives[0].from;
  const start = { name: first.name, latitude: 0, longitude: 0 };
  [start.latitude, start.longitude] = await lookUp(first);
  let from = [start.latitude, start.longitude];
  const drives = [];
  for (const [d, drive] of route.drives.entries()) {
    // Waypoints in order, and for each the stop a leg ending there arrives at (null: on the way).
    const waypoints = [from];
    const arrives = [];
    const stops = [];
    for (const [i, s] of drive.stops.entries()) {
      if (s.road) {
        const road = roads.find((r) => r.id === s.road);
        if (!road) throw new Error(`No Iconic Road ${s.road}`);
        // Driven from whichever end is nearer where the drive has got to.
        const reversed = haversine(road.line.at(-1), waypoints.at(-1)) < haversine(road.line[0], waypoints.at(-1));
        const line = reversed ? [...road.line].reverse() : road.line;
        waypoints.push(line[0], line[Math.round((line.length - 1) / 2)], line.at(-1));
        arrives.push(null, null, i);
        const [latitude, longitude] = road.line[0];
        stops.push({ name: road.name, latitude, longitude, source: 'pin', roadId: road.id, reversed });
      } else {
        const [latitude, longitude] = await lookUp(s);
        waypoints.push([latitude, longitude]);
        arrives.push(i);
        stops.push({ name: s.name, latitude, longitude, source: s.byPosition ? 'pin' : 'search', roadId: null, reversed: false });
      }
    }
    const { line, legs } = await routeThrough(waypoints);
    // Metres to each stop: the legs on the way to it added together.
    const stopLegs = [];
    let sum = 0;
    legs.forEach((metres, k) => {
      sum += metres;
      if (arrives[k] != null) {
        stopLegs.push(Math.round(sum));
        sum = 0;
      }
    });
    const metres = stopLegs.reduce((a, b) => a + b, 0);
    console.log(`  Drive ${d + 1}: ${Math.round(metres / 1609.344)} mi`);
    drives.push({ ...(d === 0 ? { start } : {}), stops, legs: stopLegs, metres, line: resample(line) });
    const last = stops.at(-1);
    from = last.roadId ? waypoints.at(-1) : [last.latitude, last.longitude];
  }
  const metres = drives.reduce((a, d) => a + d.metres, 0);
  console.log(`  ${Math.round(metres / 1609.344)} mi in all`);
  routes.push({ id: route.id, name: route.name, country: route.country, blurb: route.blurb, metres, drives });
}

const attribution = 'Ready-made routes: © OpenStreetMap contributors (ODbL), routed with OSRM';
await writeFile(OUT, `${JSON.stringify({ attribution, routes })}\n`);
console.log(`Wrote ${OUT.pathname}`);

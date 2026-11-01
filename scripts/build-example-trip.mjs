// Builds src/data/exampleTrip.json, the example trip new installs start with
// (src/storage/exampleTrip.js): seven days from London to Edinburgh by the
// North Coast 500. Run by hand when the route changes:
// `node scripts/build-example-trip.mjs`
//
// Routes come from OpenStreetMap data (© OpenStreetMap contributors, ODbL) via
// the OSRM demo server, timed by its per-segment durations. Heights come from
// Open Topo Data's EU-DEM 25 m dataset. Responses are cached in
// node_modules/.cache/example-trip, so a rerun only fetches what changed.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const UA = { 'User-Agent': 'road-trip-app-build/0.1 (justwoodford@gmail.com)' };
const OUT = new URL('../src/data/exampleTrip.json', import.meta.url);
const CACHE = new URL('../node_modules/.cache/example-trip/', import.meta.url);
const INTERVAL_S = 4; // one fix every this many seconds while driving
const ELEVATION_SPACING_M = 200; // heights are fetched this far apart, then interpolated
const ELEVATION_SMOOTHING = 2; // samples either side averaged, as the grid picks up slopes beside the road
// OSRM's demo profile is slow for UK roads (90 km/h on motorways), so its times
// are sped up, but never above 70 mph.
const SPEED_UP = 1.2;
const MAX_SPEED_MPS = 31;

/**
 * One drive per day. `start` is local time on 1 January 2000 plus `day` days.
 * `via` points shape the route; `stop` points are rest stops of `minutes`.
 * Points are [lat, lng].
 */
const DAYS = [
  {
    start: '09:00',
    from: 'London',
    to: 'Keswick',
    points: [
      { at: [51.5308, -0.1238] },
      { stop: 'Ladybower Reservoir', at: [53.3758, -1.7065], minutes: 20 },
      { via: 'Glossop', at: [53.444, -1.94] },
      { stop: 'Tebay Services', at: [54.4462, -2.6025], minutes: 40 },
      { at: [54.601, -3.136] },
    ],
  },
  {
    start: '09:00',
    from: 'Keswick',
    to: 'Fort William',
    crossings: [null, 'Gretna'],
    points: [
      { at: [54.601, -3.136] },
      { stop: 'Gretna Green', at: [55.0005, -3.064], minutes: 15 },
      { stop: 'Luss', at: [56.101, -4.638], minutes: 45 },
      { stop: 'Three Sisters, Glen Coe', at: [56.6698, -5.0029], minutes: 20 },
      { at: [56.8198, -5.1052] },
    ],
  },
  {
    start: '08:45',
    from: 'Fort William',
    to: 'Applecross',
    points: [
      { at: [56.8198, -5.1052] },
      { stop: 'Fort Augustus', at: [57.145, -4.68], minutes: 30 },
      { stop: 'Inverness', at: [57.4778, -4.2247], minutes: 50 },
      { stop: 'Bealach na Bà viewpoint', at: [57.41613, -5.70574], minutes: 25 },
      { at: [57.433, -5.813] },
    ],
  },
  {
    start: '09:30',
    from: 'Applecross',
    to: 'Ullapool',
    points: [
      { at: [57.433, -5.813] },
      { via: 'Applecross coast road', at: [57.533, -5.827] },
      { stop: 'Torridon', at: [57.544, -5.512], minutes: 30 },
      { stop: 'Gairloch Beach', at: [57.7238, -5.694], minutes: 60 },
      { at: [57.896, -5.16] },
    ],
  },
  {
    start: '10:00',
    from: 'Ullapool',
    to: 'Durness',
    points: [
      { at: [57.896, -5.16] },
      { stop: 'Ardvreck Castle', at: [58.1667, -4.9965], minutes: 25 },
      { stop: 'Kylesku Bridge', at: [58.2595, -5.0195], minutes: 30 },
      { at: [58.568, -4.747] },
    ],
  },
  {
    start: '08:30',
    from: 'Durness',
    to: 'Inverness',
    points: [
      { at: [58.568, -4.747] },
      { stop: 'Tongue', at: [58.478, -4.418], minutes: 40 },
      { stop: 'Dunnet Head', at: [58.6708, -3.377], minutes: 25 },
      { stop: "John o' Groats", at: [58.643, -3.07], minutes: 30 },
      { at: [57.4778, -4.2247] },
    ],
  },
  {
    start: '09:30',
    from: 'Inverness',
    to: 'Edinburgh',
    points: [
      { at: [57.4778, -4.2247] },
      { stop: 'Pitlochry', at: [56.704, -3.73], minutes: 45 },
      { stop: 'South Queensferry', at: [55.99, -3.397], minutes: 30 },
      { at: [55.952, -3.189] },
    ],
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

/** One leg: [{ at: [lat, lng], s: seconds from the leg's start }], and where OSRM snapped its ends. */
async function routeLeg(a, b) {
  const coords = [a, b].map(([lat, lng]) => `${lng},${lat}`).join(';');
  const data = await cachedJson(
    `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&annotations=duration,distance`,
    (d) => d.code === 'Ok'
  );
  const route = data.routes[0];
  const line = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  const { duration, distance } = route.legs[0].annotation;
  let s = 0;
  const track = line.map((at, i) => {
    if (i > 0) s += Math.max(duration[i - 1] / SPEED_UP, distance[i - 1] / MAX_SPEED_MPS);
    return { at, s };
  });
  return { track, distanceM: route.distance, snapped: data.waypoints.map((w) => w.name) };
}

/** Position `s` seconds into a timed track, interpolated between its points. */
function positionAt(track, s, from) {
  let i = from;
  while (i < track.length - 2 && track[i + 1].s < s) i++;
  const p = track[i];
  const q = track[i + 1];
  const f = q.s > p.s ? Math.min(1, Math.max(0, (s - p.s) / (q.s - p.s))) : 1;
  return { at: [p.at[0] + (q.at[0] - p.at[0]) * f, p.at[1] + (q.at[1] - p.at[1]) * f], i };
}

/** Fixes every INTERVAL_S along a leg, from its start to its end. */
function sampleLeg(track) {
  const end = track.at(-1).s;
  const out = [];
  let i = 0;
  for (let s = 0; s < end; s += INTERVAL_S) {
    const pos = positionAt(track, s, i);
    i = pos.i;
    out.push(pos.at);
  }
  out.push(track.at(-1).at);
  return out;
}

async function heightsAlong(fixes) {
  // Distance along the drive, and sample points every ELEVATION_SPACING_M.
  const along = [0];
  for (let i = 1; i < fixes.length; i++) along.push(along[i - 1] + haversine(fixes[i - 1], fixes[i]));
  const samples = [];
  for (let i = 0, next = 0; i < fixes.length; i++) {
    if (along[i] >= next || i === fixes.length - 1) {
      samples.push({ d: along[i], at: fixes[i] });
      next = along[i] + ELEVATION_SPACING_M;
    }
  }
  const heights = [];
  for (let i = 0; i < samples.length; i += 100) {
    const batch = samples.slice(i, i + 100);
    const locations = batch.map((p) => `${p.at[0].toFixed(5)},${p.at[1].toFixed(5)}`).join('|');
    const data = await cachedJson(
      `https://api.opentopodata.org/v1/eudem25m?locations=${locations}`,
      (d) => d.status === 'OK'
    );
    // Points over water have no height.
    heights.push(...data.results.map((r) => r.elevation ?? 0));
  }
  const smooth = heights.map((_, i) => {
    const near = heights.slice(Math.max(0, i - ELEVATION_SMOOTHING), i + ELEVATION_SMOOTHING + 1);
    return near.reduce((a, b) => a + b) / near.length;
  });
  // Each fix takes the height interpolated between the samples either side.
  let k = 0;
  return along.map((d) => {
    while (k < samples.length - 2 && samples[k + 1].d < d) k++;
    const a = samples[k];
    const b = samples[k + 1] ?? a;
    const f = b.d > a.d ? Math.min(1, Math.max(0, (d - a.d) / (b.d - a.d))) : 0;
    return Math.round(smooth[k] + ((smooth[k + 1] ?? smooth[k]) - smooth[k]) * f);
  });
}

/** Google encoded polyline (precision 5) of [lat, lng] points. */
function encodePolyline(points) {
  let out = '';
  let prev = [0, 0];
  const encode = (v) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (n >= 0x20) {
      s += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    return s + String.fromCharCode(n + 63);
  };
  for (const p of points) {
    const cur = [Math.round(p[0] * 1e5), Math.round(p[1] * 1e5)];
    out += encode(cur[0] - prev[0]) + encode(cur[1] - prev[1]);
    prev = cur;
  }
  return out;
}

const drives = [];
let totalM = 0;
for (const [day, plan] of DAYS.entries()) {
  const fixes = [];
  const waits = []; // [index of the fix where a stop begins, extra seconds before the next fix]
  let distanceM = 0;
  for (let k = 1; k < plan.points.length; k++) {
    const { track, distanceM: legM, snapped } = await routeLeg(plan.points[k - 1].at, plan.points[k].at);
    distanceM += legM;
    const leg = sampleLeg(track);
    // The leg's first fix is the previous leg's last one.
    fixes.push(...(fixes.length ? leg.slice(1) : leg));
    const target = plan.points[k];
    const straight = haversine(plan.points[k - 1].at, target.at);
    console.log(
      `day ${day + 1} leg ${k}: ${(legM / 1000).toFixed(1)} km (${(legM / straight).toFixed(2)}× straight), ${Math.round(track.at(-1).s / 60)} min → ${target.stop ?? target.via ?? plan.to} [${snapped.at(-1) || '?'}]`
    );
    if (target.stop) {
      // Parked: the phone sends a fix on arrival and the next as the car sets off.
      fixes.push(fixes.at(-1));
      waits.push([fixes.length - 2, target.minutes * 60 - INTERVAL_S]);
    }
  }
  totalM += distanceM;
  const heights = await heightsAlong(fixes);
  const [h, m] = plan.start.split(':').map(Number);
  drives.push({
    startMin: day * 24 * 60 + h * 60 + m,
    places: {
      start: plan.from,
      end: plan.to,
      stops: plan.points.filter((p) => p.stop).map((p) => p.stop),
      ...(plan.crossings ? { crossings: plan.crossings } : {}),
    },
    line: encodePolyline(fixes),
    // Heights as differences from the previous fix, which keeps the file small.
    alt: heights.map((v, i) => (i ? v - heights[i - 1] : v)),
    waits,
  });
  console.log(`day ${day + 1}: ${plan.from} → ${plan.to}, ${(distanceM / 1000).toFixed(0)} km, ${fixes.length} fixes`);
}

await writeFile(
  OUT,
  `${JSON.stringify({
    attribution: 'Route data © OpenStreetMap contributors (ODbL)',
    intervalS: INTERVAL_S,
    drives,
  })}\n`
);
console.log(`wrote ${drives.length} drives, ${(totalM / 1000).toFixed(0)} km, to ${OUT.pathname}`);

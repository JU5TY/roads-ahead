// Builds src/data/iconicRoads.json, the bundled Iconic Roads list.
// Run by hand when roads are added or changed: `node scripts/build-iconic-roads.mjs`
// With `--new`, roads already in the file are kept as they are and only the
// missing ones are built.
//
// Road lines come from OpenStreetMap data (© OpenStreetMap contributors, ODbL):
//   - public roads: routed with the OSRM demo server between two anchors, then
//     trimmed to the steps whose road name/ref matches `match`
//   - the Nordschleife: the raceway ways from the Overpass API (cars can't be
//     routed onto a raceway)
// Heights come from the Open-Meteo elevation API (Copernicus DEM).
import { readFile, writeFile } from 'node:fs/promises';

const UA = { 'User-Agent': 'road-trip-app-build/0.1 (justwoodford@gmail.com)' };
const SPACING_M = 40; // distance between stored line points
const CLIMB_HYSTERESIS_M = 5; // a rise must be this big to count, as for recorded trips
const OUT = new URL('../src/data/iconicRoads.json', import.meta.url);

/** anchors: [lng, lat] points to route through; match: which steps belong to the road. */
const ROADS = [
  {
    id: 'snake-pass',
    name: 'Snake Pass',
    region: 'Peak District',
    country: 'England',
    roadType: 'A road',
    from: 'Glossop',
    to: 'Ladybower',
    blurb:
      'The A57 over the moors between Glossop and Ladybower, climbing to 510 m with long sweeping bends and big views.',
    anchors: [
      [-1.9367, 53.4441],
      [-1.7134, 53.3797],
    ],
    match: /Snake Road/,
  },
  {
    id: 'cat-and-fiddle',
    name: 'Cat and Fiddle',
    region: 'Peak District',
    country: 'England',
    roadType: 'A road',
    from: 'Macclesfield',
    to: 'Buxton',
    blurb:
      'The A537 across the moors from Macclesfield to Buxton, named after the inn near its highest point.',
    anchors: [
      [-2.115, 53.2585],
      [-1.93, 53.256],
    ],
    match: /Buxton New Road|Macclesfield (Main )?Road/,
  },
  {
    id: 'hardknott-wrynose',
    name: 'Hardknott and Wrynose',
    region: 'Lake District',
    country: 'England',
    roadType: 'Single track',
    from: 'Little Langdale',
    to: 'Eskdale',
    blurb:
      "Two back-to-back passes with gradients of 1 in 3, among England's steepest roads. Low gears and patience.",
    anchors: [
      [-3.0466, 54.4229],
      [-3.2733, 54.3965],
    ],
    match: /Wrynose|Hardknott/,
  },
  {
    id: 'bealach-na-ba',
    name: 'Bealach na Bà',
    region: 'Highlands',
    steepestPct: 20, // signposted
    country: 'Scotland',
    roadType: 'Single track',
    from: 'Tornapress',
    to: 'Applecross',
    blurb:
      'A single-track pass with hairpin bends like an Alpine road, climbing from sea level to 626 m. Use the passing places and take it slowly.',
    anchors: [
      [-5.4935, 57.4025],
      [-5.8131, 57.4337],
    ],
    match: /Bealach|C1087/,
  },
  {
    id: 'glen-coe',
    name: 'Glen Coe',
    region: 'Highlands',
    country: 'Scotland',
    roadType: 'A road',
    from: 'Kingshouse',
    to: 'Glencoe village',
    blurb:
      'The A82 from Rannoch Moor down through the glen, beneath the Three Sisters and Buachaille Etive Mòr.',
    anchors: [
      [-4.827, 56.645],
      [-5.103, 56.6825],
    ],
    match: /A82/,
  },
  {
    id: 'black-mountain-pass',
    name: 'Black Mountain Pass',
    region: 'Brecon Beacons',
    country: 'Wales',
    roadType: 'A road',
    from: 'Llangadog',
    to: 'Brynamman',
    blurb:
      'The A4069 over the Black Mountain, with hairpins at Tro Gwcw and open views across the Bannau Brycheiniog.',
    anchors: [
      [-3.889, 51.94],
      [-3.867, 51.815],
    ],
    match: /A4069/,
  },
  {
    id: 'cheddar-gorge',
    name: 'Cheddar Gorge',
    region: 'Somerset',
    country: 'England',
    roadType: 'B road',
    from: 'Cheddar',
    to: 'Black Rock',
    blurb:
      "The B3135 through England's largest gorge, winding between limestone cliffs up to 137 m high.",
    anchors: [
      [-2.7765, 51.2797],
      [-2.718, 51.2984],
    ],
    match: /B3135/,
  },
  {
    id: 'evo-triangle',
    name: 'EVO Triangle',
    region: 'Snowdonia',
    country: 'Wales',
    roadType: 'A and B roads',
    from: 'Pentrefoelas',
    to: 'Pentrefoelas',
    blurb:
      'The A543, B4501 and A5 across the Denbigh Moors and past Llyn Brenig, named after the car magazine that tests on it.',
    anchors: [
      [-3.687, 53.051],
      [-3.533, 53.153],
      [-3.564, 53.027],
      [-3.687, 53.051],
    ],
    match: /A5 |A543|B4501/,
  },
  {
    id: 'llanberis-pass',
    name: 'Llanberis Pass',
    region: 'Snowdonia',
    country: 'Wales',
    roadType: 'A road',
    from: 'Nant Peris',
    to: 'Pen-y-Pass',
    blurb:
      'The A4086 climbing between boulders and rock walls beneath Snowdon to Pen-y-Pass at 359 m.',
    anchors: [
      [-4.093, 53.109],
      [-4.021, 53.0806],
    ],
    match: /A4086/,
  },
  {
    id: 'blakey-ridge',
    name: 'Blakey Ridge',
    region: 'North York Moors',
    country: 'England',
    roadType: 'Minor road',
    from: 'Hutton-le-Hole',
    to: 'Castleton',
    blurb:
      'Across the top of the North York Moors past the Lion Inn, with wide, open bends and views down into Farndale and Rosedale.',
    anchors: [
      [-0.9175, 54.2995],
      [-0.958, 54.406],
      [-0.946, 54.466],
    ],
    match: /Blakey|Stepin Turn/,
  },
  {
    id: 'stelvio-pass',
    name: 'Stelvio Pass',
    region: 'South Tyrol',
    country: 'Italy',
    roadType: 'Mountain pass',
    from: 'Prato allo Stelvio',
    to: 'Bormio',
    blurb:
      'The SS38 climbs 48 numbered hairpins to 2,757 m, the highest paved pass in the Eastern Alps, then drops to Bormio. Usually open June to October.',
    anchors: [
      [10.5916, 46.6197],
      [10.453, 46.5286],
      [10.37, 46.4684],
    ],
    match: /SS38/,
  },
  {
    id: 'transfagarasan',
    name: 'Transfăgărășan',
    region: 'Făgăraș Mountains',
    country: 'Romania',
    roadType: 'Mountain pass',
    from: 'Cârțișoara',
    to: 'Lake Vidraru',
    blurb:
      'The DN7C over the Făgăraș Mountains past Bâlea Lake at over 2,000 m, built in the 1970s as a military route. Usually open July to October.',
    anchors: [
      [24.578, 45.716],
      [24.617, 45.6036],
      [24.6034, 45.4627],
    ],
    match: /DN7C/,
  },
  {
    id: 'grossglockner',
    name: 'Grossglockner High Alpine Road',
    region: 'Hohe Tauern',
    country: 'Austria',
    roadType: 'Toll road',
    from: 'Fusch',
    to: 'Heiligenblut',
    blurb:
      "A toll road with 36 hairpins up to Hochtor at 2,504 m, beneath Austria's highest mountain. Usually open May to early November.",
    anchors: [
      [12.81, 47.207],
      [12.842, 47.083],
      [12.8434, 47.0398],
    ],
    match: /Großglockner/,
  },
  {
    id: 'black-forest-high-road',
    name: 'Black Forest High Road',
    region: 'Black Forest',
    country: 'Germany',
    roadType: 'Main road',
    from: 'Baden-Baden',
    to: 'Kniebis',
    blurb:
      "The B500 along the ridge of the northern Black Forest past the Mummelsee, one of Germany's oldest scenic routes.",
    anchors: [
      [8.2396, 48.7616],
      [8.201, 48.598],
      [8.4111, 48.4636],
    ],
    match: /B 500|Schwarzwaldhochstraße/,
  },
  {
    id: 'furka-pass',
    name: 'Furka Pass',
    region: 'Uri and Valais',
    country: 'Switzerland',
    roadType: 'Mountain pass',
    from: 'Realp',
    to: 'Gletsch',
    blurb:
      "Over 2,429 m past the Rhône Glacier and the Hotel Belvédère, where Goldfinger's car chase was filmed. Usually open June to October.",
    anchors: [
      [8.503, 46.598],
      [8.415, 46.5727],
      [8.3605, 46.5625],
    ],
    match: /Furka/,
  },
  {
    id: 'susten-pass',
    name: 'Susten Pass',
    region: 'Bernese Oberland',
    country: 'Switzerland',
    roadType: 'Mountain pass',
    from: 'Innertkirchen',
    to: 'Wassen',
    blurb:
      'A wide, well-surfaced pass built in the 1940s, climbing to 2,224 m past the Stein Glacier.',
    anchors: [
      [8.2305, 46.7065],
      [8.447, 46.7297],
      [8.5992, 46.7072],
    ],
    match: /Susten/,
  },
  {
    id: 'route-napoleon',
    name: 'Route Napoléon',
    region: 'Provence',
    country: 'France',
    roadType: 'Main road',
    from: 'Grasse',
    to: 'Castellane',
    blurb:
      "The road Napoleon took north after escaping Elba in 1815. The stretch from Grasse to Castellane is its most famous, with long, fast bends through limestone hills.",
    anchors: [
      [6.9236, 43.6589],
      [6.5131, 43.8473],
    ],
    match: /D 6085/,
  },
  {
    id: 'col-de-turini',
    name: 'Col de Turini',
    region: 'Alpes-Maritimes',
    country: 'France',
    roadType: 'Mountain pass',
    from: 'Sospel',
    to: 'La Bollène-Vésubie',
    blurb:
      'Tight hairpins through the forest to 1,607 m, a famous night stage of the Monte Carlo Rally.',
    anchors: [
      [7.4475, 43.8775],
      [7.3914, 43.9775],
      [7.336, 43.9937],
    ],
    match: /Moulinet|D 2566|M 70/,
  },
  {
    id: 'trollstigen',
    name: 'Trollstigen',
    region: 'Møre og Romsdal',
    country: 'Norway',
    roadType: 'Mountain road',
    from: 'Åndalsnes',
    to: 'Valldal',
    blurb:
      'Eleven hairpins up a sheer valley wall beside the Stigfossen waterfall, then over the mountains to Valldal. Usually open late May to October.',
    anchors: [
      [7.719, 62.5205],
      [7.664, 62.454],
      [7.342, 62.3315],
      [7.3029, 62.3191],
      [7.265, 62.298],
    ],
    match: /^63 /,
  },
];

const RING = {
  id: 'nordschleife',
  name: 'Nürburgring Nordschleife',
  region: 'Eifel',
  corners: 73,
  steepestPct: 17, // Ex-Mühle
  routeLabel: 'Tourist lap · clockwise from Döttinger Höhe',
  country: 'Germany',
  roadType: 'Toll road, one way',
  from: 'Döttinger Höhe',
  to: 'Döttinger Höhe',
  blurb:
    'The Green Hell: 73 corners through the Eifel forest. On tourist days it is a public toll road, with laps bought at the Döttinger Höhe gate.',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function haversine([lng1, lat1], [lng2, lat2]) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const lengthOf = (line) => line.reduce((sum, p, i) => (i ? sum + haversine(line[i - 1], p) : 0), 0);

/** Evenly spaced points along a line, keeping both ends. */
function resample(line, spacing) {
  const out = [line[0]];
  let carry = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const seg = haversine(a, b);
    let t = spacing - carry;
    while (t <= seg) {
      const f = t / seg;
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      t += spacing;
    }
    carry = seg - (t - spacing);
  }
  const last = line.at(-1);
  if (haversine(out.at(-1), last) > 1) out.push(last);
  return out;
}

async function routedLine(road) {
  const coords = road.anchors.map((p) => p.join(',')).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=false&steps=true&geometries=geojson`;
  const res = await fetch(url, { headers: UA });
  const data = await res.json();
  if (data.code !== 'Ok') throw new Error(`${road.id}: OSRM ${data.code}`);
  const steps = data.routes[0].legs.flatMap((l) => l.steps);
  const matching = steps
    .map((s, i) => ({ i, s, label: `${s.ref ?? ''} ${s.name ?? ''}` }))
    .filter(({ label }) => road.match.test(label));
  if (matching.length === 0) throw new Error(`${road.id}: no steps match ${road.match}`);
  // Keep the run from the first to the last matching step, so a short unnamed
  // stretch in the middle (a bridge, a junction) doesn't split the road.
  const first = matching[0].i;
  const last = matching.at(-1).i;
  const line = [];
  for (const s of steps.slice(first, last + 1)) {
    for (const p of s.geometry.coordinates) {
      if (!line.length || haversine(line.at(-1), p) > 0.5) line.push(p);
    }
  }
  return line;
}

/**
 * The Nordschleife tourist lap, from the raceway ways in OSM. The track is
 * mapped as one-way pieces per corner (Hatzenbach, Flugplatz, ...) drawn in the
 * driving direction, so following each piece's last node to the next piece's
 * first node walks the lap clockwise. A tourist lap joins at T13 from the car
 * park and leaves after Antoniusbuche, skipping Tiergarten and Hohenrain.
 */
async function ringLine() {
  const query = `[out:json][timeout:90];
way["highway"="raceway"]["access"="private"](50.32,6.90,50.40,7.03);
(._;>;);out body;`;
  const servers = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
  ];
  let data;
  for (const server of servers) {
    try {
      const res = await fetch(server, {
        method: 'POST',
        headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
      break;
    } catch (err) {
      console.warn(`overpass ${server} failed: ${err.message}`);
    }
  }
  if (!data) throw new Error('nordschleife: every Overpass server failed');
  const nodes = new Map(
    data.elements.filter((e) => e.type === 'node').map((n) => [n.id, [n.lon, n.lat]])
  );
  const ways = data.elements.filter((e) => e.type === 'way');
  const byFirstNode = new Map();
  for (const w of ways) byFirstNode.set(w.nodes[0], [...(byFirstNode.get(w.nodes[0]) ?? []), w]);

  let way = ways.find((w) => w.tags.name === 'T13');
  if (!way) throw new Error('nordschleife: no T13 way');
  const ids = [...way.nodes];
  const names = [way.tags.name];
  const seen = new Set([way.id]);
  while (way.tags.name !== 'Antoniusbuche') {
    const next = (byFirstNode.get(way.nodes.at(-1)) ?? []).filter((w) => !seen.has(w.id));
    if (next.length === 0)
      throw new Error(`nordschleife: lap breaks after ${way.tags.name ?? way.id}`);
    // At a fork, stay on the named Nordschleife piece rather than a short link.
    way = next.find((w) => w.tags.name) ?? next[0];
    seen.add(way.id);
    ids.push(...way.nodes.slice(1));
    if (way.tags.name && names.at(-1) !== way.tags.name) names.push(way.tags.name);
  }
  console.log(`nordschleife: ${names.length} sections, ${names[0]} → ${names.at(-1)}`);
  return ids.map((id) => nodes.get(id));
}

async function elevations(points) {
  const out = [];
  for (let i = 0; i < points.length; i += 100) {
    const batch = points.slice(i, i + 100);
    const lat = batch.map((p) => p[1].toFixed(5)).join(',');
    const lng = batch.map((p) => p[0].toFixed(5)).join(',');
    let data;
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await fetch(
        `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`,
        { headers: UA }
      );
      data = await res.json();
      if (data.elevation) break;
      // The free tier counts each point; wait out the per-minute limit.
      console.warn(`elevation: ${data.reason ?? 'failed'}, retrying in 65 s`);
      await sleep(65000);
    }
    if (!data.elevation) throw new Error(`elevation failed: ${JSON.stringify(data)}`);
    out.push(...data.elevation);
    await sleep(1000);
  }
  return out;
}

/**
 * Total ascent: every rise of at least CLIMB_HYSTERESIS_M, like a recorded trip's
 * climb. Each height is first averaged over about 700 m of road (three points
 * either side), as the elevation grid otherwise picks up the slopes beside a
 * road in gorges, on hillsides and on Alpine hairpins.
 */
function climbOf(heights) {
  const smooth = heights.map((_, i) => {
    const near = heights.slice(Math.max(0, i - 3), i + 4);
    return near.reduce((a, b) => a + b) / near.length;
  });
  let climb = 0;
  let ref = smooth[0];
  for (const h of smooth) {
    if (h - ref >= CLIMB_HYSTERESIS_M) climb += h - ref;
    if (Math.abs(h - ref) >= CLIMB_HYSTERESIS_M) ref = h;
  }
  return climb;
}

async function finish(meta, rawLine) {
  const line = resample(rawLine, SPACING_M);
  const heights = await elevations(resample(rawLine, 100));
  const round5 = (p) => [Number(p[1].toFixed(5)), Number(p[0].toFixed(5))]; // stored as [lat, lng]
  const road = {
    ...meta,
    lengthM: Math.round(lengthOf(rawLine)),
    highestM: Math.round(Math.max(...heights)),
    climbM: Math.round(climbOf(heights)),
    line: line.map(round5),
  };
  delete road.anchors;
  delete road.match;
  console.log(
    `${road.id.padEnd(20)} ${(road.lengthM / 1000).toFixed(1).padStart(5)} km  highest ${road.highestM} m  climb ${road.climbM} m  ${road.line.length} pts`
  );
  return road;
}

const existing = new Map(
  process.argv.includes('--new')
    ? JSON.parse(await readFile(OUT, 'utf8')).roads.map((r) => [r.id, r])
    : []
);
/** Writes the roads built so far plus any existing ones not reached yet. */
async function save(roads) {
  const built = new Set(roads.map((r) => r.id));
  const all = [...roads, ...[...existing.values()].filter((r) => !built.has(r.id))];
  await writeFile(
    OUT,
    `${JSON.stringify({ attribution: 'Road data © OpenStreetMap contributors (ODbL)', roads: all }, null, 0)}\n`
  );
  return all.length;
}

const roads = [];
for (const meta of ROADS) {
  if (existing.has(meta.id)) {
    roads.push(existing.get(meta.id));
    continue;
  }
  roads.push(await finish(meta, await routedLine(meta)));
  // Saved after each road, so a run stopped by a rate limit can carry on with --new.
  if (existing.size) await save(roads);
  await sleep(1000);
}
roads.push(existing.get(RING.id) ?? (await finish(RING, await ringLine())));

console.log(`wrote ${await save(roads)} roads to ${OUT.pathname}`);

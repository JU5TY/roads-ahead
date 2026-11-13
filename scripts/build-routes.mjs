// Builds src/data/routes.json, the bundled Iconic Trips (the planner's
// Iconic Trips list). Run by hand when a route changes:
// `node scripts/build-routes.mjs`
//
// Stops are looked up by name with Photon (OpenStreetMap data), near a rough
// position given here, and must land within MAX_LOOKUP_M of it. Each drive is
// routed with the OSRM demo server (OpenStreetMap data), through an Iconic
// Road's start, middle and end. Everything is © OpenStreetMap contributors,
// ODbL, so the lines and miles can be kept and drawn anywhere (unlike
// Google's). No times: OSRM drives single-track Highland roads far too fast,
// so a copied plan gets its times from Google like any other.
// Each trip follows its recognised itinerary (start, finish, overnight towns
// and stops), from whoever runs or ranks it, as noted on it.
// Responses are cached in node_modules/.cache/routes.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { decodeLine, encodeLine } from '../src/utils/polyline.js';

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
 * name, where the name alone is too vague. `search` looks a place up by
 * another name, where OpenStreetMap knows it differently.
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
  // RAC's top 10 UK road trips: Barnstaple to Newquay, 1-2 days, with its stop-offs.
  {
    id: 'atlantic-highway',
    name: 'Atlantic Highway',
    country: 'England',
    blurb: 'The A39 down the north coasts of Devon and Cornwall, from Barnstaple to Newquay. Cliffs, coves and Tintagel Castle',
    drives: [
      {
        from: { name: 'Barnstaple', at: [51.0802, -4.058] },
        stops: [
          { name: 'Bideford', at: [51.0162, -4.2086] },
          { name: 'Bude', at: [50.8296, -4.5439] },
        ],
      },
      {
        stops: [
          { name: 'Tintagel Castle', at: [50.668, -4.759] },
          { name: 'Bedruthan Steps', at: [50.479, -5.03] },
          { name: 'Newquay', at: [50.4155, -5.0732] },
        ],
      },
    ],
  },
  // Cadw's five-day Cambrian Way (linked from Visit Wales): south to north, its overnight towns.
  {
    id: 'cambrian-way',
    name: 'Cambrian Way',
    country: 'Wales',
    blurb: 'The A470, the Dragon’s Spine, from Cardiff Bay to Llandudno. The Brecon Beacons, the Elan Valley and Eryri',
    drives: [
      {
        from: { name: 'Cardiff Bay', at: [51.4637, -3.165] },
        stops: [
          { name: 'Royal Mint Experience', at: [51.5437, -3.3955] },
          { name: 'Rhondda Heritage Park', at: [51.606, -3.357] },
          { name: 'Cyfarthfa Castle', at: [51.755, -3.391] },
          { name: 'Merthyr Tydfil', at: [51.7487, -3.3816] },
        ],
      },
      {
        stops: [
          { name: 'Brecon Mountain Railway', at: [51.788, -3.364] },
          { name: 'Brecon Beacons National Park Visitor Centre', search: 'The Mountain Centre', at: [51.918, -3.484] },
          { name: 'Brecon', at: [51.946, -3.391] },
          { name: 'Llandrindod Wells', at: [52.241, -3.379] },
        ],
      },
      {
        stops: [
          { name: 'Rhayader', at: [52.3016, -3.51] },
          { name: 'Elan Valley Visitor Centre', at: [52.27, -3.57] },
          { name: 'Cwmystwyth', at: [52.357, -3.79] },
          { name: 'Devil’s Bridge', search: "Devil's Bridge", at: [52.377, -3.85] },
          { name: 'Machynlleth', at: [52.591, -3.851] },
        ],
      },
      {
        stops: [
          { name: 'Corris Craft Centre', at: [52.64, -3.825] },
          { name: 'Dolgellau', at: [52.743, -3.885] },
          { name: 'Yr Ysgwrn', at: [52.903, -3.91] },
          { name: 'Plas Brondanw', at: [52.964, -4.058] },
          { name: 'Betws-y-Coed', at: [53.0927, -3.8014] },
        ],
      },
      {
        stops: [
          { name: 'Gwydir Castle', at: [53.134, -3.81] },
          { name: 'Trefriw Woollen Mills', at: [53.152, -3.825] },
          { name: 'Llandudno', at: [53.324, -3.827] },
        ],
      },
    ],
  },
  // Visit Wales's Coastal Way, south to north, as its "long weekend": the 7-day
  // itinerary's stops, staying at two of its overnight towns (Aberystwyth, Portmeirion).
  {
    id: 'coastal-way',
    name: 'Coastal Way',
    country: 'Wales',
    blurb: 'The length of Cardigan Bay, from St Davids to Aberdaron. Beaches, harbour towns and castles',
    drives: [
      {
        from: { name: 'St Davids', at: [51.8818, -5.266] },
        stops: [
          { name: 'Whitesands Bay', at: [51.897, -5.295] },
          { name: 'Melin Tregwynt', search: 'Tregwynt Woollen Mill', at: [51.995, -5.075] },
          { name: 'Pentre Ifan', at: [51.999, -4.77] },
          { name: 'Cardigan', at: [52.083, -4.66] },
          { name: 'Mwnt', at: [52.136, -4.64] },
          { name: 'New Quay', at: [52.214, -4.359] },
          { name: 'Aberaeron', at: [52.243, -4.26] },
          { name: 'Llanerchaeron', at: [52.224, -4.23] },
          { name: 'Aberystwyth', at: [52.4153, -4.0829] },
        ],
      },
      {
        stops: [
          { name: 'Borth', at: [52.489, -4.05] },
          { name: 'Ynyslas', at: [52.525, -4.045] },
          { name: 'Machynlleth', at: [52.591, -3.851] },
          { name: 'Aberdyfi', at: [52.544, -4.045] },
          { name: 'Penmaenpool', at: [52.748, -3.935] },
          { name: 'Barmouth', at: [52.723, -4.056] },
          { name: 'Harlech Castle', at: [52.86, -4.109] },
          { name: 'Portmeirion', at: [52.913, -4.099] },
        ],
      },
      {
        stops: [
          { name: 'Porthmadog', at: [52.928, -4.133] },
          { name: 'Criccieth Castle', at: [52.918, -4.233] },
          { name: 'Llanbedrog', at: [52.855, -4.48] },
          { name: 'Abersoch', at: [52.825, -4.505] },
          { name: 'Plas yn Rhiw', at: [52.829, -4.629] },
          { name: 'Aberdaron', at: [52.805, -4.711] },
        ],
      },
    ],
  },
  // Belfast to Derry; overnights from Discover Northern Ireland's Causeway Coast itinerary.
  {
    id: 'causeway-coastal-route',
    name: 'Causeway Coastal Route',
    country: 'Northern Ireland',
    blurb: 'The Antrim coast from Belfast to Derry. The Glens of Antrim, Carrick-a-Rede and the Giant’s Causeway',
    drives: [
      {
        from: { name: 'Belfast', at: [54.5973, -5.9301] },
        stops: [
          { name: 'Carrickfergus Castle', at: [54.713, -5.806] },
          { name: 'The Gobbins', at: [54.818, -5.702] },
          { name: 'Glenarm', at: [54.968, -5.956] },
        ],
      },
      {
        stops: [
          { name: 'Carnlough', at: [54.993, -5.99] },
          { name: 'Glenariff Forest Park', at: [55.02, -6.115] },
          { name: 'Cushendun', at: [55.124, -6.045] },
          { name: 'Ballycastle', at: [55.204, -6.243] },
        ],
      },
      {
        stops: [
          { name: 'The Dark Hedges', at: [55.134, -6.381] },
          { name: 'Carrick-a-Rede Rope Bridge', at: [55.239, -6.332] },
          { name: 'Ballintoy Harbour', at: [55.244, -6.369] },
          { name: 'Giant’s Causeway', at: [55.2408, -6.5116] },
          { name: 'Dunluce Castle', at: [55.211, -6.579] },
          { name: 'Bushmills', at: [55.205, -6.52] },
        ],
      },
      {
        stops: [
          { name: 'Portstewart Strand', at: [55.17, -6.73] },
          { name: 'Mussenden Temple', at: [55.168, -6.81] },
          { name: 'Derry', at: [54.9966, -7.3086] },
        ],
      },
    ],
  },
  // The official route's four main stages, Thonon-les-Bains to Menton.
  {
    id: 'route-des-grandes-alpes',
    name: 'Route des Grandes Alpes',
    country: 'France',
    blurb: 'Lake Geneva to the Mediterranean over the high passes of the French Alps. The Iseran, the Galibier, the Izoard and the Col de Turini',
    drives: [
      {
        from: { name: 'Thonon-les-Bains', at: [46.3705, 6.4793] },
        stops: [
          { name: 'Col des Gets', at: [46.158, 6.668] },
          { name: 'Cluses', at: [46.06, 6.58] },
          { name: 'Col de la Colombière', at: [45.993, 6.47] },
          { name: 'Col des Aravis', at: [45.873, 6.465] },
          { name: 'Col des Saisies', at: [45.758, 6.533] },
          { name: 'Beaufort', at: [45.719, 6.573] },
          { name: 'Cormet de Roselend', at: [45.689, 6.712] },
          { name: 'Bourg-Saint-Maurice', at: [45.618, 6.769] },
        ],
      },
      {
        stops: [
          { name: 'Val-d’Isère', at: [45.448, 6.98] },
          { name: 'Col de l’Iseran', at: [45.417, 7.031] },
          { name: 'Bonneval-sur-Arc', at: [45.372, 7.048] },
          { name: 'Col du Télégraphe', at: [45.203, 6.445] },
          { name: 'Valloire', at: [45.165, 6.429] },
          { name: 'Col du Galibier', at: [45.064, 6.408] },
          { name: 'Col du Lautaret', at: [45.035, 6.404] },
          { name: 'Briançon', at: [44.899, 6.643] },
        ],
      },
      {
        stops: [
          { name: 'Col d’Izoard', at: [44.82, 6.735] },
          { name: 'Guillestre', at: [44.66, 6.649] },
          { name: 'Col de Vars', at: [44.538, 6.703] },
          { name: 'Barcelonnette', at: [44.387, 6.652] },
          { name: 'Col de la Cayolle', at: [44.26, 6.744] },
          { name: 'Valberg', at: [44.095, 6.931] },
          { name: 'Col de la Couillole', at: [44.088, 7.013] },
          { name: 'Saint-Sauveur-sur-Tinée', at: [44.085, 7.105] },
        ],
      },
      {
        stops: [
          { name: 'Col Saint-Martin', at: [44.061, 7.235] },
          { name: 'Saint-Martin-Vésubie', at: [44.069, 7.255] },
          { road: 'col-de-turini' },
          { name: 'Sospel', at: [43.878, 7.448] },
          { name: 'Col de Castillon', at: [43.836, 7.461] },
          { name: 'Menton', at: [43.776, 7.504] },
        ],
      },
    ],
  },
  // Napoleon's road from the coast to Grenoble, the N85, over two days.
  {
    id: 'route-napoleon',
    name: 'Route Napoléon',
    country: 'France',
    blurb: 'Napoleon’s road from the Riviera to Grenoble. Grasse, the climb to Castellane and the Alps of Provence',
    drives: [
      {
        from: { name: 'Golfe-Juan', at: [43.566, 7.077] },
        stops: [
          { name: 'Grasse', at: [43.658, 6.923] },
          { road: 'route-napoleon' },
          { name: 'Castellane', at: [43.847, 6.513] },
          { name: 'Digne-les-Bains', at: [44.092, 6.236] },
          { name: 'Sisteron', at: [44.195, 5.944] },
        ],
      },
      {
        stops: [
          { name: 'Gap', at: [44.559, 6.079] },
          { name: 'Col Bayard', at: [44.633, 6.08] },
          { name: 'Corps', at: [44.818, 5.945] },
          { name: 'Laffrey', at: [45.008, 5.775] },
          { name: 'Grenoble', at: [45.1885, 5.7245] },
        ],
      },
    ],
  },
  // The Grande Strada delle Dolomiti, Bolzano to Cortina, in a day.
  {
    id: 'great-dolomite-road',
    name: 'Great Dolomite Road',
    country: 'Italy',
    blurb: 'Bolzano to Cortina d’Ampezzo through the heart of the Dolomites. Lago di Carezza and the Pordoi and Falzarego passes',
    drives: [
      {
        from: { name: 'Bolzano', at: [46.4983, 11.3548] },
        stops: [
          { name: 'Lago di Carezza', at: [46.41, 11.575] },
          { name: 'Passo di Costalunga', at: [46.404, 11.611] },
          { name: 'Canazei', at: [46.477, 11.77] },
          { name: 'Passo Pordoi', at: [46.488, 11.812] },
          { name: 'Arabba', at: [46.497, 11.875] },
          { name: 'Passo di Falzarego', at: [46.519, 12.009] },
          { name: 'Cortina d’Ampezzo', at: [46.5405, 12.1357] },
        ],
      },
    ],
  },
  // Switzerland Tourism's Three Classic Passes: a day's loop from Meiringen.
  {
    id: 'three-classic-passes',
    name: 'Three Classic Passes',
    country: 'Switzerland',
    blurb: 'A day’s loop from Meiringen over the Grimsel, Furka and Susten passes, past the Rhône Glacier',
    drives: [
      {
        from: { name: 'Meiringen', at: [46.727, 8.187] },
        stops: [
          { road: 'grimsel-pass' },
          { name: 'Gletsch', at: [46.563, 8.361] },
          { road: 'furka-pass' },
          { name: 'Andermatt', at: [46.636, 8.594] },
          { road: 'susten-pass' },
          { name: 'Meiringen', at: [46.727, 8.187] },
        ],
      },
    ],
  },
  // Würzburg to Füssen; every stop is one of the route's official towns.
  {
    id: 'romantic-road',
    name: 'Romantic Road',
    country: 'Germany',
    blurb: 'Würzburg to Füssen through medieval Bavaria. Rothenburg, Dinkelsbühl and Neuschwanstein Castle',
    drives: [
      {
        from: { name: 'Würzburg', at: [49.7913, 9.9534] },
        stops: [
          { name: 'Tauberbischofsheim', at: [49.623, 9.662] },
          { name: 'Bad Mergentheim', at: [49.492, 9.773] },
          { name: 'Weikersheim', at: [49.479, 9.899] },
          { name: 'Creglingen', at: [49.469, 10.031] },
          { name: 'Rothenburg ob der Tauber', at: [49.377, 10.179] },
        ],
      },
      {
        stops: [
          { name: 'Feuchtwangen', at: [49.167, 10.329] },
          { name: 'Dinkelsbühl', at: [49.07, 10.319] },
          { name: 'Nördlingen', at: [48.851, 10.488] },
          { name: 'Harburg Castle', at: [48.787, 10.689] },
          { name: 'Augsburg', at: [48.3705, 10.8978] },
        ],
      },
      {
        stops: [
          { name: 'Landsberg am Lech', at: [48.048, 10.883] },
          { name: 'Wieskirche', at: [47.681, 10.901] },
          { name: 'Neuschwanstein Castle', at: [47.5576, 10.7498] },
          { name: 'Füssen', at: [47.57, 10.7] },
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
async function lookUp({ name, search = name, at }) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(search)}&lat=${at[0]}&lon=${at[1]}&limit=5`;
  const data = await cachedJson(url, (d) => Array.isArray(d.features));
  const near = data.features.filter(
    (f) => haversine([f.geometry.coordinates[1], f.geometry.coordinates[0]], at) <= MAX_LOOKUP_M
  );
  // A town's council boundary has its point in the middle of the parish, often
  // up a hillside, so the place itself comes first: the one with exactly that
  // name, else anything that isn't a boundary.
  const notBoundary = near.filter((f) => f.properties.osm_key !== 'boundary');
  const best =
    notBoundary.find((f) => f.properties.name?.toLowerCase() === search.toLowerCase()) ??
    notBoundary[0] ??
    near[0];
  const found = best && [best.geometry.coordinates[1], best.geometry.coordinates[0]];
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

const roads = JSON.parse(await readFile(ROADS, 'utf8')).roads.map((r) => ({ ...r, line: decodeLine(r.line) }));

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
    // Stored packed (src/utils/polyline.js); the app unpacks it as it loads.
    drives.push({ ...(d === 0 ? { start } : {}), stops, legs: stopLegs, metres, line: encodeLine(resample(line)) });
    const last = stops.at(-1);
    from = last.roadId ? waypoints.at(-1) : [last.latitude, last.longitude];
  }
  const metres = drives.reduce((a, d) => a + d.metres, 0);
  console.log(`  ${Math.round(metres / 1609.344)} mi in all`);
  routes.push({ id: route.id, name: route.name, country: route.country, blurb: route.blurb, metres, drives });
}

const attribution = 'Iconic Trips: © OpenStreetMap contributors (ODbL), routed with OSRM';
await writeFile(OUT, `${JSON.stringify({ attribution, routes })}\n`);
console.log(`Wrote ${OUT.pathname}`);

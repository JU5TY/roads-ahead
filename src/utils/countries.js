// Countries: which countries a drive went through, worked out offline from the
// bundled borders in src/data/countries.json (England, Scotland, Wales and
// Northern Ireland count separately). Pure functions over drive points
// ({ latitude, longitude, timestamp }, oldest first).
import data from '../data/countries.json';
import { haversineDistance } from './geoMath';
import { dayLabel } from './iconicRoads';

/** Check the country every this many metres of driving; crossings are then pinned down exactly. */
const SAMPLE_M = 250;

export const COUNTRIES_ATTRIBUTION = data.attribution;
/** Changes whenever the borders change, so past drives are checked again. */
export const COUNTRIES_VERSION = `${data.countries.length}:${data.countries
  .map((c) => c.polys.length)
  .join('')}`;

const byCode = new Map(data.countries.map((c) => [c.code, c]));

/**
 * { code, name, flag } for a country code, or null. `flag` names its artwork in
 * country-flag-icons ("FR", "GB_SCT"), or is null when there is none.
 */
export function getCountry(code) {
  const c = byCode.get(code);
  if (!c) return null;
  const flag = code.startsWith('GB-') ? code.replace('-', '_') : c.iso;
  return { code: c.code, name: c.name, flag };
}

/** Decode a Google encoded polyline into flat [lat, lng, lat, lng, …] (degrees). */
function decodeRing(str) {
  const out = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let b;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < str.length) {
    lat += next();
    lng += next();
    out.push(lat / 1e3, lng / 1e3);
  }
  return out;
}

const decoded = new Map(); // code → [{ bbox, ring }]
/** A country's rings (outer rings and holes alike), decoded on first use. */
function ringsOf(country) {
  if (!decoded.has(country.code)) {
    const rings = [];
    for (const poly of country.polys) {
      for (const str of poly) {
        const ring = decodeRing(str);
        let [minLat, minLng, maxLat, maxLng] = [90, 180, -90, -180];
        for (let i = 0; i < ring.length; i += 2) {
          minLat = Math.min(minLat, ring[i]);
          maxLat = Math.max(maxLat, ring[i]);
          minLng = Math.min(minLng, ring[i + 1]);
          maxLng = Math.max(maxLng, ring[i + 1]);
        }
        rings.push({ bbox: [minLat, minLng, maxLat, maxLng], ring });
      }
    }
    decoded.set(country.code, rings);
  }
  return decoded.get(country.code);
}

/** Skip land points closer together than this on a flat map, to keep its path small. */
const LAND_STEP = 2.4;

/**
 * Land as SVG path data for a flat map: `project(point)` gives [x, y] on a
 * `width` x `height` drawing. Points well outside it are pulled to its edge.
 */
export function landPath(project, width, height) {
  const inView = ([minLat, minLng, maxLat, maxLng]) => {
    const [x0, y0] = project({ latitude: maxLat, longitude: minLng });
    const [x1, y1] = project({ latitude: minLat, longitude: maxLng });
    return x1 >= 0 && x0 <= width && y1 >= 0 && y0 <= height;
  };
  const edge = 12;
  const clamp = (n, max) => Math.min(Math.max(n, -edge), max + edge);
  let path = '';
  for (const country of data.countries) {
    if (!inView(country.bbox)) continue;
    for (const { bbox, ring } of ringsOf(country)) {
      if (!inView(bbox)) continue;
      const parts = [];
      let lastX = Infinity;
      let lastY = Infinity;
      for (let i = 0; i < ring.length; i += 2) {
        const [x, y] = project({ latitude: ring[i], longitude: ring[i + 1] });
        const cx = clamp(x, width);
        const cy = clamp(y, height);
        if (Math.hypot(cx - lastX, cy - lastY) < LAND_STEP) continue;
        parts.push(`${cx.toFixed(0)},${cy.toFixed(0)}`);
        lastX = cx;
        lastY = cy;
      }
      if (parts.length > 3) path += `M${parts.join(' ')}Z`;
    }
  }
  return path;
}

const inBox = ([minLat, minLng, maxLat, maxLng], lat, lng) =>
  lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;

/** Even-odd test over all of a country's rings, so holes (e.g. Lesotho) work. */
function contains(country, lat, lng) {
  if (!inBox(country.bbox, lat, lng)) return false;
  let inside = false;
  for (const { bbox, ring } of ringsOf(country)) {
    if (!inBox(bbox, lat, lng)) continue;
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      const yi = ring[i];
      const xi = ring[i + 1];
      const yj = ring[j];
      const xj = ring[j + 1];
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/** How far (degrees, ~1.5 km) to look for land around a point that falls just offshore. */
const NEAR_DEG = 0.014;

let lastHit = null;
/**
 * Code of the country at a point, or null (at sea, or a tiny island left out of
 * the data). The borders are simplified, so ports and coast roads can fall just
 * offshore; those take the country next to them.
 */
export function countryAt(lat, lng) {
  const code = countryExactlyAt(lat, lng);
  if (code) return code;
  for (const [dLat, dLng] of [
    [NEAR_DEG, 0],
    [-NEAR_DEG, 0],
    [0, NEAR_DEG * 1.6],
    [0, -NEAR_DEG * 1.6],
  ]) {
    const near = countryExactlyAt(lat + dLat, lng + dLng);
    if (near) return near;
  }
  return null;
}

function countryExactlyAt(lat, lng) {
  // Consecutive points are nearly always in the same country.
  if (lastHit && contains(lastHit, lat, lng)) return lastHit.code;
  for (const c of data.countries) {
    if (c !== lastHit && contains(c, lat, lng)) {
      lastHit = c;
      return c.code;
    }
  }
  return null;
}

/**
 * The countries a drive went through, in order:
 * [{ code, enteredAt, latitude, longitude, distanceM }]. A country entered
 * twice (England → Wales → England) appears twice. The first visit starts at
 * the drive's start; later ones at the border crossing. Points at sea keep the
 * country before them, so a ferry crossing shows up as one crossing on arrival.
 */
export function detectCountries(points) {
  if (points.length === 0) return [];
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + haversineDistance(points[i - 1], points[i]));
  }
  const at = (i) => countryAt(points[i].latitude, points[i].longitude);

  // Sample about every SAMPLE_M, always including the last point.
  const samples = [];
  for (let i = 0; i < points.length; i++) {
    if (i === 0 || i === points.length - 1 || cum[i] - cum[samples.at(-1).i] >= SAMPLE_M) {
      samples.push({ i, code: at(i) });
    }
  }

  // [{ code, start: point index }]
  const visits = [];
  let prev = null; // { i, code } of the last sample with a country
  for (const s of samples) {
    if (!s.code) continue;
    if (!prev) {
      visits.push({ code: s.code, start: 0 });
    } else if (s.code !== prev.code) {
      // Pin the crossing down to the first point in the new country.
      let lo = prev.i;
      let hi = s.i;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (at(mid) === s.code) hi = mid;
        else lo = mid;
      }
      visits.push({ code: s.code, start: hi });
    }
    prev = s;
  }

  const total = cum.at(-1);
  return visits.map((v, k) => {
    const end = k + 1 < visits.length ? visits[k + 1].start : points.length - 1;
    const p = points[v.start];
    return {
      code: v.code,
      enteredAt: p.timestamp,
      latitude: p.latitude,
      longitude: p.longitude,
      distanceM: k + 1 < visits.length ? cum[end] - cum[v.start] : total - cum[v.start],
    };
  });
}

/**
 * Countries of several visits added up, in first-visited order:
 * [{ code, name, flag, distanceM, visits: [visit] }]. `scaleToM` scales the
 * distances to match the drives' filtered total (like the timeline does).
 */
export function summarizeCountries(visits, scaleToM) {
  const groups = new Map();
  for (const v of visits) {
    const g = groups.get(v.code) ?? { ...getCountry(v.code), distanceM: 0, visits: [] };
    g.distanceM += v.distanceM;
    g.visits.push(v);
    groups.set(v.code, g);
  }
  const list = [...groups.values()].filter((g) => g.name);
  const raw = list.reduce((sum, g) => sum + g.distanceM, 0);
  if (scaleToM != null && raw > 0) {
    for (const g of list) g.distanceM = (g.distanceM / raw) * scaleToM;
  }
  return list;
}

/**
 * Rows for a Countries section over some drives (with `countries` and
 * `places`): [{ code, name, flag, distanceM, subtitle }]. The subtitle is
 * where the country was entered and left ("Manchester → Gretna"), or with
 * `dayOf(drive)` the days it was driven on ("Days 1–3").
 */
export function countryRows(drives, { dayOf } = {}) {
  const visits = drives.flatMap((d) =>
    (d.countries ?? []).map((v, k, all) => ({
      ...v,
      fromPlace: k === 0 ? d.places.start : d.places.crossings?.[k],
      toPlace: k + 1 < all.length ? d.places.crossings?.[k + 1] : d.places.end,
      day: dayOf?.(d),
    }))
  );
  const total = drives.reduce((sum, d) => sum + d.stats.distanceM, 0);
  return summarizeCountries(visits, total).map((g) => {
    const from = g.visits[0].fromPlace;
    const to = g.visits.at(-1).toPlace;
    const route = from && to ? `${from} → ${to}` : from || to || '';
    return { ...g, subtitle: dayOf ? dayLabel(g.visits.map((v) => v.day)) : route };
  });
}

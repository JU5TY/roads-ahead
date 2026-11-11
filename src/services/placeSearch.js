// Place search for the trip planner's search box. The only file that talks to
// a search service: today Photon (photon.komoot.io, free, OpenStreetMap data,
// credited as "© OpenStreetMap contributors" under the results). To switch to
// another service, rewrite searchPlaces() and keep what it returns; nothing
// else knows which service answered. Saved stops keep their own name and
// coordinates, so a switch leaves plans as they are.

const PHOTON_URL = 'https://photon.komoot.io/api/';
const TIMEOUT_MS = 5000;
const LIMIT = 8;

/** Fewer letters than this match too much to be worth asking. */
export const MIN_SEARCH_LENGTH = 3;

/** The credit shown wherever search results are. */
export const SEARCH_CREDIT = 'Search © OpenStreetMap contributors';

const humanize = (value) => {
  const words = String(value).replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * Photon's GeoJSON as the app's places: [{ id, name, detail, latitude, longitude }],
 * the detail being what it is and where ("Village · Highland · United Kingdom").
 * Unnamed results and repeats of the same name and detail are left out.
 */
export function photonPlaces(json) {
  const seen = new Set();
  const places = [];
  for (const f of json?.features ?? []) {
    const p = f.properties ?? {};
    const [longitude, latitude] = f.geometry?.coordinates ?? [];
    if (!p.name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const area = [p.city !== p.name ? p.city : null, p.county ?? p.state, p.country].filter(
      (part, i, all) => part && part !== p.name && all.indexOf(part) === i
    );
    const detail = [p.osm_value ? humanize(p.osm_value) : null, ...area].filter(Boolean).join(' · ');
    const key = `${p.name}|${detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    places.push({ id: `${p.osm_type}${p.osm_id}`, name: p.name, detail, latitude, longitude });
  }
  return places;
}

/**
 * Places matching `text`, nearest `near` ({ latitude, longitude }) first.
 * Never throws: resolves to { places } (maybe empty), { failed: true } when the
 * service can't be reached, errs or takes over 5 seconds, or { cancelled: true }
 * when `signal` aborts it (a newer search took over).
 */
export async function searchPlaces(text, { near, signal } = {}) {
  const q = text.trim();
  if (q.length < MIN_SEARCH_LENGTH) return { places: [] };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel);
  try {
    const params = new URLSearchParams({ q, limit: String(LIMIT), lang: 'en' });
    if (near) {
      params.set('lat', near.latitude.toFixed(4));
      params.set('lon', near.longitude.toFixed(4));
    }
    const res = await fetch(`${PHOTON_URL}?${params}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { places: photonPlaces(await res.json()) };
  } catch (err) {
    if (signal?.aborted) return { cancelled: true };
    console.warn('[search] failed', err.message);
    return { failed: true };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

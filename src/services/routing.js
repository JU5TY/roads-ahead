// Road routes for the trip planner: a drive's miles, time and the line along
// the real roads. The only file that talks to a routing service: today Google
// Routes (Android). To switch, rewrite routeDrive() and keep what it returns.
//
// Google's rules shape how it's used (see the plan doc's Routing rows): its
// routes are shown only on a Google map, never in a thumbnail; the line may be
// kept 30 days (storage/routeStorage.js) and the miles and times not at all.
// Requests stay in Google's cheaper Essentials tier: no live traffic and at most
// 10 points between origin and destination, so a longer drive is asked in parts.
// A daily cap set in Google Cloud stops it costing more; each phone also keeps
// to its own daily limit, so one phone with a bug can't use up everyone's day.
// Each step's distance and manoeuvre come back too (not a pricier tier: Google
// bills by the features asked for, not the fields), so a ferry's crossing can
// be left out of the miles: the miles are on the road, the time door to door.
import Constants from 'expo-constants';
import Storage from 'expo-sqlite/kv-store';

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const FIELDS = [
  'routes.distanceMeters',
  'routes.duration',
  'routes.polyline.encodedPolyline',
  'routes.legs.distanceMeters',
  'routes.legs.duration',
  'routes.legs.steps.distanceMeters',
  'routes.legs.steps.navigationInstruction.maneuver',
].join(',');
// Steps crossing water: the ferry, or the train onto one (Le Shuttle).
const FERRY_MANEUVERS = new Set(['FERRY', 'FERRY_TRAIN']);
const MAX_BETWEEN = 10; // more than this between origin and destination costs more
const TIMEOUT_MS = 10000;
const DAILY_LIMIT = 100; // requests a day from one phone
const COUNT_KEY = 'routing.count';

const { routesApiKey, androidPackage, androidCert } = Constants.expoConfig?.extra ?? {};

/**
 * Decode a Google encoded polyline into [{ latitude, longitude }].
 * https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
export function decodePolyline(encoded) {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += next();
    lng += next();
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

/**
 * The drive split into requests of at most 10 points in between: [[point]],
 * each part starting where the one before ends.
 */
export function routeParts(points) {
  const parts = [];
  let from = 0;
  while (from < points.length - 1) {
    const to = Math.min(from + MAX_BETWEEN + 1, points.length - 1);
    parts.push(points.slice(from, to + 1));
    from = to;
  }
  return parts;
}

const seconds = (duration) => Number(String(duration ?? '0').replace('s', '')) || 0;

/** A leg from Google's: { metres (on the road), seconds (door to door), ferry? }. */
function legOf(leg) {
  const ferrySteps = (leg.steps ?? []).filter((s) => FERRY_MANEUVERS.has(s.navigationInstruction?.maneuver));
  const sea = ferrySteps.reduce((sum, s) => sum + (s.distanceMeters ?? 0), 0);
  return {
    metres: Math.max(0, (leg.distanceMeters ?? 0) - sea),
    seconds: seconds(leg.duration),
    ...(ferrySteps.length ? { ferry: true } : {}),
  };
}

const waypoint = (p) => ({
  location: { latLng: { latitude: p.latitude, longitude: p.longitude } },
  ...(p.via ? { via: true } : {}),
});

/** Today's date as 'YYYY-MM-DD', for the phone's daily count. */
const today = () => new Date().toISOString().slice(0, 10);

/** Counts one request against the phone's daily limit; false once it's used up. */
async function takeRequest() {
  let count = { day: today(), used: 0 };
  try {
    const saved = JSON.parse((await Storage.getItemAsync(COUNT_KEY)) ?? 'null');
    if (saved?.day === count.day) count = saved;
  } catch {
    // A count that can't be read starts again.
  }
  if (count.used >= DAILY_LIMIT) return false;
  await Storage.setItemAsync(COUNT_KEY, JSON.stringify({ ...count, used: count.used + 1 }));
  return true;
}

async function askGoogle(part, signal) {
  const res = await fetch(ROUTES_URL, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': routesApiKey,
      'X-Goog-FieldMask': FIELDS,
      // The key only works from the app: Google checks these against it.
      ...(androidPackage ? { 'X-Android-Package': androidPackage } : {}),
      ...(androidCert ? { 'X-Android-Cert': androidCert } : {}),
    },
    body: JSON.stringify({
      origin: waypoint({ ...part[0], via: false }),
      destination: waypoint({ ...part.at(-1), via: false }),
      intermediates: part.slice(1, -1).map(waypoint),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE', // live traffic would cost more
      polylineQuality: 'OVERVIEW',
    }),
  });
  if (res.status === 429) throw Object.assign(new Error('quota'), { limited: true });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const route = (await res.json()).routes?.[0];
  if (!route) throw new Error('no route');
  return route;
}

/**
 * The road route through `points` ([{ latitude, longitude, via? }], in driving
 * order; `via` points are driven through, the rest are places to stop). Never
 * throws: resolves to { metres, seconds, ferry, legs: [{ metres, seconds,
 * ferry? }] (one per place after the first), line: [{ latitude, longitude }] }
 * with `metres` on the road (a ferry's crossing left out) and `seconds` door to
 * door, `ferry` when any leg takes one; or { failed: true }
 * (offline, an error, too slow), { limited: true } (Google's daily cap or the
 * phone's own), or { cancelled: true } when `signal` aborts it.
 */
export async function routeDrive(points, { signal } = {}) {
  if (points.length < 2) return { failed: true };
  if (!routesApiKey) return { failed: true };
  const parts = routeParts(points);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel);
  const timer = setTimeout(cancel, TIMEOUT_MS);
  try {
    const legs = [];
    const line = [];
    for (const [i, part] of parts.entries()) {
      if (!(await takeRequest())) return { limited: true };
      const route = await askGoogle(part, controller.signal);
      const partLegs = (route.legs ?? []).map(legOf);
      // A part that starts at a point driven through carries on the leg before.
      if (i > 0 && part[0].via && legs.length && partLegs.length) {
        const first = partLegs.shift();
        legs[legs.length - 1] = {
          metres: legs.at(-1).metres + first.metres,
          seconds: legs.at(-1).seconds + first.seconds,
          ...(legs.at(-1).ferry || first.ferry ? { ferry: true } : {}),
        };
      }
      legs.push(...partLegs);
      const partLine = decodePolyline(route.polyline?.encodedPolyline ?? '');
      line.push(...(i > 0 ? partLine.slice(1) : partLine));
    }
    return {
      metres: legs.reduce((sum, l) => sum + l.metres, 0),
      seconds: legs.reduce((sum, l) => sum + l.seconds, 0),
      ferry: legs.some((l) => l.ferry),
      legs,
      line,
    };
  } catch (err) {
    if (signal?.aborted) return { cancelled: true };
    if (err.limited) return { limited: true };
    console.warn('[routing] failed', err.message);
    return { failed: true };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

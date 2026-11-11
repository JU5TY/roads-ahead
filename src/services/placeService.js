// Human-readable place names ("Manchester → Edinburgh", "Tebay Services") via the
// phone's reverse geocoder. Looked up after a drive ends and cached on the drive;
// lookups that fail (offline) are retried the next time the drive is viewed.
import * as Location from 'expo-location';

import { getDriveEndpoints, saveDrivePlaces } from '../storage/driveStorage';

const inFlight = new Map(); // driveId -> Promise<places>

/** Town-level name for a drive's start or end. */
function townName(addr) {
  return addr.city || addr.district || addr.subregion || addr.region || addr.name || null;
}

/** For rest stops, prefer a named place (e.g. a service area) over the town. */
function stopName(addr) {
  const town = townName(addr);
  const named =
    addr.name &&
    addr.name !== addr.street &&
    addr.name !== addr.streetNumber &&
    addr.name !== town &&
    !/^\d/.test(addr.name); // skip bare street addresses like "12 High St"
  return named ? (town ? `${addr.name}, ${town}` : addr.name) : town;
}

/** Resolves to a name, '' when the place has no name, or undefined on failure (retry later). */
async function lookup(coord, toName) {
  try {
    const [addr] = await Location.reverseGeocodeAsync({
      latitude: coord.latitude,
      longitude: coord.longitude,
    });
    return (addr && toName(addr)) || '';
  } catch (err) {
    console.warn('[places] reverse geocode failed', err.message);
    return undefined;
  }
}

/**
 * A name for a pin dropped on the planner's map ("Eilean Donan Castle, Dornie"),
 * or null when the phone can't name it (offline, or no location permission on
 * Android): it's then just a dropped pin.
 */
export async function pinName(coord) {
  return (await lookup(coord, stopName)) || null;
}

async function resolvePlaces(drive, { includeStops }) {
  const places = {
    ...drive.places,
    stops: [...(drive.places.stops ?? [])],
    crossings: [...(drive.places.crossings ?? [])],
  };
  let changed = false;

  if (places.start === undefined || places.end === undefined) {
    const ends = await getDriveEndpoints(drive.id);
    if (!ends) return places;
    if (places.start === undefined) places.start = await lookup(ends.first, townName);
    if (places.end === undefined) places.end = await lookup(ends.last, townName);
    changed = true;
  }

  if (includeStops) {
    // Sequential on purpose: the OS geocoders rate-limit bursts.
    for (const [i, stop] of drive.stats.stops.entries()) {
      // JSON turns undefined array slots into null, so null also means "retry".
      if (places.stops[i] == null) {
        const name = await lookup(stop, stopName);
        if (name !== undefined) {
          places.stops[i] = name;
          changed = true;
        }
      }
    }

    // Border crossings: crossings[k] names where visit k began (k = 0 is the start).
    for (const [k, visit] of (drive.countries ?? []).entries()) {
      if (k > 0 && places.crossings[k] == null) {
        const name = await lookup(visit, townName);
        if (name !== undefined) {
          places.crossings[k] = name;
          changed = true;
        }
      }
    }
  }

  // JSON drops undefined values, so failed lookups are retried next time.
  if (changed) await saveDrivePlaces(drive.id, places);
  return places;
}

/**
 * Make sure a completed drive has place names, looking up any that are missing.
 * Resolves to the drive's places: { start, end, stops: [], crossings: [] }.
 */
export function ensureDrivePlaces(drive, { includeStops = false } = {}) {
  const key = `${drive.id}:${includeStops}`;
  if (!inFlight.has(key)) {
    const job = resolvePlaces(drive, { includeStops }).finally(() => inFlight.delete(key));
    inFlight.set(key, job);
  }
  return inFlight.get(key);
}

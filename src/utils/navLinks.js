// Links that hand a planned drive to a sat nav app. Pure functions over points
// ({ latitude, longitude, name? }, in driving order, the last one the finish). A
// point with `road` set is an Iconic Road guide point: there to keep the sat nav
// on that road, not a place to stop. A point with a `name` (picked from search)
// goes to Google and Apple by name, so they show it rather than whatever
// business sits nearest its coordinates; Waze always gets coordinates.
//
// Google Maps gets the whole drive in one link (or a few, past its waypoint
// limit). It opens on the route overview, not straight into navigation: that's
// where it shows the whole drive's time to the finish (navigation shows only the
// next stop's), and the driver taps Start. Waze takes one
// destination per link, so it gets one leg at a time. Apple Maps' links only
// officially take one destination; repeating it for each stop is unofficial.

/** Google Maps' most waypoints in one link (outside a phone's web browser). */
export const MAX_GOOGLE_WAYPOINTS = 9;
/** Google Maps' longest link. */
export const MAX_GOOGLE_URL = 2048;

const coord = (p) => `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`;
const place = (p) => p.name ?? coord(p);
const isGuide = (p) => p.road != null;

/**
 * `count` guide points along an Iconic Road's line ([latitude, longitude]),
 * evenly spaced and away from its ends, in the order it's driven: `reversed`
 * when the plan drives it from its finish to its start. One, at the middle, is
 * enough to hold Google Maps on Bealach na Bà and keeps its stop list short
 * (tested); a long road may need more.
 */
export function roadGuidePoints(road, count = 1, { reversed = false } = {}) {
  const { line } = road;
  const points = Array.from({ length: count }, (_, i) => {
    const [latitude, longitude] = line[Math.round(((i + 1) * (line.length - 1)) / (count + 1))];
    return { latitude, longitude, road: road.id };
  });
  // The same points either way, so a road driven backwards is held just the same.
  return reversed ? points.reverse() : points;
}

/**
 * Drop guide points until `points` has at most `max` waypoints, taking from the
 * road with the most first, so each road keeps at least one while it can.
 * Stops are never dropped.
 */
function thinGuides(points, max) {
  const kept = [...points];
  while (kept.length > max) {
    const perRoad = new Map();
    for (const p of kept) if (isGuide(p)) perRoad.set(p.road, (perRoad.get(p.road) ?? 0) + 1);
    if (perRoad.size === 0) break;
    const [road] = [...perRoad.entries()].sort((a, b) => b[1] - a[1])[0];
    const onRoad = kept.filter((p) => p.road === road);
    // Keep the middle one longest: it's what holds the route on the road.
    const drop = onRoad.length > 1 ? onRoad.at(onRoad.length === 2 ? -1 : 0) : onRoad[0];
    kept.splice(kept.indexOf(drop), 1);
  }
  return kept;
}

function googleUrl(destination, waypoints) {
  const params = [
    'api=1',
    `destination=${encodeURIComponent(place(destination))}`,
    ...(waypoints.length ? [`waypoints=${encodeURIComponent(waypoints.map(place).join('|'))}`] : []),
    'travelmode=driving',
  ];
  return `https://www.google.com/maps/dir/?${params.join('&')}`;
}

/**
 * Google Maps links for a drive, from where the phone is now. Usually one: the
 * finish as its destination, everything before it as waypoints. Past the limit,
 * guide points are thinned first; if the stops alone still don't fit, the drive
 * is split, each link ending where the next begins.
 */
export function googleMapsLinks(points) {
  if (points.length === 0) return [];
  const links = [];
  let rest = points;
  while (rest.length > 0) {
    const finish = rest.at(-1);
    const fitted = thinGuides(rest.slice(0, -1), MAX_GOOGLE_WAYPOINTS);
    if (fitted.length <= MAX_GOOGLE_WAYPOINTS) {
      links.push(googleUrl(finish, fitted));
      break;
    }
    // Too many stops for one link: drive to the 10th point first.
    const batch = rest.slice(0, MAX_GOOGLE_WAYPOINTS + 1);
    const stop = batch.at(-1);
    links.push(googleUrl(stop, thinGuides(batch.slice(0, -1), MAX_GOOGLE_WAYPOINTS)));
    rest = rest.slice(MAX_GOOGLE_WAYPOINTS + 1);
  }
  return links;
}

/**
 * Waze links for a drive, one per leg: each stop, and each Iconic Road's first
 * and last guide points, since Waze takes no via points and would otherwise
 * route round the road.
 */
export function wazeLinks(points) {
  const legs = points.filter((p, i) => {
    if (!isGuide(p)) return true;
    const prev = points[i - 1];
    const next = points[i + 1];
    return prev?.road !== p.road || next?.road !== p.road;
  });
  return legs.map((p) => `https://waze.com/ul?ll=${encodeURIComponent(coord(p))}&navigate=yes`);
}

/**
 * An Apple Maps link for a whole drive, repeating the destination for each
 * point in order. Unofficial: test on an iPhone before relying on it.
 */
export function appleMapsLink(points) {
  const stops = points.map((p) => `daddr=${encodeURIComponent(place(p))}`).join('&');
  return `https://maps.apple.com/?${stops}&dirflg=d`;
}

/** The sat nav apps Navigate with offers, by platform: [id, name]. Apple Maps only on iPhone. */
export const NAV_APPS = {
  google: 'Google Maps',
  waze: 'Waze',
  apple: 'Apple Maps',
};

/** Whether `app` takes the whole drive in one go (Waze takes one stop at a time). */
export const takesWholeDrive = (app) => app !== 'waze';

/** The links handing `points` to `app` ('google' | 'waze' | 'apple'), in the order to open them. */
export function navLinks(app, points) {
  if (points.length === 0) return [];
  if (app === 'waze') return wazeLinks(points);
  if (app === 'apple') return [appleMapsLink(points)];
  return googleMapsLinks(points);
}

/** `app` opened with nowhere set: Record's Navigate outside a plan. */
export const NAV_APP_HOME = {
  google: 'https://www.google.com/maps/dir/?api=1&travelmode=driving',
  waze: 'https://waze.com/ul',
  apple: 'https://maps.apple.com/?dirflg=d',
};

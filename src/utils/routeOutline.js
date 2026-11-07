/** An SVG polyline `points` string for `route`, placed by `project`. */
const pointsWith = (project) => (route) =>
  route
    .map((p) =>
      project(p)
        .map((n) => n.toFixed(1))
        .join(',')
    )
    .join(' ');

/**
 * Fit routes (arrays of { latitude, longitude }) inside a `width` × `height`
 * box, `margin` px in from each edge, for flat drawings that need no map.
 * Returns { project, points }: project(p) → [x, y], points(route) → an SVG
 * polyline `points` string. Null when there are fewer than two points to draw.
 */
export function fitInBox(routes, width, height, margin = 0, top = 0) {
  const all = routes.flat();
  if (all.length < 2) return null;
  const lats = all.map((p) => p.latitude);
  const lngs = all.map((p) => p.longitude);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const k = Math.cos((midLat * Math.PI) / 180); // keep shapes true east-west
  const minX = Math.min(...lngs) * k;
  const maxX = Math.max(...lngs) * k;
  const minY = Math.min(...lats);
  const maxY = Math.max(...lats);
  const scale = Math.min(
    (width - 2 * margin) / Math.max(maxX - minX, 1e-6),
    (height - 2 * margin) / Math.max(maxY - minY, 1e-6)
  );
  const cx = width / 2 - ((minX + maxX) / 2) * scale;
  const cy = top + height / 2 + ((minY + maxY) / 2) * scale;
  const project = (p) => [cx + p.longitude * k * scale, cy - p.latitude * scale];
  return { project, points: pointsWith(project) };
}

/** How far `routes` reach, in km, north-south or east-west, whichever is further. */
export function routeSpanKm(routes) {
  const all = routes.flat();
  if (!all.length) return 0;
  const lats = all.map((p) => p.latitude);
  const lngs = all.map((p) => p.longitude);
  const k = Math.cos((((Math.min(...lats) + Math.max(...lats)) / 2) * Math.PI) / 180);
  return (
    Math.max(Math.max(...lats) - Math.min(...lats), (Math.max(...lngs) - Math.min(...lngs)) * k) *
    111.32
  );
}

// One rule for every drawn map (Home, the share card, the poster): show the
// routes as large as they'll go, but never on less than MIN_MAP_KM of land, so a
// short drive keeps its shape and the coast round it. A drive spanning less than
// DOT_BELOW_KM has no shape worth drawing, so it's a dot.
export const MIN_MAP_KM = 60;
const DOT_BELOW_KM = 3;
const KM_PER_DEGREE = 111.32;

/** Two points `km` apart each way around the middle of `routes`: fitted, not drawn. */
function spanAround(routes, km) {
  const all = routes.flat();
  const lats = all.map((p) => p.latitude);
  const lngs = all.map((p) => p.longitude);
  const latitude = (Math.min(...lats) + Math.max(...lats)) / 2;
  const longitude = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const dLat = km / 2 / KM_PER_DEGREE;
  const dLng = dLat / Math.cos((latitude * Math.PI) / 180);
  return [
    { latitude: latitude - dLat, longitude: longitude - dLng },
    { latitude: latitude + dLat, longitude: longitude + dLng },
  ];
}

/** fitInBox for a map: the routes as large as they'll go, on at least MIN_MAP_KM of land. */
export function fitMap(routes, width, height, margin = 0, top = 0) {
  if (!routes.flat().length) return null;
  return fitInBox([...routes, spanAround(routes, MIN_MAP_KM)], width, height, margin, top);
}

/** Where to draw `routes` as a dot on `fit`, [x, y] at their middle, when they're too short to draw. */
export function pinPoint(fit, routes) {
  const all = routes.flat();
  if (!fit || !all.length || routeSpanKm(routes) >= DOT_BELOW_KM) return null;
  const drawn = all.map(fit.project);
  const xs = drawn.map((p) => p[0]);
  const ys = drawn.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

/**
 * fitInBox for a circle `size` px across: the routes are centred, and their furthest
 * point stops this share of the size from the edge, whichever way they run. With
 * `map`, it keeps fitMap's rule: never less than MIN_MAP_KM across.
 */
const CIRCLE_INSET = 0.15;
export function fitInCircle(routes, size, { map = false } = {}) {
  const fit = fitInBox(routes, size, size);
  if (!fit) return null;
  const mid = size / 2;
  const reach = map ? [...routes.flat(), ...spanAround(routes, MIN_MAP_KM / Math.SQRT2)] : routes.flat();
  const furthest = Math.max(
    ...reach.map((p) => {
      const [x, y] = fit.project(p);
      return Math.hypot(x - mid, y - mid);
    })
  );
  const scale = (mid - size * CIRCLE_INSET) / Math.max(furthest, 1e-6);
  const project = (p) => {
    const [x, y] = fit.project(p);
    return [mid + (x - mid) * scale, mid + (y - mid) * scale];
  };
  return { project, points: pointsWith(project) };
}

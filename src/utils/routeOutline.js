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
  const points = (route) =>
    route
      .map((p) =>
        project(p)
          .map((n) => n.toFixed(1))
          .join(',')
      )
      .join(' ');
  return { project, points };
}

/** fitInBox for a circle `size` px across: the routes fill a square inscribed in it, plus a margin. */
export function fitInCircle(routes, size) {
  const box = (size / Math.SQRT2) * 0.92;
  return fitInBox(routes, size, size, (size - box) / 2);
}

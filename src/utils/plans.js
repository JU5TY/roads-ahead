// The trip planner's rules, as pure functions over a plan from planStorage:
// { id, name, startDate, routeId, createdAt,
//   drives: [{ id, position, start, stops: [{ id, position, name, latitude,
//              longitude, source, roadId, reversed }] }] }
// A drive's `start` is { name, latitude, longitude } when set by hand ("Start
// somewhere else"), or null: where the drive before ends, or for Drive 1,
// wherever the phone is when it starts. A stop with `roadId` is an Iconic Road
// driven through, not a place to stop.
import { getRoad } from './iconicRoads';
import { roadGuidePoints } from './navLinks';

/** The end of an Iconic Road stop, in the direction it's driven. */
function roadEnd(stop) {
  const road = getRoad(stop.roadId);
  if (!road) return null;
  const [latitude, longitude] = stop.reversed ? road.line[0] : road.line.at(-1);
  return { name: road.name, latitude, longitude };
}

/** Where a stop leaves you: a place itself, or the far end of an Iconic Road. */
function endOfStop(stop) {
  if (stop.roadId) return roadEnd(stop);
  return { name: stop.name, latitude: stop.latitude, longitude: stop.longitude };
}

/**
 * Where drive `index` (from 0) starts: { name, latitude, longitude, linked }, with
 * `linked` true when it's where the drive before ends. Null for a Drive 1 with
 * no start set (it starts wherever the phone is), or after a drive with no stops.
 */
export function driveStart(plan, index) {
  const drive = plan.drives[index];
  if (drive.start) return { ...drive.start, linked: false };
  if (index === 0) return null;
  const before = plan.drives[index - 1];
  const last = before.stops.at(-1);
  if (last) {
    const end = endOfStop(last);
    return end ? { ...end, linked: true } : null;
  }
  const start = driveStart(plan, index - 1);
  return start ? { ...start, linked: true } : null;
}

/**
 * The points to hand to the sat nav for drive `index`, in driving order, the
 * finish last (see navLinks.js). The route starts from where the phone is, so
 * the drive's own start is left out unless it's somewhere else. An Iconic Road
 * becomes one guide point; a road that ends the drive adds its far end as the
 * finish. A stop picked from search carries its name, so the sat nav shows it.
 */
export function drivePoints(plan, index, { fromStart = false } = {}) {
  const drive = plan.drives[index];
  const points = [];
  const start = fromStart ? driveStart(plan, index) : null;
  if (start) points.push({ latitude: start.latitude, longitude: start.longitude, name: start.name });
  for (const stop of drive.stops) {
    if (stop.roadId) {
      const road = getRoad(stop.roadId);
      if (road) points.push(...roadGuidePoints(road, 1, { reversed: stop.reversed }));
    } else {
      points.push({
        latitude: stop.latitude,
        longitude: stop.longitude,
        ...(stop.source === 'search' && stop.name ? { name: stop.name } : {}),
      });
    }
  }
  const last = drive.stops.at(-1);
  if (last?.roadId) {
    const end = roadEnd(last);
    if (end) points.push({ latitude: end.latitude, longitude: end.longitude });
  }
  return points;
}

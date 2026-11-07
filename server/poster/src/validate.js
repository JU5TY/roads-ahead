// Checks a poster spec from the app before anything is stored or charged for. The
// spec is only drawn, never run, but it's still kept to the shape the app sends.
import { SIZES } from '../../../src/utils/posterLayout.js';

const MAX_TEXT = 120;
const MAX_POINTS = 400_000; // characters of route, all lines together
const MAX_LAND = 600_000;
const POINTS = /^[-0-9., ]*$/;
const LAND = /^[-0-9.,MZ ]*$/;

const isNumber = (n) => typeof n === 'number' && Number.isFinite(n);
const isPoint = (p) => p === null || (Array.isArray(p) && p.length === 2 && p.every(isNumber));
const isText = (t) => t === null || (typeof t === 'string' && t.length <= MAX_TEXT);

/** The problem with `spec`, or null when it can be printed. */
export function specProblem(spec) {
  if (!spec || typeof spec !== 'object') return 'No poster';
  if (spec.v !== 1) return 'This version of the app is too old to order prints';
  if (!SIZES[spec.size]) return 'Unknown size';
  if (spec.edition !== 'route' && spec.edition !== 'photo') return 'Unknown poster';
  const lines = spec.lines ?? {};
  if (!['title', 'route', 'footer'].every((k) => lines[k] && isText(lines[k].text))) {
    return 'Bad text';
  }
  const map = spec.map;
  if (map !== null) {
    if (!map || typeof map !== 'object' || !Array.isArray(map.lines)) return 'Bad map';
    if (typeof map.land !== 'string' || map.land.length > MAX_LAND || !LAND.test(map.land)) {
      return 'Bad land';
    }
    let length = 0;
    for (const line of map.lines) {
      if (typeof line?.points !== 'string' || !POINTS.test(line.points)) return 'Bad route';
      length += line.points.length;
    }
    if (length > MAX_POINTS) return 'Route too long';
    if (![map.start, map.end, map.pin].every(isPoint)) return 'Bad route ends';
  }
  if (spec.edition === 'photo') {
    const crop = spec.photo?.crop;
    if (!crop || ![crop.zoom, crop.x, crop.y].every(isNumber)) return 'Bad photo framing';
    if (crop.zoom < 1 || crop.zoom > 3 || crop.x < 0 || crop.x > 1 || crop.y < 0 || crop.y > 1) {
      return 'Bad photo framing';
    }
  } else if (spec.photo) {
    return 'Bad photo';
  }
  return null;
}

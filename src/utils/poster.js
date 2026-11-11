// What goes on a printed poster of a trip or one of its drives: its words, and its
// route already drawn into the poster's own units (see posterLayout.js), so the
// print server only has to draw what the preview shows.
import { landPath } from './countries';
import { distanceUnit, toDistance } from './format';
import { CENTRED, coverSize } from './photoCrop';
import { CIRCLE, IMAGE, mmPerUnit, posterLines } from './posterLayout';
import { fitInCircle, fitMap, pinPoint } from './routeOutline';
import { driveNumberFor, oneWayLabel, summarizeDrives, tripOneWayLabel, tripTitle } from './tripSummary';
import { vehicleLabel } from './vehicles';

export const SPEC_VERSION = 1;
const MAP_MARGIN = 48; // keeps the end dots well inside the image
// Below this, a photo starts to look soft on paper.
export const MIN_PHOTO_DPI = 150;

const MM_PER_INCH = 25.4;

/** "3 November 2026", "3–5 November 2026" or "28 October – 2 November 2026". */
function longDateRange(startTs, endTs) {
  const a = new Date(startTs);
  const b = new Date(endTs ?? startTs);
  const month = (d) => d.toLocaleDateString(undefined, { month: 'long' });
  const year = b.getFullYear();
  if (a.toDateString() === b.toDateString()) return `${a.getDate()} ${month(a)} ${year}`;
  if (a.getFullYear() !== year) {
    return `${a.getDate()} ${month(a)} ${a.getFullYear()} – ${b.getDate()} ${month(b)} ${year}`;
  }
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()} ${month(b)} ${year}`;
  return `${a.getDate()} ${month(a)} – ${b.getDate()} ${month(b)} ${year}`;
}

/** "485 miles" or "781 km", whole numbers: a poster doesn't need the decimal. */
function posterDistance(meters, units) {
  const value = Math.round(toDistance(meters, units)).toLocaleString();
  return `${value} ${units === 'imperial' ? 'miles' : distanceUnit(units)}`;
}

/**
 * The poster's words for `trip`, or for `drive` alone: { title, route, footer }.
 * The title is the trip's name; the route line starts with the vehicle when one
 * was driven, and a drive of a longer trip starts its footer with its number.
 */
export function posterText(trip, drive, vehicles, units) {
  const drives = drive ? [drive] : trip.drives;
  const title = tripTitle(trip) ?? longDateRange(drives[0].startedAt);
  const route = drive ? oneWayLabel(drive.places) : tripOneWayLabel(trip);
  const vehicleIds = [...new Set(drives.map((d) => d.vehicleId).filter((v) => v != null))];
  const vehicle = vehicleIds.length === 1 ? vehicles.find((v) => v.id === vehicleIds[0]) : null;
  const number = drive && trip.drives.length > 1 ? driveNumberFor(trip.drives, drive.startedAt) : null;
  return {
    title,
    // An unnamed trip is already titled by its route, so don't say it twice.
    route:
      [vehicle ? vehicleLabel(vehicle) : null, route === title ? null : route]
        .filter(Boolean)
        .join(' · ') || null,
    footer: [
      number ? `Drive ${number}` : null,
      posterDistance(summarizeDrives(drives).distanceM, units),
      longDateRange(drives[0].startedAt, drives.at(-1).endedAt),
    ]
      .filter(Boolean)
      .join(' · '),
  };
}

/** The route's lines, ends (or a pin) and land, placed by `fit` in a `width` x `height` box. */
function drawnRoute(segments, fit, width, height) {
  const routes = segments.map((s) => s.coordinates).filter((r) => r.length > 1);
  if (!fit || !routes.length) return null;
  const round = ([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  const pin = pinPoint(fit, routes);
  return {
    land: landPath(fit.project, width, height),
    lines: pin
      ? []
      : segments
          .filter((s) => s.coordinates.length > 1)
          .map((s) => ({ points: fit.points(s.coordinates), dotted: !!s.dotted })),
    start: pin ? null : round(fit.project(routes[0][0])),
    end: pin ? null : round(fit.project(routes.at(-1).at(-1))),
    pin: pin ? round(pin) : null,
  };
}

/**
 * Everything the poster shows, as plain data for the preview and the print server.
 * `segments` come from useTripPreview(); `photo` ({ id, width, height }) and `crop`
 * make it the photo poster. `size` is 'A3' or 'A2'.
 */
export function posterSpec({ text, segments, size, photo = null, crop = CENTRED }) {
  const routes = segments.map((s) => s.coordinates).filter((r) => r.length > 1);
  let map;
  if (photo) {
    const d = CIRCLE.r * 2;
    map = drawnRoute(segments, fitInCircle(routes, d, { map: true }), d, d);
  } else {
    const fit = fitMap(routes, IMAGE.width, IMAGE.height, MAP_MARGIN);
    map = drawnRoute(segments, fit, IMAGE.width, IMAGE.height);
  }
  return {
    v: SPEC_VERSION,
    size,
    edition: photo ? 'photo' : 'route',
    lines: posterLines(text),
    map,
    photo: photo ? { crop, width: photo.width, height: photo.height } : null,
  };
}

/**
 * How sharp `photo` prints at `size` when framed by `crop`, in dots per inch across
 * the image: the photo's pixels that show, over the paper they cover.
 */
export function photoDpi(photo, crop, size) {
  if (!photo?.width || !photo?.height) return null;
  const cover = coverSize(photo.width / photo.height, IMAGE.width, IMAGE.height);
  const shownPixels = (IMAGE.width / (cover.width * crop.zoom)) * photo.width;
  const inches = (IMAGE.width * mmPerUnit(size)) / MM_PER_INCH;
  return shownPixels / inches;
}

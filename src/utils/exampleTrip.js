// The example trip new installs start with, until the first drive is recorded
// (src/storage/exampleTrip.js): seven days from London to Edinburgh by the North
// Coast 500, from 1 January 2000. The route is bundled in src/data/exampleTrip.json
// (scripts/build-example-trip.mjs); stats are worked out here like a recording's.
import data from '../data/exampleTrip.json';
import { applyFixes, createTripStats, finalizeStats } from './geoMath';

export const EXAMPLE_TRIP_NAME = 'Example: London → Edinburgh';
export const EXAMPLE_TRIP_NOTES =
  'Seven days from London to Edinburgh by the North Coast 500. This example is removed when you record your first drive.';

/** [lat, lng] points of a Google encoded polyline (precision 5). */
function decodePolyline(str) {
  const points = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let b;
    do {
      b = str.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < str.length) {
    lat += next();
    lng += next();
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

/**
 * The drives, oldest first, timed in the phone's own time zone so day 1 is
 * always 1 January: [{ startedAt, endedAt, stats, places, fixes }].
 */
export function exampleDrives() {
  return data.drives.map((drive) => {
    const waits = new Map(drive.waits);
    let timestamp = new Date(2000, 0, 1, 0, drive.startMin).getTime();
    let altitude = 0;
    const fixes = decodePolyline(drive.line).map(([latitude, longitude], i) => {
      altitude += drive.alt[i];
      const fix = {
        latitude,
        longitude,
        altitude,
        altitudeAccuracy: null,
        accuracy: null,
        speed: null,
        timestamp,
      };
      timestamp += (data.intervalS + (waits.get(i) ?? 0)) * 1000;
      return fix;
    });
    return {
      startedAt: fixes[0].timestamp,
      endedAt: fixes.at(-1).timestamp,
      stats: finalizeStats(applyFixes(createTripStats(), fixes)),
      places: drive.places,
      fixes,
    };
  });
}

import { useEffect, useState } from 'react';

import { getDriveRoutePreview } from '../storage/driveStorage';
import { routeGaps, routeSegments } from '../utils/crossings';
import { useTheme } from './useTheme';

const POINTS_PER_PREVIEW = 300;

/**
 * Thinned route segments for a trip's map preview, in the accent colour,
 * crossings and pauses dotted. Null while loading. `points` sets how detailed it is.
 */
export function useTripPreview(trip, { points = POINTS_PER_PREVIEW } = {}) {
  const { c } = useTheme();
  const [result, setResult] = useState(null); // { key, segments }
  const driveKey = trip ? trip.drives.map((d) => `${d.id}:${routeGaps(d).length}`).join(',') : '';

  useEffect(() => {
    if (!trip) return;
    let cancelled = false;
    const perDrive = Math.max(40, Math.floor(points / trip.drives.length));
    Promise.all(
      trip.drives.map(async (d) =>
        routeSegments(
          `drive-${d.id}`,
          await getDriveRoutePreview(d.id, perDrive),
          routeGaps(d),
          c.accent
        )
      )
    )
      .then((byDrive) => !cancelled && setResult({ key: driveKey, segments: byDrive.flat() }))
      .catch((err) => console.warn('[preview] load failed', err));
    return () => {
      cancelled = true;
    };
    // Re-run only when the set of drives (or the theme) changes, not on every new trip object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driveKey, c, points]);

  // Ignore a result that belongs to a previous trip.
  return result && result.key === driveKey ? result.segments : null;
}

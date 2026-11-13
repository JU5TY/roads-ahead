import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { getDrivePoints } from '../storage/driveStorage';
import { getPlanTripId, listPlans } from '../storage/planStorage';
import { getTrip } from '../storage/tripStorage';
import { getReadyRoute, routeCompleted } from '../utils/readyRoutes';

// Route id → { key, completed }: the last answer and the drives it came from.
// A completed drive's points never change, so the same drives give the same
// answer without reading every point again on each focus.
const checked = new Map();

/** `completed` for a route driven as `trip`, worked out again only when its drives change. */
async function completedOf(route, trip) {
  const key = trip.drives.map((d) => `${d.id}:${d.startedAt}:${d.endedAt}`).join(',');
  const known = checked.get(route.id);
  if (known?.key === key) return known.completed;
  const points = (await Promise.all(trip.drives.map((d) => getDrivePoints(d.id)))).flat();
  const completed = routeCompleted(route, points)
    ? { from: trip.drives[0].startedAt, to: trip.drives.at(-1).endedAt }
    : null;
  checked.set(route.id, { key, completed });
  return completed;
}

/**
 * Where each Iconic Trip stands: a Map of route id → { plan, completed },
 * for the routes in your plans (the newest copy). `completed` is { from, to }
 * (when its trip was driven) once the trip the plan was driven as covers about
 * 90% of the route's line, in any order across its drives; else null. Null
 * while loading. Reloads on focus; each route's points are only read again
 * when its trip's drives change.
 */
export function useRouteStatus() {
  const [status, setStatus] = useState(null);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const out = new Map();
        // Newest first, so the newest copy of a route is the one kept.
        for (const plan of await listPlans()) {
          const route = plan.routeId ? getReadyRoute(plan.routeId) : null;
          if (!route || out.has(route.id)) continue;
          const tripId = await getPlanTripId(plan.id);
          const trip = tripId ? await getTrip(tripId) : null;
          const completed = trip?.drives.length ? await completedOf(route, trip) : null;
          out.set(route.id, { plan, completed });
        }
        if (!cancelled) setStatus(out);
      })().catch((err) => console.warn('[routes] status failed', err));
      return () => {
        cancelled = true;
      };
    }, [])
  );
  return status;
}

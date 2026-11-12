import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { getDrivePoints } from '../storage/driveStorage';
import { getPlanTripId, listPlans } from '../storage/planStorage';
import { getTrip } from '../storage/tripStorage';
import { getReadyRoute, routeCompleted } from '../utils/readyRoutes';

/**
 * Where each Iconic Trip stands: a Map of route id → { plan, completed },
 * for the routes in your plans (the newest copy). `completed` is { from, to }
 * (when its trip was driven) once the trip the plan was driven as covers about
 * 90% of the route's line, in any order across its drives; else null. Null
 * while loading. Reloads on focus.
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
          let completed = null;
          const tripId = await getPlanTripId(plan.id);
          const trip = tripId ? await getTrip(tripId) : null;
          if (trip?.drives.length) {
            const points = (await Promise.all(trip.drives.map((d) => getDrivePoints(d.id)))).flat();
            if (routeCompleted(route, points)) {
              completed = { from: trip.drives[0].startedAt, to: trip.drives.at(-1).endedAt };
            }
          }
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

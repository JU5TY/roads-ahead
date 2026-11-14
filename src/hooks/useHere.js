import Storage from 'expo-sqlite/kv-store';
import { useEffect, useState } from 'react';

import { getLastPosition } from '../services/locationService';
import { haversineDistance } from '../utils/geoMath';

// Plans route Drive 1 from where the phone is, and a road line is saved under
// its exact points (routeStorage.js). The phone's position drifts by metres
// even sitting still, so `here` snaps to a spot it was at before when it's
// within SNAP_M of it: the points match, the saved line is found, and Google
// isn't asked again. A few spots are kept (home, work, a holiday cottage).
const KEY = 'here.spots';
const SNAP_M = 300;
const MAX_SPOTS = 5;

function readSpots() {
  try {
    const spots = JSON.parse(Storage.getItemSync(KEY) ?? '[]');
    return Array.isArray(spots) ? spots : [];
  } catch {
    return [];
  }
}

/** The kept spot nearest `fix` within SNAP_M, else `fix` kept as a new spot. */
function snap(fix) {
  const spots = readSpots();
  let best = null;
  let bestM = SNAP_M;
  for (const spot of spots) {
    const m = haversineDistance(spot, fix);
    if (m <= bestM) {
      best = spot;
      bestM = m;
    }
  }
  const here = best ?? { latitude: fix.latitude, longitude: fix.longitude };
  // Most recent first, so the first frame of the next page starts from here.
  const kept = [here, ...spots.filter((s) => s !== best)].slice(0, MAX_SPOTS);
  Storage.setItemAsync(KEY, JSON.stringify(kept)).catch(() => {});
  return here;
}

/**
 * Where the phone last was, { latitude, longitude }, snapped to a spot it was
 * at before when it's close (see above). Until the phone answers, `here` is
 * the last spot used, so a plan's map draws its saved road lines from the
 * first frame instead of straight lines; `ready` turns true once the real
 * position is known or known to be missing (null for good without location
 * access, which isn't asked for just for this).
 */
export function useHere() {
  const [state, setState] = useState(() => ({ here: readSpots()[0] ?? null, ready: false }));
  useEffect(() => {
    let cancelled = false;
    getLastPosition().then((fix) => {
      if (cancelled) return;
      const here = fix ? snap(fix) : null;
      // Keep the same object when nothing moved, so maps and routes don't redo their work.
      setState((s) =>
        s.here && here && s.here.latitude === here.latitude && s.here.longitude === here.longitude
          ? { here: s.here, ready: true }
          : { here, ready: true }
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

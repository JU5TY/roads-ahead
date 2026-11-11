import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import { getLocationAccess } from '../services/locationService';

/**
 * Where the phone last was, { latitude, longitude }: null until known, and
 * null for good without location access (it isn't asked for just for this).
 * `ready` turns true once it's known or known to be missing.
 */
export function useHere() {
  const [state, setState] = useState({ here: null, ready: false });
  useEffect(() => {
    let cancelled = false;
    getLocationAccess()
      .then((access) => (access.granted ? Location.getLastKnownPositionAsync() : null))
      .catch(() => null)
      .then((pos) => {
        if (cancelled) return;
        const here = pos ? { latitude: pos.coords.latitude, longitude: pos.coords.longitude } : null;
        setState({ here, ready: true });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

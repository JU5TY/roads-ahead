import { useEffect, useState } from 'react';

import { getLastPosition } from '../services/locationService';

/**
 * Where the phone last was, { latitude, longitude }: null until known, and
 * null for good without location access (it isn't asked for just for this).
 * `ready` turns true once it's known or known to be missing.
 */
export function useHere() {
  const [state, setState] = useState({ here: null, ready: false });
  useEffect(() => {
    let cancelled = false;
    getLastPosition().then((here) => !cancelled && setState({ here, ready: true }));
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

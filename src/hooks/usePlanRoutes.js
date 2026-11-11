import { useEffect, useMemo, useState } from 'react';

import { routeDrive } from '../services/routing';
import { forgetOldLines, getSavedLine, routeKey, saveLine } from '../storage/routeStorage';
import { driveRoute } from '../utils/plans';

// Routes asked for since the app opened, by their points. Miles and times may
// not be kept, so they live only here and go when the app closes.
const memory = new Map();
let swept = false;

/**
 * A plan's road routes (pass the map's plan, fromHere). Only the `picked` drive
 * is asked for, once per app run unless its stops change; the other drives
 * draw from lines saved in the last 30 days. Returns { picked, lines }:
 * picked = { status: 'none' | 'loading' | 'done' | 'failed' | 'limited',
 * route?: { metres, seconds, legs, line }, legStops }, and lines[i] is drive
 * i's road line or null (draw it straight).
 */
export function usePlanRoutes(plan, picked) {
  const asks = useMemo(() => (plan ? plan.drives.map((_, i) => driveRoute(plan, i)) : []), [plan]);
  const keys = asks.map((a) => (a ? routeKey(a.points) : null));
  const keysId = keys.join('|');
  const pickedKey = keys[picked] ?? null;
  const [saved, setSaved] = useState({ id: '', lines: [] });
  const [answer, setAnswer] = useState({ key: null, status: 'loading' });

  useEffect(() => {
    if (swept) return;
    swept = true;
    forgetOldLines().catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all(keysId.split('|').map((k) => (k ? getSavedLine(k) : null))).then((lines) => {
      if (!cancelled) setSaved({ id: keysId, lines });
    });
    return () => {
      cancelled = true;
    };
  }, [keysId]);

  useEffect(() => {
    if (!pickedKey || memory.has(pickedKey)) return;
    const ask = asks[picked];
    const controller = new AbortController();
    routeDrive(ask.points, { signal: controller.signal }).then((result) => {
      if (result.cancelled) return;
      if (result.line) {
        memory.set(pickedKey, result);
        saveLine(pickedKey, result.line).catch(() => {});
      }
      setAnswer({ key: pickedKey, status: result.limited ? 'limited' : result.failed ? 'failed' : 'done' });
    });
    return () => controller.abort();
    // `asks` changes with `pickedKey`; the key alone says when to ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedKey]);

  const route = pickedKey ? memory.get(pickedKey) : undefined;
  let status = 'none';
  if (pickedKey) status = route ? 'done' : answer.key === pickedKey ? answer.status : 'loading';
  const lines = keys.map((k, i) => (k && memory.get(k)?.line) || (saved.id === keysId ? saved.lines[i] : null) || null);
  return { picked: { status, route, legStops: asks[picked]?.legStops ?? [] }, lines };
}

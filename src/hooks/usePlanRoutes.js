import { useEffect, useMemo, useState } from 'react';

import { routeDrive } from '../services/routing';
import { forgetOldLines, getSavedLineSync, routeKey, saveLine } from '../storage/routeStorage';
import { driveRoute } from '../utils/plans';

// Routes asked for since the app opened, by their points. Miles and times may
// not be kept, so they live only here and go when the app closes.
const memory = new Map();
// Saved lines, read from storage once per app run (null when there's none).
const saved = new Map();
let swept = false;

/** A drive's road line: asked for this run, else saved, else null (draw it straight). */
function lineFor(key) {
  if (!key) return null;
  if (memory.has(key)) return memory.get(key).line;
  if (!saved.has(key)) saved.set(key, getSavedLineSync(key));
  return saved.get(key);
}

/** A plan's saved road lines without asking for any (the Add stop map): lines[i] or null. */
export function useSavedLines(plan) {
  return useMemo(
    () =>
      plan
        ? plan.drives.map((_, i) => {
            const ask = driveRoute(plan, i);
            return ask ? lineFor(routeKey(ask.points)) : null;
          })
        : [],
    [plan]
  );
}

/**
 * A plan's road routes (pass the map's plan, mapPlanOf). Only the `picked`
 * drive is asked for, or every drive when `picked` is null (the All tab),
 * once per app run unless its stops change; the rest draw from lines saved in
 * the last 30 days. Returns { drives, lines }: drives[i] = { status: 'none' |
 * 'loading' | 'done' | 'failed' | 'limited', route?: { metres, seconds, legs,
 * line }, legStops }, 'none' for a drive with nowhere to go or not asked for;
 * lines[i] is drive i's road line or null (draw it straight). Nothing is asked
 * until `ready` (useHere's): Drive 1 with no start runs from the phone, so
 * asking sooner would pay for a route from the first stop, then again from here.
 */
export function usePlanRoutes(plan, picked, ready = true) {
  const asks = useMemo(() => (plan ? plan.drives.map((_, i) => driveRoute(plan, i)) : []), [plan]);
  const keys = asks.map((a) => (a ? routeKey(a.points) : null));
  const wanted = (picked == null ? keys : [keys[picked]]).filter(Boolean);
  const wantedId = wanted.join('|');
  // How each asked-for route came back, by its key: 'failed' | 'limited' (a found one is in `memory`).
  const [answers, setAnswers] = useState({});

  useEffect(() => {
    if (swept) return;
    swept = true;
    forgetOldLines().catch(() => {});
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    const controller = new AbortController();
    for (const key of new Set(wanted)) {
      if (memory.has(key)) continue;
      const ask = asks[keys.indexOf(key)];
      routeDrive(ask.points, { signal: controller.signal }).then((result) => {
        if (result.cancelled) return;
        if (result.line) {
          memory.set(key, result);
          saveLine(key, result.line).catch(() => {});
        }
        setAnswers((a) => ({ ...a, [key]: result.limited ? 'limited' : result.failed ? 'failed' : 'done' }));
      });
    }
    return () => controller.abort();
    // `asks` changes with the keys; the keys alone say when to ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedId, ready]);

  const drives = keys.map((key, i) => {
    const route = key ? memory.get(key) : undefined;
    let status = 'none';
    if (key && (route || wanted.includes(key))) status = route ? 'done' : (answers[key] ?? 'loading');
    if (status === 'done' && !route) status = 'failed';
    return { status, route, legStops: asks[i]?.legStops ?? [] };
  });
  return { drives, lines: keys.map(lineFor) };
}

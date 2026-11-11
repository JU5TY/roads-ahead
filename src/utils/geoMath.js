// Pure trip-metrics engine. No React, no I/O: the background task feeds raw GPS
// fixes into `applyFix`, persists the returned stats object as JSON, and feeds
// it back in on the next batch. Everything here is deterministic and testable.

const EARTH_RADIUS_M = 6371008.8;

// Rest-stop detection: staying within STOP_RADIUS_M of one spot for at least
// STOP_MIN_DURATION_MS. Unlike a speed threshold, this ignores slow-moving
// traffic jams, which keep creeping forward out of the radius.
export const STOP_RADIUS_M = 100;
export const STOP_MIN_DURATION_MS = 5 * 60 * 1000;
// Walking round a service station, or GPS drifting indoors, carries you out of
// the radius and back: a stop that starts within STOP_MERGE_M of the last one,
// after a short or walking-pace stretch, is the same stop carrying on.
const STOP_MERGE_M = 500;
const STOP_MERGE_SPEED_MPS = 3; // about 7 mph: on foot, not driving
/** A drive stopped this long (not paused) was left running: it ends where it stopped. */
export const AUTO_STOP_AFTER_MS = 3 * 60 * 60 * 1000;
/** A stop or pause this long counts as a break: it resets the break reminder. */
export const BREAK_MIN_MS = 15 * 60 * 1000;
const STOP_SPEED_MPS = 5 / 3.6; // "stationary" for long GPS gaps and the live break timer

// Top speed must be held at least this long to count.
const TOP_SPEED_SUSTAIN_MS = 3000;

// Noise filters.
const MAX_HORIZONTAL_ACCURACY_M = 50; // discard fixes worse than this
const MAX_ALTITUDE_ACCURACY_M = 25; // ignore altitude worse than this
const MAX_PLAUSIBLE_SPEED_MPS = 90; // ~324 km/h, anything above is a GPS glitch
const ELEVATION_HYSTERESIS_M = 5; // altitude must move this much to count as climb
const LONG_GAP_MS = 30 * 1000; // a gap this long breaks the top-speed window
const STALE_FIX_MS = 20 * 1000; // live "current speed" drops to 0 after this

const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance in meters between two {latitude, longitude} points. */
export function haversineDistance(a, b) {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Normalise an expo-location LocationObject into the flat fix shape we store. */
export function toFix(location) {
  const { coords, timestamp } = location;
  const valid = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const speed = valid(coords.speed);
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    altitude: valid(coords.altitude),
    altitudeAccuracy: valid(coords.altitudeAccuracy),
    accuracy: valid(coords.accuracy),
    // iOS reports -1 when speed is unknown.
    speed: speed !== null && speed >= 0 ? speed : null,
    timestamp,
  };
}

export function createTripStats() {
  return {
    distanceM: 0,
    movingTimeMs: 0,
    topSpeedMps: 0,
    maxAltitudeM: null,
    elevationGainM: 0,
    stopCount: 0,
    totalStopMs: 0,
    stops: [], // [{ startedAt, endedAt, latitude, longitude }]
    currentStintMs: 0, // driving time since the last rest stop
    longestStintMs: 0,
    // Driving since the last rest stop, { distanceM, movingTimeMs }, to tell a
    // walk round the stop from a drive to the next one. Null before the first
    // stop and after a ferry or pause, when nothing should join up.
    sinceStop: null,
    lastFix: null,
    currentAltitudeM: null,
    // Time spent near one spot. Becomes a rest stop if it lasts long enough;
    // otherwise its time and distance count as driving.
    dwell: null, // { latitude, longitude, startedAt, durationMs, lastInside }
    speedWindow: [], // recent { t, v } samples for sustained top speed
    altitudeRef: null, // reference altitude for hysteresis-based gain
    // Pauses from the Pause button, drawn dotted like a ferry (see utils/crossings.js):
    // { kind: 'pause', pausedAt, resumedAt, startedAt, endedAt, from, to, distanceM },
    // startedAt / from the last fix before it, endedAt / to the first fix after.
    // The latest is open (endedAt null) from Pause until the first fix after Resume.
    pauses: [],
    paused: false,
  };
}

export function isUsableFix(fix) {
  return (
    Number.isFinite(fix.latitude) &&
    Number.isFinite(fix.longitude) &&
    (fix.accuracy === null || fix.accuracy <= MAX_HORIZONTAL_ACCURACY_M)
  );
}

function addDriving(stats, ms, meters) {
  const currentStintMs = stats.currentStintMs + ms;
  const since = stats.sinceStop;
  return {
    ...stats,
    movingTimeMs: stats.movingTimeMs + ms,
    distanceM: stats.distanceM + meters,
    currentStintMs,
    longestStintMs: Math.max(stats.longestStintMs, currentStintMs),
    sinceStop: since
      ? { distanceM: since.distanceM + meters, movingTimeMs: since.movingTimeMs + ms }
      : null,
  };
}

/** Whether a stop at `dwell` carries on the last one: nearby, and only walked to. */
function joinsLastStop(stats, dwell) {
  const last = stats.stops.at(-1);
  const since = stats.sinceStop;
  if (!last || !since || haversineDistance(last, dwell) > STOP_MERGE_M) return false;
  const speed = since.movingTimeMs > 0 ? since.distanceM / (since.movingTimeMs / 1000) : 0;
  return since.distanceM <= STOP_MERGE_M || speed < STOP_MERGE_SPEED_MPS;
}

/** Distance covered inside a dwell that turned out not to be a stop. */
const dwellDistance = (dwell) => haversineDistance(dwell, dwell.lastInside);

/**
 * Close a dwell. Long ones become rest stops (excluded from moving time, no
 * distance: movement inside the radius is GPS jitter); short ones (traffic
 * lights, queues) count as driving.
 */
function closeDwell(stats, endedAt) {
  const dwell = stats.dwell;
  const next = { ...stats, dwell: null };
  if (!dwell) return next;
  // Sitting still before setting off is neither driving nor a rest stop.
  if (stats.distanceM === 0) {
    const pulledAway = dwell.durationMs < STOP_MIN_DURATION_MS;
    return pulledAway ? { ...next, distanceM: dwellDistance(dwell) } : next;
  }
  if (dwell.durationMs < STOP_MIN_DURATION_MS) {
    return addDriving(next, dwell.durationMs, dwellDistance(dwell));
  }
  if (joinsLastStop(stats, dwell)) {
    // One longer stop: the walk in between is neither driving nor distance.
    const last = stats.stops.at(-1);
    const since = stats.sinceStop;
    const merged = { ...last, endedAt };
    return {
      ...next,
      distanceM: stats.distanceM - since.distanceM,
      movingTimeMs: stats.movingTimeMs - since.movingTimeMs,
      totalStopMs: stats.totalStopMs + (endedAt - last.endedAt),
      stops: [...stats.stops.slice(0, -1), merged],
      currentStintMs:
        endedAt - last.startedAt >= BREAK_MIN_MS
          ? 0
          : Math.max(0, stats.currentStintMs - since.movingTimeMs),
      sinceStop: { distanceM: 0, movingTimeMs: 0 },
    };
  }
  return {
    ...next,
    sinceStop: { distanceM: 0, movingTimeMs: 0 },
    stopCount: stats.stopCount + 1,
    totalStopMs: stats.totalStopMs + dwell.durationMs,
    stops: [
      ...stats.stops,
      {
        startedAt: dwell.startedAt,
        endedAt,
        latitude: dwell.latitude,
        longitude: dwell.longitude,
      },
    ],
    // Only a long enough stop counts as a break.
    currentStintMs: dwell.durationMs >= BREAK_MIN_MS ? 0 : stats.currentStintMs,
  };
}

const openDwell = (fix) => ({
  latitude: fix.latitude,
  longitude: fix.longitude,
  startedAt: fix.timestamp,
  durationMs: 0,
  lastInside: { latitude: fix.latitude, longitude: fix.longitude, timestamp: fix.timestamp },
});

function updateElevation(stats, fix) {
  if (fix.altitude === null) return stats;
  if (fix.altitudeAccuracy !== null && fix.altitudeAccuracy > MAX_ALTITUDE_ACCURACY_M) {
    return stats;
  }
  const next = {
    ...stats,
    currentAltitudeM: fix.altitude,
    maxAltitudeM: stats.maxAltitudeM === null ? fix.altitude : Math.max(stats.maxAltitudeM, fix.altitude),
  };
  if (stats.altitudeRef === null) {
    next.altitudeRef = fix.altitude;
  } else {
    const delta = fix.altitude - stats.altitudeRef;
    if (delta >= ELEVATION_HYSTERESIS_M) {
      next.elevationGainM += delta;
      next.altitudeRef = fix.altitude;
    } else if (delta <= -ELEVATION_HYSTERESIS_M) {
      next.altitudeRef = fix.altitude;
    }
  }
  return next;
}

/**
 * Top speed is the highest speed held for TOP_SPEED_SUSTAIN_MS: the minimum of
 * the samples covering the last few seconds, so a single spike never counts.
 */
function updateTopSpeed(stats, t, v, dtMs) {
  let window = dtMs > LONG_GAP_MS ? [] : [...stats.speedWindow];
  window.push({ t, v });
  while (window.length > 1 && window[1].t <= t - TOP_SPEED_SUSTAIN_MS) window.shift();
  let topSpeedMps = stats.topSpeedMps;
  if (window[window.length - 1].t - window[0].t >= TOP_SPEED_SUSTAIN_MS) {
    topSpeedMps = Math.max(topSpeedMps, Math.min(...window.map((s) => s.v)));
  }
  return { ...stats, speedWindow: window, topSpeedMps };
}

const coordsOf = (p) => ({ latitude: p.latitude, longitude: p.longitude });

/** The pause still open (paused, or resumed and waiting for a fix), if any. */
const openPause = (stats) => {
  const last = stats.pauses?.at(-1);
  return last && last.endedAt === null ? last : null;
};

/** Pause at `now`: no fix counts until Resume, and the gap is left out of driving. */
export function pauseStats(stats, now) {
  if (stats.paused) return stats;
  const last = stats.lastFix;
  const pause = {
    kind: 'pause',
    pausedAt: now,
    resumedAt: null,
    startedAt: last?.timestamp ?? now,
    endedAt: null,
    from: last ? coordsOf(last) : null,
    to: null,
    distanceM: 0,
  };
  return { ...stats, paused: true, pauses: [...(stats.pauses ?? []), pause] };
}

/** Resume at `now`. The pause closes at the next fix (see applyFix). */
export function resumeStats(stats, now) {
  if (!stats.paused) return stats;
  const pauses = [...stats.pauses];
  pauses[pauses.length - 1] = { ...pauses.at(-1), resumedAt: now };
  return { ...stats, paused: false, pauses };
}

/** The first fix after Resume: close the pause there and carry on, as after a ferry. */
function closePause(stats, fix, pause) {
  const earlier = stats.pauses.slice(0, -1);
  // Paused before the first fix: there's no gap to draw.
  if (!pause.from) return applyFix({ ...stats, pauses: earlier }, fix);
  const next = skipTo(stats, fix, {
    resetStint: (pause.resumedAt ?? fix.timestamp) - pause.pausedAt >= BREAK_MIN_MS,
  });
  if (next === stats) return stats;
  const closed = {
    ...pause,
    endedAt: fix.timestamp,
    to: coordsOf(fix),
    distanceM: Math.round(haversineDistance(pause.from, fix)),
  };
  return { ...next, pauses: [...earlier, closed] };
}

/** Fold one GPS fix into the running stats. Returns a new stats object. */
export function applyFix(stats, fix) {
  if (!isUsableFix(fix)) return stats;
  if (stats.paused) return stats; // nothing counts while paused
  const pause = openPause(stats);
  if (pause) return closePause(stats, fix, pause);
  const prev = stats.lastFix;
  if (prev && fix.timestamp <= prev.timestamp) return stats; // duplicate / out of order

  if (!prev) {
    return { ...updateElevation(stats, fix), lastFix: fix, dwell: openDwell(fix) };
  }

  const dtMs = fix.timestamp - prev.timestamp;
  const segmentM = haversineDistance(prev, fix);
  const derivedSpeed = segmentM / (dtMs / 1000);
  if (derivedSpeed > MAX_PLAUSIBLE_SPEED_MPS) {
    return stats; // position jump: drop the fix
  }

  let next = updateElevation(stats, fix);
  const dwell = next.dwell ?? openDwell(prev);

  if (haversineDistance(dwell, fix) <= STOP_RADIUS_M) {
    // Still near the same spot (or crawling). Decide what it was once we leave.
    next = {
      ...next,
      dwell: {
        ...dwell,
        durationMs: dwell.durationMs + dtMs,
        lastInside: { latitude: fix.latitude, longitude: fix.longitude, timestamp: fix.timestamp },
      },
    };
  } else {
    // A long, slow gap (signal lost while parked, regained down the road) is
    // part of the stop rather than driving.
    const gapIsStop = dtMs >= STOP_MIN_DURATION_MS && derivedSpeed < STOP_SPEED_MPS;
    if (gapIsStop) {
      next = closeDwell(
        { ...next, dwell: { ...dwell, durationMs: dwell.durationMs + dtMs } },
        fix.timestamp
      );
      next.distanceM += segmentM;
    } else {
      next = addDriving(closeDwell({ ...next, dwell }, prev.timestamp), dtMs, segmentM);
    }
    next.dwell = openDwell(fix);
  }

  const speed = fix.speed ?? derivedSpeed;
  if (speed <= MAX_PLAUSIBLE_SPEED_MPS) {
    next = updateTopSpeed(next, fix.timestamp, speed, dtMs);
  }

  return { ...next, lastFix: fix };
}

/**
 * Carry on from `fix` after a ferry, tunnel or pause: the gap counts as neither
 * driving nor a rest stop, and top speed starts afresh. The driving stint starts
 * afresh too, unless `resetStint` is false (a pause too short to be a break).
 */
export function skipTo(stats, fix, { resetStint = true } = {}) {
  if (!stats.lastFix) return applyFix(stats, fix);
  if (!isUsableFix(fix) || fix.timestamp <= stats.lastFix.timestamp) return stats;
  const next = closeDwell(stats, stats.lastFix.timestamp);
  return {
    ...updateElevation(next, fix),
    lastFix: fix,
    dwell: openDwell(fix),
    speedWindow: [],
    currentStintMs: resetStint ? 0 : next.currentStintMs,
    sinceStop: null, // a stop either side of a ferry or pause stays two stops
  };
}

/**
 * When the car stopped, if it hasn't driven since: the start of the stop it's
 * at now, a walk round it included. Null while driving or paused.
 */
export function stoppedSince(stats) {
  if (stats.paused || !stats.dwell) return null;
  return joinsLastStop(stats, stats.dwell) ? stats.stops.at(-1).startedAt : stats.dwell.startedAt;
}

/** Whether the drive has sat stopped (not paused) for AUTO_STOP_AFTER_MS by `now`. */
export function isLeftRunning(stats, now) {
  const since = stoppedSince(stats);
  return since !== null && now - since >= AUTO_STOP_AFTER_MS;
}

/** Fold a batch of fixes, oldest first. */
export function applyFixes(stats, fixes) {
  // Fill in fields added after a trip was started with an older version.
  const base = { ...createTripStats(), ...stats };
  return [...fixes].sort((a, b) => a.timestamp - b.timestamp).reduce(applyFix, base);
}

/**
 * Close out a trip. A short dwell still open at the end counts as driving; a
 * long one (parked before pressing STOP) is excluded but is not a rest stop.
 * A pause still open (stopped while paused) has nothing after it, so it goes.
 */
export function finalizeStats(stats) {
  const { dwell } = stats;
  const pauses = (stats.pauses ?? []).filter((p) => p.endedAt !== null);
  const next = { ...stats, dwell: null, speedWindow: [], paused: false, pauses };
  if (dwell && dwell.durationMs < STOP_MIN_DURATION_MS) {
    return addDriving(next, dwell.durationMs, dwellDistance(dwell));
  }
  return next;
}

/** Moving average speed in m/s (distance / moving drive time). */
export function averageMovingSpeed(stats) {
  return stats.movingTimeMs > 0 ? stats.distanceM / (stats.movingTimeMs / 1000) : 0;
}

/** Overall average speed in m/s (distance / total elapsed time, stops included). */
export function averageOverallSpeed(trip) {
  const elapsedMs = (trip.endedAt ?? Date.now()) - trip.startedAt;
  return elapsedMs > 0 ? trip.stats.distanceM / (elapsedMs / 1000) : 0;
}

/** Driving time since the last rest stop, including a short dwell still in progress. */
export function drivingSinceBreakMs(stats) {
  // Before the car first moves, nothing counts as driving yet.
  const counts = stats.dwell && stats.distanceM > 0 && stats.dwell.durationMs < STOP_MIN_DURATION_MS;
  return (stats.currentStintMs ?? 0) + (counts ? stats.dwell.durationMs : 0);
}

/** Live view of an in-progress trip, evaluated at `now`. */
export function liveMetrics(trip, now = Date.now()) {
  const { stats, startedAt } = trip;
  const last = stats.lastFix;
  // Paused (or resumed, waiting for a fix): everything holds as it was at Pause.
  const pause = openPause(stats);
  const at = pause ? Math.min(now, pause.pausedAt) : now;
  const pausedForMs = pause ? (pause.resumedAt ?? now) - pause.pausedAt : 0;
  const fresh = last && at - last.timestamp < STALE_FIX_MS;
  // Phones send no fixes while stationary, so time since the last fix counts as dwelling.
  const sinceLastFix = last ? Math.max(0, at - last.timestamp) : 0;
  const dwellMs = (stats.dwell?.durationMs ?? 0) + sinceLastFix;
  const longDwell = Boolean(last) && dwellMs >= STOP_MIN_DURATION_MS;
  // The break timer ticks between fixes while rolling, and holds while stationary
  // (a short stop is added when the car moves off; a long one resets it to 0).
  const hasMoved = stats.distanceM > 0;
  const rollingNow = fresh && (last.speed ?? 0) >= STOP_SPEED_MPS;
  // Distance is only credited after leaving the starting spot, so also treat
  // "currently rolling" as set off.
  const waitingToSetOff = Boolean(last) && !hasMoved && !rollingNow;
  // Idle before setting off is not a rest stop.
  const isAutoPaused = longDwell && hasMoved;
  // A long enough stop or pause is a break: the break timer starts again.
  const onBreak = (isAutoPaused && dwellMs >= BREAK_MIN_MS) || pausedForMs >= BREAK_MIN_MS;
  // Capped rather than dropped when fixes stop (tunnels), so it never steps backwards.
  // Nothing counts until the car has left its starting spot: before then each new
  // fix would reset it, so the timers flicked 0:00, 0:01, 0:00, 0:01 when setting off.
  const rollingMs =
    hasMoved && last && (last.speed ?? 0) >= STOP_SPEED_MPS
      ? Math.min(sinceLastFix, STALE_FIX_MS)
      : 0;
  // Include the not-yet-classified dwell so the numbers don't lag behind.
  const pending = stats.dwell && !longDwell ? stats.dwell : null;
  return {
    currentSpeedMps: fresh ? last.speed ?? 0 : 0,
    distanceM: stats.distanceM + (pending ? dwellDistance(pending) : 0),
    elapsedMs: now - startedAt,
    currentAltitudeM: stats.currentAltitudeM,
    stintMs: onBreak || !hasMoved ? 0 : drivingSinceBreakMs(stats) + (isAutoPaused ? 0 : rollingMs),
    // Driving time so far, counting a short stop in progress (as the break timer does).
    drivingMs:
      stats.movingTimeMs +
      (pending && hasMoved ? pending.durationMs : 0) +
      (isAutoPaused ? 0 : rollingMs),
    isAutoPaused,
    isPaused: Boolean(stats.paused),
    waitingToSetOff,
    hasFix: Boolean(last),
  };
}

/** Thin a long track to at most `maxPoints` for rendering, always keeping the endpoints. */
export function downsample(points, maxPoints = 2000) {
  if (points.length <= maxPoints) return points;
  const step = (points.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, i) => points[Math.round(i * step)]);
}

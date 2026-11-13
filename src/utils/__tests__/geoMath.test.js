import {
  applyFixes,
  createTripStats,
  finalizeStats,
  leftRunningSince,
  pauseStats,
  resumeStats,
  stoppedSince,
} from '../geoMath';

// Fixes along a north-south line: `at(metresNorth, secondsLater)`.
const M = 1 / 111320;
const T0 = Date.UTC(2026, 10, 10, 17, 5);
function track(build) {
  const fixes = [];
  let t = T0;
  const at = (north, dt) => {
    t += dt * 1000;
    fixes.push({
      latitude: 50.84 + north * M,
      longitude: -0.15,
      accuracy: 10,
      altitude: null,
      altitudeAccuracy: null,
      speed: null,
      timestamp: t,
    });
  };
  const drive = (from, to, seconds) => {
    for (let i = 1; i <= seconds / 5; i++) at(from + ((to - from) * i) / (seconds / 5), 5);
  };
  const stay = (where, seconds) => {
    for (let i = 0; i < seconds / 5; i++) at(where, 5);
  };
  at(0, 0);
  build({ at, drive, stay });
  return { stats: applyFixes(createTripStats(), fixes), end: t };
}
const minutes = (s) => Math.round((s.endedAt - s.startedAt) / 60000);

describe('rest stops', () => {
  it('keeps GPS drift indoors as one stop (the gym)', () => {
    const { stats } = track(({ drive, stay, at }) => {
      drive(0, 13000, 960);
      stay(13000, 420);
      at(13150, 5); // drifts 150 m
      stay(13150, 1980);
      drive(13150, 17000, 660);
    });
    const s = finalizeStats(stats);
    expect(s.stops.map(minutes)).toEqual([40]);
  });

  it('joins a walk round a service station into one stop, not counted as driving', () => {
    const { stats } = track(({ drive, stay }) => {
      drive(0, 20000, 900);
      stay(20000, 360);
      drive(20000, 20300, 215); // walking to the shop
      stay(20300, 600);
      drive(20300, 20000, 215);
      stay(20000, 360);
      drive(20000, 40000, 900);
    });
    const s = finalizeStats(stats);
    expect(s.stops).toHaveLength(1);
    expect(s.distanceM).toBeLessThan(40100);
  });

  it('keeps two real stops apart', () => {
    const { stats } = track(({ drive, stay }) => {
      drive(0, 10000, 600);
      stay(10000, 400);
      drive(10000, 13000, 180);
      stay(13000, 400);
      drive(13000, 20000, 420);
    });
    expect(finalizeStats(stats).stops).toHaveLength(2);
  });
});

describe('a drive left running', () => {
  const gym = ({ drive, stay, at }) => {
    drive(0, 13000, 960);
    stay(13000, 420);
    at(13150, 5);
    stay(13150, 1980);
  };

  it('counts from when the car stopped, walks round the stop included', () => {
    const { stats } = track(gym);
    expect(stoppedSince(stats)).toBe(T0 + 960 * 1000);
  });

  it('ends after 3 hours stopped, not before', () => {
    const { stats } = track(gym);
    const since = stoppedSince(stats);
    const drive = { startedAt: T0, stats };
    expect(leftRunningSince(drive, since + 179 * 60000)).toBeNull();
    expect(leftRunningSince(drive, since + 180 * 60000)).toBe(since);
  });

  it('counts a drive that never got a fix from its start', () => {
    const drive = { startedAt: T0, stats: createTripStats() };
    expect(leftRunningSince(drive, T0 + 179 * 60000)).toBeNull();
    expect(leftRunningSince(drive, T0 + 180 * 60000)).toBe(T0);
  });

  it('never ends a paused drive', () => {
    const { stats, end } = track(({ drive, stay }) => {
      drive(0, 13000, 960);
      stay(13000, 420);
    });
    const paused = pauseStats(stats, end);
    expect(leftRunningSince({ startedAt: T0, stats: paused }, end + 10 * 60 * 60000)).toBeNull();
  });

  it("doesn't end a drive just resumed after a long pause", () => {
    const { stats, end } = track(({ drive, stay }) => {
      drive(0, 13000, 960);
      stay(13000, 420);
    });
    const resumedAt = end + 4 * 60 * 60000;
    const resumed = resumeStats(pauseStats(stats, end), resumedAt);
    expect(stoppedSince(resumed)).toBeNull();
    expect(leftRunningSince({ startedAt: T0, stats: resumed }, resumedAt + 60000)).toBeNull();
    // The stop before the pause is kept as a rest stop.
    expect(finalizeStats(resumed).stops).toHaveLength(1);
  });
});

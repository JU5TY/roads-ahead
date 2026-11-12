import {
  READY_ROUTES,
  getReadyRoute,
  lineCoverage,
  routeCompleted,
  routeDriveLine,
  routeDriveTitle,
  routePlanDrives,
} from '../readyRoutes';

const nc500 = getReadyRoute('nc500');

describe('ready-made routes', () => {
  it('has the North Coast 500, a loop from Inverness in five drives', () => {
    expect(READY_ROUTES.map((r) => r.id)).toEqual(['nc500']);
    expect(nc500.drives).toHaveLength(5);
    expect(nc500.drives[0].start.name).toBe('Inverness');
    expect(nc500.drives.at(-1).stops.at(-1).name).toBe('Inverness');
    // Between 450 and 550 miles all told.
    expect(nc500.metres / 1609.344).toBeGreaterThan(450);
    expect(nc500.metres / 1609.344).toBeLessThan(550);
  });

  it('has a leg for every stop, adding up to each drive', () => {
    for (const drive of nc500.drives) {
      expect(drive.legs).toHaveLength(drive.stops.length);
      expect(drive.legs.reduce((a, b) => a + b, 0)).toBe(drive.metres);
      expect(drive.line.length).toBeGreaterThan(100);
    }
  });

  it('copies as plan drives: Drive 1 starts in Inverness, the rest follow on', () => {
    const drives = routePlanDrives(nc500);
    expect(drives[0].start.name).toBe('Inverness');
    expect(drives.slice(1).every((d) => d.start === null)).toBe(true);
    expect(drives[0].stops.find((s) => s.roadId)).toMatchObject({ roadId: 'bealach-na-ba', reversed: false });
  });

  it('names its drives and says what is in them', () => {
    expect(routeDriveTitle(nc500, 0)).toBe('Day 1 · Inverness → Applecross');
    expect(routeDriveTitle(nc500, 1)).toBe('Day 2 · Applecross → Ullapool');
    expect(routeDriveLine(nc500, 0, 'imperial')).toMatch(/^\d+ mi · Bealach na Bà · 2 stops$/);
    expect(routeDriveLine(nc500, 2, 'imperial')).toMatch(/^\d+ mi · 2 stops$/);
  });
});

describe('route coverage', () => {
  const line = nc500.drives.flatMap((d) => d.line);
  // A recording along the route, a little off the line as GPS is.
  const along = (from, to) =>
    line.slice(from, to).map(([latitude, longitude]) => ({ latitude: latitude + 0.0005, longitude }));

  it('covers nothing without a recording', () => {
    expect(lineCoverage(line, [])).toBe(0);
  });

  it('counts the line driven, in any order, across drives', () => {
    const half = Math.floor(line.length / 2);
    expect(lineCoverage(line, [...along(half, line.length), ...along(0, half)])).toBeGreaterThan(0.99);
    expect(lineCoverage(line, along(0, half))).toBeCloseTo(0.5, 1);
  });

  it('ignores driving somewhere else', () => {
    // The same shape, well south in England.
    const away = line.map(([latitude, longitude]) => ({ latitude: latitude - 4, longitude }));
    expect(lineCoverage(line, away)).toBe(0);
  });

  it('completes the route at about 90%, not before', () => {
    const n = line.length;
    expect(routeCompleted(nc500, along(0, Math.ceil(n * 0.92)))).toBe(true);
    expect(routeCompleted(nc500, along(0, Math.floor(n * 0.85)))).toBe(false);
  });
});

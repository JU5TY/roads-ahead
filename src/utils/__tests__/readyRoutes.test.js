import {
  READY_ROUTES,
  getReadyRoute,
  lineCoverage,
  routeCompleted,
  routeDriveFrom,
  routeDriveLine,
  routeDriveRoads,
  routeLabel,
  routePlanDrives,
  tripsIntro,
} from '../readyRoutes';

const nc500 = getReadyRoute('nc500');

describe('Iconic Trips', () => {
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

  it('is a round trip, and says where each drive starts and what is in it', () => {
    expect(routeLabel(nc500)).toBe('Round trip from Inverness');
    expect(routeDriveFrom(nc500, 0)).toBe('Inverness');
    expect(routeDriveFrom(nc500, 1)).toBe('Applecross');
    expect(routeDriveLine(nc500, 0, 'imperial')).toMatch(/^\d+ mi · 2 stops$/);
    expect(routeDriveRoads(nc500, 0)).toEqual(['Bealach na Bà']);
    expect(routeDriveRoads(nc500, 2)).toEqual([]);
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

describe('tripsIntro', () => {
  const trip = (country) => ({ country });

  it('counts the UK and Europe, like Iconic Roads', () => {
    expect(tripsIntro([trip('Scotland'), trip('Northern Ireland'), trip('France')])).toBe(
      "The UK's top 2 road trips and Europe's top 1, waiting to be driven."
    );
  });

  it('leaves out a side with none, and says one trip as one', () => {
    expect(tripsIntro([trip('Scotland')])).toBe("The UK's top road trip, waiting to be driven.");
    expect(tripsIntro([trip('France'), trip('Italy')])).toBe("Europe's top 2 road trips, waiting to be driven.");
  });
});

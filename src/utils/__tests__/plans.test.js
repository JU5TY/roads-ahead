import { getRoad } from '../iconicRoads';
import { roadGuidePoints } from '../navLinks';
import {
  addPosition,
  dateKey,
  dateOf,
  drivePoints,
  driveRoute,
  driveMarkers,
  driveStart,
  fromHere,
  groupPlans,
  planKicker,
  planHandover,
  planProgress,
  planOutline,
  regroupDays,
  roadReversedFrom,
  roadStop,
  roadsNear,
  stopName,
  stopCounts,
  stopsPassed,
  withWayBack,
} from '../plans';

const bealach = getRoad('bealach-na-ba');
const place = (name, latitude, longitude, source = 'pin') => ({
  name,
  latitude,
  longitude,
  source,
  roadId: null,
  reversed: false,
});
const road = (reversed = false) => {
  const [latitude, longitude] = bealach.line[0];
  return { name: null, latitude, longitude, source: 'pin', roadId: bealach.id, reversed };
};
const fortWilliam = place('Fort William', 56.8198, -5.1052);
const fortAugustus = place('Fort Augustus', 57.1447, -4.6814, 'search');
const eileanDonan = place('Eilean Donan Castle', 57.274, -5.5161, 'search');
const applecross = place('Applecross', 57.4335, -5.815);
const plan = (...drives) => ({ drives: drives.map((d, i) => ({ id: i + 1, position: i, start: null, ...d })) });

describe('addPosition', () => {
  const twoDays = plan(
    { start: fortWilliam, stops: [fortAugustus, eileanDonan] },
    { stops: [applecross] }
  );

  it('puts a new place before where a day stays the night', () => {
    // Day 1 stays at Eilean Donan (its last stop): a new place goes just before it.
    expect(addPosition(twoDays, 0)).toBe(1);
  });

  it('adds at the end of the last day, and of an empty day', () => {
    expect(addPosition(twoDays, 1)).toBeNull();
    expect(addPosition(plan({ stops: [] }, { stops: [] }), 0)).toBeNull();
  });

  it('turns an Iconic Road from where the day has got to before its stay', () => {
    // Before Eilean Donan, Day 1 has reached Fort Augustus, not Eilean Donan.
    const stop = roadStop(twoDays, 0, bealach);
    expect(stop.reversed).toBe(roadReversedFrom(bealach, fortAugustus));
  });
});

describe('driveStart', () => {
  it('leaves Drive 1 to start wherever the phone is', () => {
    expect(driveStart(plan({ stops: [fortAugustus] }), 0)).toBeNull();
  });

  it('starts a drive where the one before ends, linked', () => {
    const p = plan({ stops: [fortWilliam, fortAugustus] }, { stops: [applecross] });
    expect(driveStart(p, 1)).toMatchObject({ name: 'Fort Augustus', linked: true });
  });

  it('keeps a start set by hand', () => {
    const p = plan({ stops: [fortAugustus] }, { start: { name: 'Ullapool', latitude: 57.9, longitude: -5.16 }, stops: [] });
    expect(driveStart(p, 1)).toEqual({ name: 'Ullapool', latitude: 57.9, longitude: -5.16, linked: false });
  });

  it('starts after an Iconic Road at its far end, either way round', () => {
    const forward = driveStart(plan({ stops: [road(false)] }, { stops: [] }), 1);
    const back = driveStart(plan({ stops: [road(true)] }, { stops: [] }), 1);
    expect([forward.latitude, forward.longitude]).toEqual(bealach.line.at(-1));
    expect([back.latitude, back.longitude]).toEqual(bealach.line[0]);
  });

  it('follows a drive with no stops yet back to its start', () => {
    const p = plan({ stops: [fortAugustus] }, { stops: [] }, { stops: [] });
    expect(driveStart(p, 2)).toMatchObject({ name: 'Fort Augustus', linked: true });
  });
});

describe('drivePoints', () => {
  it('gives the stops in order, an Iconic Road as one guide point, the finish last', () => {
    const p = plan({ stops: [fortAugustus, eileanDonan, road(), applecross] });
    const points = drivePoints(p, 0);
    expect(points).toHaveLength(4);
    expect(points[2].road).toBe(bealach.id);
    expect(points.at(-1)).toEqual({ latitude: 57.4335, longitude: -5.815 });
  });

  it('names stops picked from search, and only those', () => {
    const [augustus, , applecrossPoint] = drivePoints(plan({ stops: [fortAugustus, road(), applecross] }), 0);
    expect(augustus.name).toBe('Fort Augustus');
    expect(applecrossPoint.name).toBeUndefined();
  });

  it('ends at the far end of an Iconic Road that finishes the drive', () => {
    const points = drivePoints(plan({ stops: [eileanDonan, road()] }), 0);
    expect(points).toHaveLength(3);
    const end = points.at(-1);
    expect([end.latitude, end.longitude]).toEqual(bealach.line.at(-1));
  });

  it('adds the start first when the driver isn’t there yet', () => {
    const p = plan({ stops: [fortWilliam] }, { stops: [applecross] });
    const points = drivePoints(p, 1, { fromStart: true });
    expect(points[0].name).toBe('Fort William');
    expect(points).toHaveLength(2);
  });
});

describe('groupPlans', () => {
  const p = (id, startDate, createdAt, driveIds) => ({
    id,
    startDate,
    createdAt,
    drives: driveIds.map((d) => ({ id: d, stops: [] })),
  });
  it('puts dated plans in Coming up (soonest first), undated in Someday, driven in Done', () => {
    const plans = [
      p(1, '2027-05-14', 1, [11, 12]),
      p(2, null, 2, [21]),
      p(3, '2026-12-01', 3, [31]),
      p(4, '2026-10-11', 4, [41, 42]),
      p(5, null, 5, [51]),
    ];
    const { comingUp, someday, done } = groupPlans(plans, new Set([11, 41, 42]));
    expect(comingUp.map((x) => x.id)).toEqual([3, 1]);
    expect(someday.map((x) => x.id)).toEqual([5, 2]);
    expect(done.map((x) => x.id)).toEqual([4]);
  });
});

describe('planKicker', () => {
  it('counts the drives, after the start date when there is one', () => {
    const drives = [{ stops: [] }, { stops: [] }];
    expect(planKicker({ startDate: null, drives })).toBe('2 DAYS');
    expect(planKicker({ startDate: null, drives: [{ stops: [] }] })).toBe('1 DAY');
    expect(planKicker({ startDate: '2027-05-14', drives })).toMatch(/2027 · 2 DAYS$/);
  });
});

describe('dateKey', () => {
  it('round-trips a start date', () => {
    expect(dateKey(dateOf('2027-05-04'))).toBe('2027-05-04');
  });
});

describe('planOutline', () => {
  it('joins each drive from its start through its stops, a road along its line', () => {
    const p = plan({ stops: [fortWilliam] }, { stops: [eileanDonan, road()] });
    const [one, two] = planOutline(p);
    expect(one.coordinates).toHaveLength(1);
    // Drive 2: Fort William (linked start), Eilean Donan, then every point of the road.
    expect(two.coordinates).toHaveLength(2 + bealach.line.length);
  });
});

describe('roadReversedFrom', () => {
  it('drives a road from whichever end is nearer', () => {
    const [startLat, startLng] = bealach.line[0];
    const [endLat, endLng] = bealach.line.at(-1);
    expect(roadReversedFrom(bealach, { latitude: startLat - 0.1, longitude: startLng })).toBe(false);
    expect(roadReversedFrom(bealach, { latitude: endLat, longitude: endLng - 0.05 })).toBe(true);
    expect(roadReversedFrom(bealach, null)).toBe(false);
  });
});

describe('roadsNear', () => {
  it('suggests Iconic Roads near the drive, nearest first', () => {
    const near = roadsNear(plan({ stops: [eileanDonan] }), 0);
    expect(near[0]).toMatchObject({ road: { id: 'bealach-na-ba' }, inPlan: false });
    expect(near.every((r, i) => i === 0 || r.metres >= near[i - 1].metres)).toBe(true);
    expect(near.every((r) => r.metres <= 80000)).toBe(true);
  });

  it('marks a road the plan already has', () => {
    const near = roadsNear(plan({ stops: [eileanDonan, road()] }, { stops: [] }), 1);
    expect(near.find((r) => r.road.id === 'bealach-na-ba')).toMatchObject({ inPlan: true });
  });

  it('suggests none for a drive with nowhere yet', () => {
    expect(roadsNear(plan({ stops: [] }), 0)).toEqual([]);
  });
});

describe('fromHere', () => {
  const here = { latitude: 53.48, longitude: -2.24 };

  it("starts Drive 1's line where the phone is", () => {
    const p = fromHere(plan({ stops: [fortAugustus] }), here);
    expect(planOutline(p)[0].coordinates[0]).toEqual(here);
    expect(driveStart(p, 0)).toMatchObject({ name: 'Your location', ...here });
  });

  it('keeps a start set by hand, and does nothing without a location', () => {
    const set = plan({ start: { name: 'Dover', latitude: 51.12, longitude: 1.31 }, stops: [] });
    expect(fromHere(set, here)).toBe(set);
    const p = plan({ stops: [] });
    expect(fromHere(p, null)).toBe(p);
  });
});

describe('driveRoute', () => {
  it('runs from the start through each place, a leg arriving at each', () => {
    const p = plan({ stops: [fortWilliam] }, { stops: [fortAugustus, eileanDonan] });
    const { points, legStops } = driveRoute(p, 1);
    expect(points.map((x) => x.via)).toEqual([false, false, false]);
    expect(points[0]).toMatchObject({ latitude: fortWilliam.latitude });
    expect(legStops).toEqual([0, 1]);
  });

  it('drives through an Iconic Road, ending at its far end when it is last', () => {
    const p = plan({ stops: [eileanDonan, road()] });
    const { points, legStops } = driveRoute(fromHere(p, { latitude: 57.0, longitude: -5.0 }), 0);
    expect(points.map((x) => x.via)).toEqual([false, false, true, true, false]);
    expect(points.at(-1)).toMatchObject({ latitude: bealach.line.at(-1)[0] });
    expect(legStops).toEqual([0, 1]);
  });

  it('drives a road in the middle through, the next place getting the leg', () => {
    const p = plan({ stops: [eileanDonan, road(), applecross] });
    const { points, legStops } = driveRoute(p, 0);
    // Drive 1 with no start begins at its first stop.
    expect(points[0]).toMatchObject({ latitude: eileanDonan.latitude, via: false });
    expect(points.filter((x) => x.via)).toHaveLength(3);
    expect(legStops).toEqual([2]);
  });

  it('has nothing to route with nowhere to go', () => {
    expect(driveRoute(plan({ stops: [fortAugustus] }), 0)).toBeNull();
    expect(driveRoute(plan({ stops: [] }), 0)).toBeNull();
  });
});

describe('planHandover', () => {
  const ullapool = { name: 'Ullapool', latitude: 57.9, longitude: -5.16 };
  const scotland = plan(
    { stops: [fortWilliam] },
    { stops: [fortAugustus, eileanDonan, road(), applecross] }
  );

  it("gives Google the whole drive and says what's in it", () => {
    const h = planHandover(scotland, 1, { here: fortWilliam, app: 'google' });
    expect(h.links).toHaveLength(1);
    expect(h.links[0]).toContain('destination=57.433500%2C-5.815000');
    expect(h.summary).toBe('2 stops and Bealach na Bà, to Applecross');
    expect(h.awayM).toBeNull();
    expect(h.appName).toBe('Google Maps');
  });

  it('goes to the start first when the phone is away from it', () => {
    const h = planHandover(scotland, 1, { here: ullapool, app: 'google' });
    expect(h.awayM).toBeGreaterThan(50000);
    expect(h.summary).toBe('Fort William, 2 stops and Bealach na Bà, to Applecross');
    expect(h.links[0]).toContain('waypoints=Fort%20William%7CFort%20Augustus');
  });

  it("goes to the start first when where the phone is isn't known, without saying how far", () => {
    const h = planHandover(scotland, 1, { here: null, app: 'google' });
    expect(h.awayM).toBeNull();
    expect(h.summary.startsWith('Fort William, ')).toBe(true);
  });

  it('starts Drive 1 with no start from wherever the phone is', () => {
    const h = planHandover(plan({ stops: [applecross] }), 0, { here: ullapool, app: 'google' });
    expect(h.start).toBeNull();
    expect(h.awayM).toBeNull();
    expect(h.summary).toBe('Straight to Applecross');
  });

  it('gives Waze one leg at a time, Bealach na Bà its own leg', () => {
    const h = planHandover(scotland, 1, { here: fortWilliam, app: 'waze' });
    expect(h.links).toHaveLength(4);
    expect(h.summary).toBe('One place at a time, starting with Fort Augustus');
  });

  it('gives Apple Maps the whole drive in one link', () => {
    expect(planHandover(scotland, 1, { here: fortWilliam, app: 'apple' }).links).toHaveLength(1);
  });

  it('ends on an Iconic Road that finishes the drive', () => {
    const h = planHandover(plan({ stops: [eileanDonan, road()] }), 0, { here: null, app: 'google' });
    expect(h.summary).toBe('1 stop, ending on Bealach na Bà');
    expect(planHandover(plan({ stops: [road()] }), 0, { here: null, app: 'google' }).summary).toBe('Along Bealach na Bà');
  });
});

describe('stopsPassed', () => {
  const drive = plan({ stops: [fortAugustus, eileanDonan, road(), applecross] });
  const near = (p) => ({ latitude: p.latitude + 0.002, longitude: p.longitude });

  it('counts none before the first stop', () => {
    expect(stopsPassed(drive, 0, [near(fortWilliam)])).toBe(0);
  });

  it('counts up to the furthest stop the route came near, skipped ones too', () => {
    expect(stopsPassed(drive, 0, [near(fortAugustus)])).toBe(1);
    expect(stopsPassed(drive, 0, [near(fortWilliam), near(eileanDonan)])).toBe(2);
  });

  it('counts an Iconic Road from its middle or far end, not its start', () => {
    const [startLat, startLon] = bealach.line[0];
    const [endLat, endLon] = bealach.line.at(-1);
    // Ending on the road: Bealach na Bà ends in Applecross, so that would count it too.
    const onRoad = plan({ stops: [fortAugustus, eileanDonan, road()] });
    expect(stopsPassed(onRoad, 0, [{ latitude: startLat, longitude: startLon }])).toBe(0);
    expect(stopsPassed(onRoad, 0, [{ latitude: endLat, longitude: endLon }])).toBe(3);
    const [middle] = roadGuidePoints(bealach, 1);
    expect(stopsPassed(onRoad, 0, [middle])).toBe(3);
  });
});

describe('planHandover underway', () => {
  const ullapool = { name: 'Ullapool', latitude: 57.9, longitude: -5.16 };
  const scotland = plan({ stops: [fortWilliam] }, { stops: [fortAugustus, eileanDonan, applecross] });

  it('never goes back to the start once underway', () => {
    const h = planHandover(scotland, 1, { here: ullapool, app: 'google', underway: true });
    expect(h.links[0]).not.toContain('Fort%20William');
  });

  it('leaves out the stops already passed', () => {
    const h = planHandover(scotland, 1, { here: null, app: 'google', underway: true, passed: 1 });
    expect(h.links[0]).not.toContain('Fort%20Augustus');
    expect(h.links[0]).toContain('Eilean%20Donan');
  });

  it('has no links once every stop is passed', () => {
    expect(planHandover(scotland, 1, { here: null, app: 'google', underway: true, passed: 3 }).links).toEqual([]);
  });
});

describe('planProgress', () => {
  const drive = plan({ stops: [fortAugustus, eileanDonan, road(), applecross] });
  const near = (p) => ({ latitude: p.latitude + 0.002, longitude: p.longitude });

  it('starts with the first stop next and the one after it', () => {
    const p = planProgress(drive, 0, [near(fortWilliam)]);
    expect(p).toMatchObject({ passed: 0, at: null, finished: false });
    expect(stopName(p.next)).toBe('Fort Augustus');
    expect(stopName(p.then)).toBe('Eilean Donan Castle');
  });

  it("says where you are while you're still there", () => {
    const p = planProgress(drive, 0, [near(fortWilliam), near(fortAugustus)]);
    expect(stopName(p.at)).toBe('Fort Augustus');
    expect(stopName(p.next)).toBe('Eilean Donan Castle');
  });

  it('moves on once you leave', () => {
    const p = planProgress(drive, 0, [near(fortAugustus), near(fortWilliam)]);
    expect(p.at).toBeNull();
    expect(p.passed).toBe(1);
  });

  it('names an Iconic Road by the road, and has nothing after the finish', () => {
    const p = planProgress(drive, 0, [near(eileanDonan)]);
    expect(stopName(p.next)).toBe('Bealach na Bà');
    const done = planProgress(drive, 0, [near(applecross)]);
    expect(done).toMatchObject({ finished: true, next: null, then: null });
    expect(stopName(done.at)).toBe('Applecross');
  });
});

describe('withWayBack', () => {
  const home = place('Home', 56.5, -4.0);
  const near = (p) => ({ latitude: p.latitude + 0.002, longitude: p.longitude });
  const loop = (...drives) => ({ ...plan(...drives), roundTrip: true });

  it('leaves a one way plan as it is', () => {
    const p = plan({ start: home, stops: [fortAugustus] });
    expect(withWayBack(p, fortWilliam)).toBe(p);
  });

  it("ends the last drive back at Drive 1's start", () => {
    const p = withWayBack(loop({ start: home, stops: [fortAugustus] }, { stops: [applecross] }), fortWilliam);
    expect(p.drives[0].stops).toHaveLength(1);
    expect(p.drives[1].stops.at(-1)).toMatchObject({ home: true, name: 'Home', latitude: 56.5, source: 'pin' });
  });

  it('goes back to where Drive 1 set off, else where the phone is', () => {
    const setOff = { latitude: 55.0, longitude: -3.0 };
    expect(withWayBack({ ...loop({ stops: [fortAugustus] }), setOff }, fortWilliam).drives[0].stops[1]).toMatchObject({
      name: 'Where you set off',
      latitude: 55.0,
    });
    expect(withWayBack(loop({ stops: [fortAugustus] }), fortWilliam).drives[0].stops[1].latitude).toBe(56.8198);
    expect(withWayBack(loop({ stops: [fortAugustus] }), null).drives[0].stops).toHaveLength(1);
  });

  it('needs a stop on a lone drive, but a later drive can just go home', () => {
    expect(withWayBack(loop({ stops: [] }), fortWilliam).drives[0].stops).toHaveLength(0);
    expect(withWayBack(loop({ stops: [fortAugustus] }, { stops: [] }), fortWilliam).drives[1].stops).toHaveLength(1);
  });

  it('routes and hands over the way back as the finish', () => {
    const p = withWayBack(loop({ start: home, stops: [fortAugustus, eileanDonan] }), null);
    const { points, legStops } = driveRoute(p, 0);
    expect(points.at(-1)).toMatchObject({ latitude: 56.5, longitude: -4.0 });
    expect(legStops).toEqual([0, 1, 2]);
    const h = planHandover(p, 0, { here: home, app: 'google' });
    expect(h.links[0]).toContain('destination=56.500000%2C-4.000000');
    expect(h.summary).toBe('2 stops, then back to the start');
  });

  it('draws one dot where a lone drive starts and ends', () => {
    const p = withWayBack(loop({ start: home, stops: [fortAugustus] }), null);
    expect(driveMarkers(p, 0).map((m) => m.kind)).toEqual(['stop', 'finish']);
  });

  it("isn't back until every stop is passed and you're there", () => {
    const p = withWayBack(loop({ start: home, stops: [fortAugustus, eileanDonan] }), null);
    expect(stopsPassed(p, 0, [near(home)])).toBe(0);
    expect(stopsPassed(p, 0, [near(home), near(fortAugustus), near(eileanDonan)])).toBe(2);
    expect(stopsPassed(p, 0, [near(home), near(fortAugustus), near(eileanDonan), near(home)])).toBe(3);
    expect(planProgress(p, 0, [near(home), near(fortAugustus), near(eileanDonan)]).next.home).toBe(true);
  });
});

describe('regroupDays', () => {
  const days = [['loch', 'fortWilliam'], ['augustus', 'applecross'], ['inverness']];

  it('keeps the days as they are when nothing crosses a stay', () => {
    const three = [['loch', 'glencoe', 'fortWilliam'], ['applecross'], ['inverness']];
    expect(regroupDays(three, ['glencoe', 'loch', 'fortWilliam', 'applecross', 'inverness'])).toEqual([
      ['glencoe', 'loch', 'fortWilliam'],
      ['applecross'],
      ['inverness'],
    ]);
  });

  it('moves the stay with its place: dragged earlier, the stops after it start the next day', () => {
    expect(regroupDays(days, ['fortWilliam', 'loch', 'augustus', 'applecross', 'inverness'])).toEqual([
      ['fortWilliam'],
      ['loch', 'augustus', 'applecross'],
      ['inverness'],
    ]);
  });

  it('moves a stop past a stay into the other day', () => {
    expect(regroupDays(days, ['loch', 'augustus', 'fortWilliam', 'applecross', 'inverness'])).toEqual([
      ['loch', 'augustus', 'fortWilliam'],
      ['applecross'],
      ['inverness'],
    ]);
  });

  it('keeps an empty last day, and a day with no stops after its stay', () => {
    expect(regroupDays([['a', 'b'], ['c'], []], ['b', 'a', 'c'])).toEqual([['b'], ['a', 'c'], []]);
    expect(regroupDays([['a'], [], ['b']], ['b', 'a'])).toEqual([['b', 'a'], [], []]);
    expect(regroupDays([[], ['a', 'b'], ['c']], ['a', 'c', 'b'])).toEqual([[], ['a', 'c', 'b'], []]);
  });
});

describe('stopCounts', () => {
  const trip = plan({ stops: [fortAugustus, eileanDonan] }, { stops: [road(), applecross, fortWilliam] });

  it("leaves out each day's finish", () => {
    expect(stopCounts(trip, 0)).toEqual({ stops: 1, roads: 0 });
    expect(stopCounts(trip, 1)).toEqual({ stops: 1, roads: 1 });
  });

  it("counts a trip's stays but not its end", () => {
    expect(stopCounts(trip)).toEqual({ stops: 3, roads: 1 });
  });

  it('counts the last place of a round trip, which ends back at the start', () => {
    const loop = { ...trip, roundTrip: true };
    expect(stopCounts(loop, 0).stops).toBe(1);
    expect(stopCounts(loop, 1).stops).toBe(2);
    expect(stopCounts(loop).stops).toBe(4);
  });

  it('counts a place before the Iconic Road a day ends on', () => {
    expect(stopCounts(plan({ stops: [fortAugustus, road()] }), 0)).toEqual({ stops: 1, roads: 1 });
    expect(stopCounts(plan({ stops: [] }))).toEqual({ stops: 0, roads: 0 });
  });
});

import { getRoad } from '../iconicRoads';
import {
  dateKey,
  dateOf,
  drivePoints,
  driveStart,
  groupPlans,
  planKicker,
  planOutline,
  roadReversedFrom,
  roadsNear,
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
    expect(planKicker({ startDate: null, drives })).toBe('2 DRIVES');
    expect(planKicker({ startDate: null, drives: [{ stops: [] }] })).toBe('1 DRIVE');
    expect(planKicker({ startDate: '2027-05-14', drives })).toMatch(/2027 · 2 DRIVES$/);
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

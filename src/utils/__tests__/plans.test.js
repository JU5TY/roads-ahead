import { getRoad } from '../iconicRoads';
import { drivePoints, driveStart } from '../plans';

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

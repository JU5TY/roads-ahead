import { decodePlan, encodePlan, planLink } from '../planLink';
import { getRoad } from '../iconicRoads';

// As planStorage returns a plan: ids and positions the link leaves behind.
const scotland = {
  id: 7,
  name: 'Scotland 2027 · Côte',
  startDate: '2027-05-14',
  routeId: null,
  roundTrip: false,
  drives: [
    {
      id: 1,
      position: 0,
      start: null,
      stops: [
        { id: 1, position: 0, name: 'Kendal', latitude: 54.3280812, longitude: -2.7462864, source: 'search', roadId: null, reversed: false },
      ],
    },
    {
      id: 2,
      position: 1,
      start: { name: 'Tebay services', latitude: 54.4401, longitude: -2.5898 },
      stops: [
        { id: 2, position: 0, name: 'Glen Coe', latitude: 0, longitude: 0, source: 'pin', roadId: 'glen-coe', reversed: true },
        { id: 3, position: 1, name: null, latitude: 56.8198, longitude: -5.1052, source: 'pin', roadId: null, reversed: false },
      ],
    },
  ],
};

describe('plan links', () => {
  it('brings a plan back as it was shared, date and all', () => {
    const back = decodePlan(encodePlan(scotland));
    const glenCoe = getRoad('glen-coe');
    expect(back).toEqual({
      name: 'Scotland 2027 · Côte',
      startDate: '2027-05-14',
      roundTrip: false,
      routeId: null,
      drives: [
        {
          start: null,
          stops: [{ name: 'Kendal', latitude: 54.32808, longitude: -2.74629, source: 'search', roadId: null, reversed: false }],
        },
        {
          start: { name: 'Tebay services', latitude: 54.4401, longitude: -2.5898 },
          stops: [
            {
              name: glenCoe.name,
              latitude: glenCoe.line[0][0],
              longitude: glenCoe.line[0][1],
              source: 'pin',
              roadId: 'glen-coe',
              reversed: true,
            },
            { name: null, latitude: 56.8198, longitude: -5.1052, source: 'pin', roadId: null, reversed: false },
          ],
        },
      ],
    });
  });

  it('sends a copied Iconic Trip as just its id', () => {
    const copy = { ...scotland, name: 'North Coast 500', routeId: 'nc500', roundTrip: false, startDate: null };
    const text = encodePlan(copy);
    expect(text.length).toBeLessThan(60);
    const back = decodePlan(text);
    expect(back.routeId).toBe('nc500');
    expect(back.drives).toHaveLength(5);
  });

  it('keeps a round trip', () => {
    expect(decodePlan(encodePlan({ ...scotland, roundTrip: true })).roundTrip).toBe(true);
  });

  it('makes a link safe to paste anywhere', () => {
    expect(planLink(scotland)).toMatch(/^roadtrip:\/\/shared\?p=[A-Za-z0-9_-]+$/);
  });

  it('turns down anything it can’t read', () => {
    expect(decodePlan('not a plan!')).toBeNull();
    expect(decodePlan(encodePlan({ ...scotland, drives: [] }))).toBeNull();
    const unknownRoad = { ...scotland, drives: [{ start: null, stops: [{ roadId: 'no-such-road' }] }] };
    expect(decodePlan(encodePlan(unknownRoad))).toBeNull();
  });
});

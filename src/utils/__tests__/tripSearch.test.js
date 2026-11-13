import { planSearchText, searchMatches, tripSearchText } from '../tripSearch';

const trip = {
  name: 'Lake District weekend',
  notes: 'Hardknott in the rain',
  drives: [
    {
      startedAt: new Date(2026, 9, 11, 9).getTime(),
      places: { start: 'Manchester', end: 'Ambleside', stops: ['Kendal'] },
      countries: [{ code: 'GB-ENG' }],
      vehicleId: 1,
    },
  ],
};
const vehicles = new Map([[1, { make: 'BMW', model: '1M' }]]);
const text = tripSearchText(trip, { roadIds: ['bealach-na-ba'], vehicles });

describe('Trips search', () => {
  it('finds a trip by its name, places, notes, month, year and vehicle', () => {
    for (const query of ['lake', 'Kendal', 'ambleside', 'rain', 'October', 'oct 2026', 'bmw 1m']) {
      expect(searchMatches(text, query)).toBe(true);
    }
  });

  it('finds a trip by an Iconic Road, accents or not, and its country', () => {
    expect(searchMatches(text, 'Bealach na Bà')).toBe(true);
    expect(searchMatches(text, 'bealach na ba')).toBe(true);
    expect(searchMatches(text, 'england')).toBe(true);
  });

  it('needs every word to match', () => {
    expect(searchMatches(text, 'lake skye')).toBe(false);
    expect(searchMatches(text, 'skye')).toBe(false);
  });

  it('matches everything while nothing is typed', () => {
    expect(searchMatches(text, '  ')).toBe(true);
  });

  it('finds a plan by its name, stops and Iconic Roads', () => {
    const plan = {
      name: 'Scotland 2027',
      drives: [
        { start: { name: 'Inverness' }, stops: [{ name: 'Applecross' }, { roadId: 'bealach-na-ba' }] },
      ],
    };
    const planText = planSearchText(plan);
    expect(searchMatches(planText, 'applecross')).toBe(true);
    expect(searchMatches(planText, 'inverness')).toBe(true);
    expect(searchMatches(planText, 'bealach')).toBe(true);
    expect(searchMatches(planText, 'wales')).toBe(false);
  });
});

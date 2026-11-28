import { detectCountries, lineCountryRows, summarizeCountries } from '../countries';
import { exampleDrives } from '../exampleTrip';

// A straight line between two points, a point every ~1 km or so.
const line = (from, to, steps = 200) =>
  Array.from({ length: steps + 1 }, (_, i) => ({
    latitude: from[0] + ((to[0] - from[0]) * i) / steps,
    longitude: from[1] + ((to[1] - from[1]) * i) / steps,
  }));

const carlisle = [54.89, -2.93];
const lockerbie = [55.12, -3.36];
const moffat = [55.33, -3.44];

describe('lineCountryRows', () => {
  it('splits a planned line by country, with the days each is on', () => {
    const rows = lineCountryRows([line(carlisle, lockerbie), line(lockerbie, moffat)], [1, 2]);
    expect(rows.map((r) => r.name)).toEqual(['England', 'Scotland']);
    expect(rows[0].subtitle).toBe('Day 1');
    expect(rows[1].subtitle).toBe('Days 1–2');
  });

  it('scales the distances to the Distance shown, and can leave the days out', () => {
    const rows = lineCountryRows([line(carlisle, moffat)], [1], { scaleToM: 1000, withDays: false });
    expect(rows.reduce((sum, r) => sum + r.distanceM, 0)).toBeCloseTo(1000);
    expect(rows.every((r) => r.subtitle === null)).toBe(true);
  });
});

describe('the example trip', () => {
  it('drives through England and Scotland, so a first Home shows both', () => {
    const visits = exampleDrives().flatMap((d) =>
      detectCountries(d.fixes).map((v) => ({ ...v, startedAt: d.startedAt }))
    );
    expect(summarizeCountries(visits).map((c) => c.name)).toEqual(['England', 'Scotland']);
  });
});

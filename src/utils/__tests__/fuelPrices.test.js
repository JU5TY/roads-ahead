import { mergeWeeks, parseWeeklyPrices, ukPriceAt } from '../fuelPrices';

// The head of GOV.UK's "Weekly road fuel prices (CSV) 2018 to 2026", as served (with its BOM).
const CSV = [
  '﻿Date,ULSP (Ultra low sulphur unleaded petrol) Pump price in pence/litre,ULSD (Ultra low sulphur diesel) Pump price in pence/litre,ULSP (Ultra low sulphur unleaded petrol) Duty rate in pence/litre,ULSD (Ultra low sulphur diesel) Duty rate in pence/litre,ULSP (Ultra low sulphur unleaded petrol) VAT percentage rate,ULSD (Ultra low sulphur diesel) VAT percentage rate',
  '16/11/2026,167.07,196.77,52.95,52.95,20,20',
  '09/11/2026,170.71,198.19,52.95,52.95,20,20',
  '23/11/2026,161.96,193.29,52.95,52.95,20,20',
  '',
].join('\r\n');

const at = (iso) => Date.parse(`${iso}T12:00:00Z`);

describe('parseWeeklyPrices', () => {
  it('reads each week as its Monday and pence a litre, oldest first', () => {
    expect(parseWeeklyPrices(CSV)).toEqual([
      ['2026-11-09', 170.71, 198.19],
      ['2026-11-16', 167.07, 196.77],
      ['2026-11-23', 161.96, 193.29],
    ]);
  });

  it('skips rows missing a price, and a file without the columns', () => {
    expect(parseWeeklyPrices(`${CSV}30/11/2026,,\n`)).toHaveLength(3);
    expect(parseWeeklyPrices('Date,Something else\n01/01/2026,1')).toEqual([]);
  });
});

describe('mergeWeeks', () => {
  it('joins files into one table, keeping a shared week once', () => {
    const weeks = mergeWeeks([
      [['2026-11-16', 167.07, 196.77]],
      [['2003-06-09', 74.59, 76.77], ['2026-11-16', 167.07, 196.77]],
    ]);
    expect(weeks.map((w) => w[0])).toEqual(['2003-06-09', '2026-11-16']);
  });
});

describe('ukPriceAt', () => {
  const weeks = parseWeeklyPrices(CSV);

  it('gives the week a drive fell in, in pounds', () => {
    expect(ukPriceAt(weeks, at('2026-11-18'))).toBe(1.6707);
    expect(ukPriceAt(weeks, at('2026-11-16'), true)).toBe(1.9677);
  });

  it('gives the latest week for a drive after the figures end', () => {
    expect(ukPriceAt(weeks, at('2027-02-01'))).toBe(1.6196);
  });

  it('gives null before the figures start, or with none', () => {
    expect(ukPriceAt(weeks, at('2026-11-01'))).toBeNull();
    expect(ukPriceAt([], at('2026-11-18'))).toBeNull();
    expect(ukPriceAt(null, at('2026-11-18'))).toBeNull();
  });

  it('gives null across a long gap in the figures', () => {
    const gappy = [['2026-01-05', 140, 150], ['2026-06-01', 145, 155]];
    expect(ukPriceAt(gappy, at('2026-01-07'))).toBe(1.4);
    expect(ukPriceAt(gappy, at('2026-04-01'))).toBeNull();
  });
});

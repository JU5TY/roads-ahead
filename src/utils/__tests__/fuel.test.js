import {
  currencySymbol,
  driveCost,
  formatChargePrice,
  formatDriveCost,
  formatEfficiency,
  formatFuelPrice,
  formatMpg,
  formatCost,
  parseChargePrice,
  parseFuelPrice,
  parseMilesPerKwh,
  parseMpg,
  pricesForDrive,
  pricesForPlan,
  ukFuelAverages,
} from '../fuel';

const MILE = 1609.344;
const petrol = (mpg) => ({ electric: false, mpg, milesPerKwh: null });
const electric = (milesPerKwh) => ({ electric: true, mpg: null, milesPerKwh });

describe('parseMpg', () => {
  it('reads whole and decimal mpg, with a comma too', () => {
    expect(parseMpg('40')).toEqual({ mpg: 40 });
    expect(parseMpg(' 38.5 ')).toEqual({ mpg: 38.5 });
    expect(parseMpg('38,5')).toEqual({ mpg: 38.5 });
  });

  it('leaves an empty field unset', () => {
    expect(parseMpg('')).toEqual({ mpg: null });
    expect(parseMpg('  ')).toEqual({ mpg: null });
  });

  it("says what's wrong with a figure that can't be an average mpg", () => {
    expect(parseMpg('abc').error).toBeTruthy();
    expect(parseMpg('2').error).toBeTruthy();
    expect(parseMpg('400').error).toBeTruthy();
  });
});

describe('parseMilesPerKwh', () => {
  it('reads miles per kWh, and leaves an empty field unset', () => {
    expect(parseMilesPerKwh('3.5')).toEqual({ milesPerKwh: 3.5 });
    expect(parseMilesPerKwh('4,1')).toEqual({ milesPerKwh: 4.1 });
    expect(parseMilesPerKwh('')).toEqual({ milesPerKwh: null });
  });

  it('turns down an mpg typed in the wrong field', () => {
    expect(parseMilesPerKwh('40').error).toBeTruthy();
    expect(parseMilesPerKwh('0.5').error).toBeTruthy();
  });
});

describe('parseFuelPrice', () => {
  it('reads pounds a litre', () => {
    expect(parseFuelPrice('1.46')).toEqual({ price: 1.46 });
    expect(parseFuelPrice('£1,46')).toEqual({ price: 1.46 });
  });

  it("reads a pump's pence as pence", () => {
    expect(parseFuelPrice('146.9')).toEqual({ price: 1.469 });
    expect(parseFuelPrice('146.9p')).toEqual({ price: 1.469 });
  });

  it('turns down an empty or unlikely price', () => {
    expect(parseFuelPrice('').error).toBeTruthy();
    expect(parseFuelPrice('0.1').error).toBeTruthy();
    expect(parseFuelPrice('7').error).toBeTruthy();
  });
});

describe('parseChargePrice', () => {
  it('reads a tariff in pence, home or rapid', () => {
    expect(parseChargePrice('7.5')).toEqual({ price: 0.075 });
    expect(parseChargePrice('24.5p')).toEqual({ price: 0.245 });
    expect(parseChargePrice('79')).toEqual({ price: 0.79 });
  });

  it('reads pounds too', () => {
    expect(parseChargePrice('£0.79')).toEqual({ price: 0.79 });
  });

  it('turns down an empty or unlikely price', () => {
    expect(parseChargePrice('').error).toBeTruthy();
    expect(parseChargePrice('500').error).toBeTruthy();
  });
});

describe('drive cost', () => {
  it('matches the mockup: 112 mi at 40 mpg and £1.46 a litre is £19 fuel', () => {
    const cost = driveCost(112 * MILE, petrol(40), { fuel: 1.46, charge: null });
    expect(cost).toBeCloseTo(18.58, 1);
    expect(formatDriveCost(cost, false)).toBe('~£19 fuel');
  });

  it('costs an electric car by the kWh: 112 mi at 3.5 mi/kWh and 25p is £8 charging', () => {
    const cost = driveCost(112 * MILE, electric(3.5), { fuel: 1.46, charge: 0.25 });
    expect(cost).toBeCloseTo(8, 5);
    expect(formatDriveCost(cost, true)).toBe('~£8 charging');
  });

  it("is null until the car's figure and its own price are both set", () => {
    expect(driveCost(MILE, petrol(null), { fuel: 1.46, charge: 0.25 })).toBeNull();
    expect(driveCost(MILE, petrol(40), { fuel: null, charge: 0.25 })).toBeNull();
    expect(driveCost(MILE, electric(3.5), { fuel: 1.46, charge: null })).toBeNull();
    expect(driveCost(MILE, electric(null), { fuel: 1.46, charge: 0.25 })).toBeNull();
  });

  it('never shows £0', () => {
    expect(formatDriveCost(0.2, false)).toBe('~£1 fuel');
  });

  it('shows just the pounds for a Details row', () => {
    expect(formatCost(131.6)).toBe('~£132');
    expect(formatCost(0.2)).toBe('~£1');
  });
});

describe('formatting', () => {
  it('shows mpg without a trailing .0', () => {
    expect(formatMpg(40)).toBe('40 mpg');
    expect(formatMpg(38.5)).toBe('38.5 mpg');
  });

  it("shows the car's own figure, by its fuel", () => {
    expect(formatEfficiency(petrol(40))).toBe('40 mpg');
    expect(formatEfficiency(electric(3.5))).toBe('3.5 mi/kWh');
    expect(formatEfficiency(electric(null))).toBeNull();
  });

  it('shows a kWh price in pence', () => {
    expect(formatChargePrice(0.245)).toBe('24.5p');
    expect(formatChargePrice(0.79)).toBe('79p');
  });
});

describe('pricesForDrive and pricesForPlan', () => {
  const weeks = [
    ['2026-11-16', 167.07, 196.77],
    ['2026-11-23', 161.96, 193.29],
  ];
  const typed = { fuel: { price: 1.5 }, charge: { price: 0.25 } };
  const none = { fuel: null, charge: null };
  const nov18 = Date.parse('2026-11-18T12:00:00Z');

  it("costs a drive at the UK's price for its week, whatever was typed on You", () => {
    expect(pricesForDrive(typed, weeks, nov18, {})).toEqual({ fuel: 1.6707, charge: 0.25 });
    expect(pricesForDrive(none, weeks, nov18, { fuel: 'diesel' }).fuel).toBe(1.9677);
  });

  it('falls back to the typed price with no UK figures, or before them', () => {
    expect(pricesForDrive(typed, null, nov18, {}).fuel).toBe(1.5);
    expect(pricesForDrive(typed, weeks, Date.parse('2020-01-01'), {}).fuel).toBe(1.5);
    expect(pricesForDrive(none, null, nov18, {})).toEqual({ fuel: null, charge: null });
  });

  it("costs a drive from before the UK figures at the latest, when nothing's typed", () => {
    const y2000 = new Date(2000, 0, 1, 9).getTime(); // the example trip
    expect(pricesForDrive(none, weeks, y2000, {}).fuel).toBe(1.6196);
    expect(pricesForDrive(none, weeks, y2000, { fuel: 'diesel' }).fuel).toBe(1.9329);
    expect(pricesForDrive(typed, weeks, y2000, {}).fuel).toBe(1.5);
  });

  it("costs a plan at the typed price, else the UK's latest", () => {
    expect(pricesForPlan(typed, weeks, {}).fuel).toBe(1.5);
    expect(pricesForPlan(none, weeks, {}).fuel).toBe(1.6196);
    expect(pricesForPlan(none, weeks, { fuel: 'diesel' }).fuel).toBe(1.9329);
    expect(pricesForPlan(none, null, {})).toEqual({ fuel: null, charge: null });
  });
});

describe('in km, L/100 km and euros', () => {
  it('reads L/100 km and kWh/100 km, kept as mpg and mi/kWh', () => {
    expect(parseMpg('5.9', 'metric').mpg).toBeCloseTo(47.88, 2);
    expect(parseMilesPerKwh('16.5', 'metric').milesPerKwh).toBeCloseTo(3.77, 2);
    expect(parseMpg('', 'metric')).toEqual({ mpg: null });
  });

  it('turns down an mpg typed as L/100 km', () => {
    expect(parseMpg('400', 'metric').error).toMatch('L/100 km');
    expect(parseMilesPerKwh('0.2', 'metric').error).toMatch('kWh/100 km');
  });

  it('shows the same car either way', () => {
    expect(formatMpg(40, 'metric')).toBe('7.1 L/100 km');
    expect(formatEfficiency(petrol(parseMpg('5.9', 'metric').mpg), 'metric')).toBe('5.9 L/100 km');
    expect(formatEfficiency(electric(3.5), 'metric')).toBe('17.8 kWh/100 km');
  });

  it('reads and shows prices in euros, as the pump does', () => {
    expect(parseFuelPrice('€1,79', 'metric')).toEqual({ price: 1.79 });
    expect(parseChargePrice('0.35', 'metric')).toEqual({ price: 0.35 });
    expect(formatFuelPrice(1.79, 'metric')).toBe('€1.79');
    expect(formatChargePrice(0.35, 'metric')).toBe('€0.35');
    expect(currencySymbol('metric')).toBe('€');
  });

  it('costs the drive in euros', () => {
    // 200 km at 5.9 L/100 km and €1.79 a litre: 11.8 L, €21.12.
    const cost = driveCost(200000, petrol(parseMpg('5.9', 'metric').mpg), { fuel: 1.79, charge: null });
    expect(cost).toBeCloseTo(21.12, 1);
    expect(formatDriveCost(cost, false, 'metric')).toBe('~€21 fuel');
    expect(formatCost(0.2, 'metric')).toBe('~€1');
  });
});

describe('ukFuelAverages', () => {
  const weeks = [
    ['2026-11-16', 167.07, 196.77],
    ['2026-11-23', 161.96, 193.29],
  ];
  const now = Date.parse('2026-11-28T12:00:00Z');
  const petrolCar = { electric: false, fuel: 'petrol' };
  const dieselCar = { electric: false, fuel: 'diesel' };
  const ev = { electric: true, fuel: 'electricity' };

  it("gives this week's average for each fuel the garage uses", () => {
    expect(ukFuelAverages(weeks, [petrolCar], now)).toEqual({ petrol: 1.6196 });
    expect(ukFuelAverages(weeks, [dieselCar, ev], now)).toEqual({ diesel: 1.9329 });
    expect(ukFuelAverages(weeks, [dieselCar, petrolCar], now)).toEqual({ petrol: 1.6196, diesel: 1.9329 });
  });

  it('is petrol with no cars yet, and null without the figures', () => {
    expect(ukFuelAverages(weeks, [], now)).toEqual({ petrol: 1.6196 });
    expect(ukFuelAverages(null, [petrolCar], now)).toBeNull();
  });
});

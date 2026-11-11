import {
  driveCost,
  formatChargePrice,
  formatDriveCost,
  formatEfficiency,
  formatMpg,
  parseChargePrice,
  parseFuelPrice,
  parseMilesPerKwh,
  parseMpg,
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
    expect(formatDriveCost(cost, false)).toBe('£19 fuel');
  });

  it('costs an electric car by the kWh: 112 mi at 3.5 mi/kWh and 25p is £8 charging', () => {
    const cost = driveCost(112 * MILE, electric(3.5), { fuel: 1.46, charge: 0.25 });
    expect(cost).toBeCloseTo(8, 5);
    expect(formatDriveCost(cost, true)).toBe('£8 charging');
  });

  it("is null until the car's figure and its own price are both set", () => {
    expect(driveCost(MILE, petrol(null), { fuel: 1.46, charge: 0.25 })).toBeNull();
    expect(driveCost(MILE, petrol(40), { fuel: null, charge: 0.25 })).toBeNull();
    expect(driveCost(MILE, electric(3.5), { fuel: 1.46, charge: null })).toBeNull();
    expect(driveCost(MILE, electric(null), { fuel: 1.46, charge: 0.25 })).toBeNull();
  });

  it('never shows £0', () => {
    expect(formatDriveCost(0.2, false)).toBe('£1 fuel');
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

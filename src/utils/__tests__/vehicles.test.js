import { detailsFor, formFromLookup, lookupDetails, paintColour, vehicleSubtitle } from '../vehicles';

// What the server's lookup hands back (utils/vehicleLookup.js mergeVehicle).
const FOUND = {
  registration: 'AB11CDE',
  make: 'BMW',
  model: '1M',
  year: 2011,
  engineCc: 2979,
  fuel: 'petrol',
  electric: false,
  colour: 'Orange',
  co2: 224,
  mpg: 29,
  taxDueDate: '2026-12-01',
  motDueDate: '2027-03-14',
  lastMotMileage: { value: 46980, unit: 'mi', date: '2026-03-10' },
};

describe('lookupDetails', () => {
  it('keeps what only a lookup fills, with its registration and when', () => {
    expect(lookupDetails(FOUND, 1000)).toEqual({
      registration: 'AB11CDE',
      fuel: 'petrol',
      year: 2011,
      engineCc: 2979,
      colour: 'Orange',
      co2: 224,
      taxDueDate: '2026-12-01',
      motDueDate: '2027-03-14',
      lastMotMileage: { value: 46980, unit: 'mi', date: '2026-03-10' },
      lookedUpAt: 1000,
    });
  });
});

describe('detailsFor', () => {
  const details = lookupDetails(FOUND);

  it('keeps details for the same registration, however it is spaced', () => {
    expect(detailsFor(details, 'ab11 cde')).toBe(details);
  });

  it('drops them once the registration changes or goes', () => {
    expect(detailsFor(details, 'XY99 ZZZ')).toBeNull();
    expect(detailsFor(details, '')).toBeNull();
    expect(detailsFor(null, 'AB11 CDE')).toBeNull();
  });
});

describe('formFromLookup', () => {
  it('gives the form its make, model, fuel and mpg', () => {
    expect(formFromLookup(FOUND)).toEqual({ make: 'BMW', model: '1M', electric: false, mpg: 29 });
    expect(formFromLookup({ ...FOUND, model: null }).model).toBe('');
  });
});

describe('vehicleSubtitle', () => {
  it('reads year, engine and fuel', () => {
    expect(vehicleSubtitle({ details: lookupDetails(FOUND) })).toBe('2011 · 3.0 litre petrol');
    expect(vehicleSubtitle({ details: { year: 2022, engineCc: 1968, fuel: 'diesel' } })).toBe('2022 · 2.0 litre diesel');
  });

  it('leaves out the engine for an electric vehicle', () => {
    expect(vehicleSubtitle({ electric: true, details: { year: 2023, engineCc: null, fuel: 'electric' } })).toBe(
      '2023 · electric'
    );
  });

  it('gives what it has, or null for a vehicle entered by hand', () => {
    expect(vehicleSubtitle({ details: { year: 2011 } })).toBe('2011');
    expect(vehicleSubtitle({ details: null })).toBeNull();
    expect(vehicleSubtitle({})).toBeNull();
  });
});

describe('paintColour', () => {
  it("gives DVLA's colours a paint, and nothing for the rest", () => {
    expect(paintColour('Orange')).toBe('#E0661A');
    expect(paintColour('SILVER')).toBe('#C0C4C8');
    expect(paintColour('Multi-colour')).toBeNull();
    expect(paintColour(null)).toBeNull();
  });
});

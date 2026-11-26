import { fuelOf, lookupRegistration, mergeVehicle, mpgFromCo2, tidyName } from '../vehicleLookup';

// DVLA's example response (Vehicle Enquiry Service API guide), cut to what's read.
const DVLA = {
  registrationNumber: 'WN67DSO',
  co2Emissions: 135,
  engineCapacity: 1598,
  markedForExport: false,
  fuelType: 'PETROL',
  motStatus: 'Valid',
  colour: 'Blue',
  make: 'ROVER',
  yearOfManufacture: 2004,
  taxDueDate: '2027-12-25',
  taxStatus: 'Taxed',
  motExpiry: '2027-03-01',
};

// The shape of DVSA's MOT history answer for a vehicle with tests (its API specification).
const DVSA = {
  registration: 'WN67DSO',
  make: 'ROVER',
  model: '75 CONNOISSEUR SE',
  firstUsedDate: '2004-06-01',
  fuelType: 'Petrol',
  primaryColour: 'Blue',
  manufactureDate: '2004-05-20',
  engineSize: '1598',
  hasOutstandingRecall: 'No',
  motTests: [
    { completedDate: '2025-02-20T10:00:00.000Z', testResult: 'PASSED', expiryDate: '2026-03-01', odometerValue: '98000', odometerUnit: 'MI', odometerResultType: 'READ', dataSource: 'DVSA' },
    { completedDate: '2026-02-17T09:17:46.000Z', testResult: 'PASSED', expiryDate: '2027-03-01', odometerValue: '104210', odometerUnit: 'MI', odometerResultType: 'READ', dataSource: 'DVSA' },
    { completedDate: '2026-02-10T09:00:00.000Z', testResult: 'FAILED', odometerValue: null, odometerUnit: null, odometerResultType: 'UNREADABLE', dataSource: 'DVSA' },
  ],
};

describe('lookupRegistration', () => {
  it('drops spaces and punctuation and capitalises', () => {
    expect(lookupRegistration(' ab12 cde ')).toBe('AB12CDE');
    expect(lookupRegistration('ab-12-cde')).toBe('AB12CDE');
  });

  it('turns away what cannot be a registration', () => {
    expect(lookupRegistration('')).toBeNull();
    expect(lookupRegistration('A')).toBeNull();
    expect(lookupRegistration('ABCDEFGHIJ')).toBeNull();
  });
});

describe('tidyName', () => {
  it('title-cases names, keeping codes and known capitals', () => {
    expect(tidyName('MERCEDES-BENZ')).toBe('Mercedes-Benz');
    expect(tidyName('BMW')).toBe('BMW');
    expect(tidyName('1 SERIES M')).toBe('1 Series M');
    expect(tidyName('MX-5')).toBe('MX-5');
    expect(tidyName('LAND  ROVER')).toBe('Land Rover');
    expect(tidyName('KA')).toBe('Ka');
    expect(tidyName('GOLF GTI')).toBe('Golf GTI');
    expect(tidyName(null)).toBeNull();
  });
});

describe('fuelOf', () => {
  it('reads both agencies’ wording', () => {
    expect(fuelOf('PETROL')).toBe('petrol');
    expect(fuelOf('Diesel')).toBe('diesel');
    expect(fuelOf('ELECTRICITY')).toBe('electric');
    expect(fuelOf('Electric')).toBe('electric');
  });

  it('costs a hybrid on the fuel it burns', () => {
    expect(fuelOf('HYBRID ELECTRIC')).toBe('petrol');
    expect(fuelOf('ELECTRIC DIESEL')).toBe('diesel');
  });

  it('gives null for what it cannot cost', () => {
    expect(fuelOf('STEAM')).toBeNull();
    expect(fuelOf(null)).toBeNull();
  });
});

describe('mpgFromCo2', () => {
  it('works out the official mpg', () => {
    expect(mpgFromCo2(224, 'petrol')).toBe(29);
    expect(mpgFromCo2(120, 'diesel')).toBe(62);
  });

  it('gives null with no CO₂, or for an electric vehicle', () => {
    expect(mpgFromCo2(0, 'petrol')).toBeNull();
    expect(mpgFromCo2(null, 'petrol')).toBeNull();
    expect(mpgFromCo2(0, 'electric')).toBeNull();
  });
});

describe('mergeVehicle', () => {
  it('joins both answers, DVLA first', () => {
    expect(mergeVehicle('WN67DSO', DVLA, DVSA)).toEqual({
      registration: 'WN67DSO',
      make: 'Rover',
      model: '75 Connoisseur SE',
      year: 2004,
      engineCc: 1598,
      fuel: 'petrol',
      electric: false,
      colour: 'Blue',
      co2: 135,
      mpg: 48,
      taxDueDate: '2027-12-25',
      motDueDate: '2027-03-01',
      lastMotMileage: { value: 104210, unit: 'mi', date: '2026-02-17' },
    });
  });

  it('fills what it can from DVLA alone', () => {
    const v = mergeVehicle('WN67DSO', DVLA, null);
    expect(v.make).toBe('Rover');
    expect(v.model).toBeNull();
    expect(v.lastMotMileage).toBeNull();
    expect(v.motDueDate).toBe('2027-03-01');
  });

  it('fills what it can from DVSA alone', () => {
    const v = mergeVehicle('WN67DSO', null, DVSA);
    expect(v).toMatchObject({ make: 'Rover', year: 2004, engineCc: 1598, fuel: 'petrol', co2: null, mpg: null });
    expect(v.taxDueDate).toBeNull();
    expect(v.motDueDate).toBe('2027-03-01');
  });

  it('marks an electric vehicle, with no mpg', () => {
    const v = mergeVehicle('EV70ABC', { ...DVLA, fuelType: 'ELECTRICITY', co2Emissions: 0, engineCapacity: 0 }, null);
    expect(v).toMatchObject({ fuel: 'electric', electric: true, co2: null, mpg: null, engineCc: null });
  });

  it("takes a new vehicle's first MOT date from DVSA", () => {
    const v = mergeVehicle('NEW25AB', null, { make: 'KIA', model: 'EV3', fuelType: 'Electric', manufactureYear: 2025, motTestDueDate: '2028-04-30' });
    expect(v).toMatchObject({ make: 'Kia', model: 'EV3', year: 2025, electric: true, motDueDate: '2028-04-30' });
  });
});

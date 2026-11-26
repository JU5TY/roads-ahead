// A registration lookup's answer as one vehicle: DVLA's Vehicle Enquiry Service
// (make, colour, fuel, engine, year, CO₂, tax and MOT dates) and DVSA's MOT
// history (model, mileage at each MOT). Either can be missing (not found, down,
// or not set up), and the other still fills what it has. Shared by the app's
// server (server/app/src/vehicle.js), which asks them, and the app.

const LITRES_PER_100KM_TO_MPG = 282.481; // UK gallons
// Grams of CO₂ from burning a litre, divided by 100 km: CO₂ g/km ÷ this = litres per 100 km.
const CO2_PER_LITRE = { petrol: 23.1, diesel: 26.4 };

// Words kept in capitals when the rest is title-cased: two letters (SE, GT,
// MG, DS) but for real names (Ka, Up), and these longer ones.
const CAPITALS = new Set(['AMG', 'BMW', 'BYD', 'DAF', 'GMC', 'GTI', 'KTM', 'LDV', 'TDI', 'TSI', 'TVR']);
const NAMES = new Set(['KA', 'UP']);

/** "ab12 cde" -> "AB12CDE", as both APIs want it; null when it can't be a UK registration. */
export function lookupRegistration(text) {
  const reg = String(text ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  return /^[A-Z0-9]{2,8}$/.test(reg) ? reg : null;
}

/** "MERCEDES-BENZ" -> "Mercedes-Benz", "1 SERIES M" -> "1 Series M"; "BMW" and "MX-5" stay. */
export function tidyName(text) {
  if (!text) return null;
  return String(text)
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) =>
      // Codes with a digit (X5, 1M, MX-5) stay in capitals.
      /\d/.test(word)
        ? word.toUpperCase()
        : word
            .split('-')
            .map((part) => {
              const upper = part.toUpperCase();
              if (CAPITALS.has(upper) || (upper.length <= 2 && !NAMES.has(upper))) return upper;
              return upper[0] + upper.slice(1).toLowerCase();
            })
            .join('-')
    )
    .join(' ');
}

/**
 * DVLA's or DVSA's fuel ("PETROL", "Diesel", "ELECTRICITY", "HYBRID ELECTRIC")
 * as 'petrol' | 'diesel' | 'electric', or null for one we can't cost. A hybrid
 * is costed on the fuel it burns.
 */
export function fuelOf(text) {
  const fuel = String(text ?? '').toLowerCase();
  if (!fuel) return null;
  if (fuel.includes('diesel')) return 'diesel';
  if (/^electric(ity)?$/.test(fuel.trim())) return 'electric';
  if (/petrol|hybrid|gas|lpg/.test(fuel)) return 'petrol';
  return null;
}

/**
 * The official mpg from CO₂ g/km: litres per 100 km is CO₂ ÷ 23.1 for petrol
 * (÷ 26.4 diesel), and mpg is 282.5 ÷ that. Whole mpg, or null (no CO₂, or
 * electric). A plug-in hybrid's comes out high: its official CO₂ assumes a
 * charged battery.
 */
export function mpgFromCo2(co2, fuel) {
  const perLitre = CO2_PER_LITRE[fuel];
  if (!perLitre || !(co2 > 0)) return null;
  return Math.round(LITRES_PER_100KM_TO_MPG / (co2 / perLitre));
}

const yearOf = (date) => (date ? Number(String(date).slice(0, 4)) || null : null);

/** The odometer at the latest MOT that read it: { value, unit: 'mi' | 'km', date }, or null. */
function lastMotMileage(tests) {
  const read = (tests ?? [])
    .filter((t) => t.odometerResultType === 'READ' && Number(t.odometerValue) > 0 && t.completedDate)
    .sort((a, b) => (a.completedDate < b.completedDate ? 1 : -1));
  const t = read[0];
  if (!t) return null;
  return {
    value: Number(t.odometerValue),
    unit: t.odometerUnit === 'KM' ? 'km' : 'mi',
    date: t.completedDate.slice(0, 10),
  };
}

/** When the MOT runs out, from DVSA alone: the latest pass's expiry, or a new vehicle's first test. */
function dvsaMotDue(dvsa) {
  const passes = (dvsa.motTests ?? [])
    .filter((t) => t.testResult === 'PASSED' && t.expiryDate)
    .map((t) => t.expiryDate)
    .sort();
  return passes.at(-1) ?? dvsa.motTestDueDate ?? null;
}

/**
 * DVLA's vehicle and DVSA's (either may be null) as the app's fields:
 * { registration, make, model, year, engineCc, fuel, electric, colour, co2, mpg,
 *   taxDueDate, motDueDate, lastMotMileage }, each null when neither has it.
 * DVLA wins where both have something, as it's the register.
 */
export function mergeVehicle(registration, dvla, dvsa) {
  const v = dvla ?? {};
  const m = dvsa ?? {};
  const fuel = fuelOf(v.fuelType) ?? fuelOf(m.fuelType);
  const co2 = v.co2Emissions > 0 ? v.co2Emissions : null;
  return {
    registration,
    make: tidyName(v.make ?? m.make),
    model: tidyName(m.model),
    year: v.yearOfManufacture ?? m.manufactureYear ?? yearOf(m.manufactureDate) ?? null,
    engineCc: v.engineCapacity > 0 ? v.engineCapacity : Number(m.engineSize) > 0 ? Number(m.engineSize) : null,
    fuel,
    electric: fuel === 'electric',
    colour: tidyName(v.colour ?? m.primaryColour),
    co2,
    mpg: mpgFromCo2(co2, fuel),
    taxDueDate: v.taxDueDate ?? null,
    motDueDate: v.motExpiry ?? (dvsa ? dvsaMotDue(m) : null),
    lastMotMileage: lastMotMileage(m.motTests),
  };
}

// Vehicles in the Garage: what to call them, and when one can be saved.

const same = (a, b) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

/** "ab12  cde " -> "AB12 CDE"; empty -> null. */
export function normalizeRegistration(text) {
  const reg = (text ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  return reg || null;
}

/**
 * What a vehicle is called: "Mazda MX-5". Nicknames were dropped; any saved
 * one stays in the database but isn't shown.
 */
export function vehicleLabel(vehicle) {
  return [vehicle.make, vehicle.model].filter(Boolean).join(' ');
}

/** Whether another of `vehicles` has the same make and model as `vehicle`. */
export const hasTwin = (vehicle, vehicles) =>
  vehicles.some((o) => o !== vehicle && same(o.make, vehicle.make) && same(o.model, vehicle.model));

/**
 * Why `fields` ({ make, model, registration }) can't be saved alongside
 * `others` (the Garage's other vehicles), or null. A registration is needed
 * once another vehicle has the same make and model, and no two can share one.
 */
export function registrationProblem(fields, others) {
  const reg = normalizeRegistration(fields.registration);
  if (reg) {
    return others.some((o) => o.registration === reg)
      ? 'Another vehicle already has this registration.'
      : null;
  }
  const twin = others.find((o) => same(o.make, fields.make) && same(o.model, fields.model));
  return twin ? `You already have a ${twin.make} ${twin.model}, so add the registration.` : null;
}

/**
 * What a registration lookup found (utils/vehicleLookup.js mergeVehicle), as a
 * vehicle's `details`: the fields only a lookup fills, with the registration it
 * was for and when.
 */
export function lookupDetails(found, lookedUpAt = Date.now()) {
  return {
    registration: found.registration,
    fuel: found.fuel,
    year: found.year,
    engineCc: found.engineCc,
    colour: found.colour,
    co2: found.co2,
    taxDueDate: found.taxDueDate,
    motDueDate: found.motDueDate,
    lastMotMileage: found.lastMotMileage,
    lookedUpAt,
  };
}

const compact = (reg) => (reg ?? '').replace(/\s+/g, '').toUpperCase();

/** `details` while they're for `registration` (a changed registration drops them), else null. */
export const detailsFor = (details, registration) =>
  details && registration && compact(details.registration) === compact(registration) ? details : null;

/** A lookup's make, model, fuel and mpg, as the vehicle form's own fields fill from it. */
export const formFromLookup = (found) => ({
  make: found.make ?? '',
  model: found.model ?? '',
  fuel: found.fuel ?? 'petrol',
  electric: found.electric,
  mpg: found.mpg,
});

/** "3.0 litre", from 2979 cc. */
const litres = (cc) => `${(Math.round(cc / 100) / 10).toFixed(1)} litre`;

/**
 * The grey line under a vehicle's name: "2011 · 3.0 litre petrol", "2023 ·
 * electric"; what's known of it, or null for one entered by hand.
 */
export function vehicleSubtitle(vehicle) {
  const d = vehicle?.details;
  if (!d) return null;
  // The fuel as set on the form (it can put a lookup right), else as looked up.
  const fuel = vehicle.fuel ?? d.fuel ?? (vehicle.electric ? 'electric' : null);
  const engine = d.engineCc && fuel !== 'electric' ? litres(d.engineCc) : null;
  const power = [engine, fuel].filter(Boolean).join(' ');
  const line = [d.year, power].filter(Boolean).join(' · ');
  return line || null;
}

// DVLA's colours (its 18 basic ones), as the number plate's side band shows them.
const PAINT = {
  beige: '#D8C8A8',
  black: '#202124',
  blue: '#1F4E9C',
  bronze: '#8C5A2B',
  brown: '#6B4226',
  cream: '#F1E6C8',
  gold: '#C9A13B',
  green: '#2E7D32',
  grey: '#80868B',
  maroon: '#7A1F2B',
  orange: '#E0661A',
  pink: '#E58FB0',
  purple: '#6A3D9A',
  red: '#C5221F',
  silver: '#C0C4C8',
  turquoise: '#2BB3A8',
  white: '#FFFFFF',
  yellow: '#F2C318',
};

/** The colour for DVLA's "Orange" (#E0661A), or null: none known, or multi-coloured. */
export const paintColour = (colour) => PAINT[(colour ?? '').trim().toLowerCase()] ?? null;

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

// Fuel or charging cost for a planned drive, from the car's own figure
// (average mpg in UK gallons, or miles per kWh for an electric car) and the
// price set on You (a litre, or a kWh). Shown only when both are set: no
// defaults, no national-average guesses.

const METERS_PER_MILE = 1609.344;
const LITRES_PER_GALLON = 4.54609;

const number = (text) => Number(String(text ?? '').replace(/[£p\s]/g, '').replace(',', '.'));

/**
 * The mpg as typed: { mpg } (null when left empty), or { error }.
 * "40", "38.5" and "38,5" all read.
 */
export function parseMpg(text) {
  if (!String(text ?? '').trim()) return { mpg: null };
  const mpg = number(text);
  return mpg >= 5 && mpg <= 200 ? { mpg } : { error: "Enter the car's average mpg, like 40" };
}

/** Miles per kWh as typed: { milesPerKwh } (null when left empty), or { error }. */
export function parseMilesPerKwh(text) {
  if (!String(text ?? '').trim()) return { milesPerKwh: null };
  const milesPerKwh = number(text);
  return milesPerKwh >= 1 && milesPerKwh <= 10
    ? { milesPerKwh }
    : { error: "Enter the car's average miles per kWh, like 3.5" };
}

/**
 * The price per litre as typed, in pounds: { price } or { error }. Pumps show
 * pence ("146.9"), so anything from 10 up is read as pence.
 */
export function parseFuelPrice(text) {
  let price = number(text);
  if (price >= 10) price /= 100;
  return price >= 0.3 && price <= 5
    ? { price: Math.round(price * 1000) / 1000 }
    : { error: 'Enter the price per litre, like 1.46' };
}

/**
 * The price per kWh as typed, in pounds: { price } or { error }. Tariffs are
 * in pence ("24.5", "79p"), so anything from 3 up is read as pence; "0.79"
 * reads as pounds.
 */
export function parseChargePrice(text) {
  let price = number(text);
  if (price >= 3) price /= 100;
  return price >= 0.03 && price <= 2
    ? { price: Math.round(price * 10000) / 10000 }
    : { error: 'Enter the price per kWh in pence, like 25' };
}

/** 40 -> "40 mpg", 38.5 -> "38.5 mpg". */
export const formatMpg = (mpg) => `${Number(mpg.toFixed(1))} mpg`;

/** 3.5 -> "3.5 mi/kWh". */
export const formatMilesPerKwh = (milesPerKwh) => `${Number(milesPerKwh.toFixed(1))} mi/kWh`;

/** 1.469 -> "£1.47". */
export const formatFuelPrice = (price) => `£${price.toFixed(2)}`;

/** 0.245 -> "24.5p", 0.79 -> "79p". */
export const formatChargePrice = (price) => `${Number((price * 100).toFixed(1))}p`;

/** What a vehicle's own figure says: "40 mpg" or "3.5 mi/kWh"; null when not set. */
export function formatEfficiency(vehicle) {
  if (vehicle.electric) return vehicle.milesPerKwh != null ? formatMilesPerKwh(vehicle.milesPerKwh) : null;
  return vehicle.mpg != null ? formatMpg(vehicle.mpg) : null;
}

/**
 * Pounds to drive `metres` in `vehicle` ({ electric, mpg, milesPerKwh }), with
 * `prices` = { fuel, charge } (pounds a litre / a kWh, or null). Null when the
 * car's figure or its price isn't set.
 */
export function driveCost(metres, vehicle, { fuel, charge }) {
  const miles = metres / METERS_PER_MILE;
  if (vehicle.electric) {
    return vehicle.milesPerKwh != null && charge != null ? (miles / vehicle.milesPerKwh) * charge : null;
  }
  return vehicle.mpg != null && fuel != null ? (miles / vehicle.mpg) * LITRES_PER_GALLON * fuel : null;
}

/** "£19 fuel" or "£6 charging", in whole pounds (never "£0"). */
export const formatDriveCost = (pounds, electric) =>
  `£${Math.max(1, Math.round(pounds)).toLocaleString()} ${electric ? 'charging' : 'fuel'}`;

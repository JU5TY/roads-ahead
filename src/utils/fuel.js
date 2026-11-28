// Fuel or charging cost for a drive, from the car's own figure (average mpg in
// UK gallons, or miles per kWh for an electric car) and a price (a litre, or a
// kWh). A drive already driven is costed at the UK's average pump price for its
// week (utils/fuelPrices.js), so a price typed today doesn't change what an old
// trip cost; a plan at the price typed on You, else the UK's latest. Charging
// has no UK figure, so it's always the price typed on You. No cost is shown
// until the car's figure and a price are both there.
//
// `units` 'metric' shows and reads the figure as L/100 km (kWh/100 km) and
// money in euros; the car's figure is still kept as mpg (mi/kWh), so switching
// units loses nothing. The UK's prices are only ever given in pounds.
import { ukPriceAt } from './fuelPrices';

const METERS_PER_MILE = 1609.344;
const LITRES_PER_GALLON = 4.54609;
// L/100 km = this / mpg (UK gallons), and kWh/100 km = this / mi/kWh: each
// turns the other way too.
const MPG_TO_L100KM = (100 * LITRES_PER_GALLON) / (METERS_PER_MILE / 1000);
const MI_KWH_TO_KWH100KM = 100 / (METERS_PER_MILE / 1000);

const number = (text) => Number(String(text ?? '').replace(/[£€p\s]/g, '').replace(',', '.'));

/** "£" or "€", as the units. */
export const currencySymbol = (units = 'imperial') => (units === 'metric' ? '€' : '£');

/** The unit a car's own figure is shown and typed in: "mpg", "L/100 km", "mi/kWh" or "kWh/100 km". */
export const efficiencyUnit = (electric, units = 'imperial') =>
  units === 'metric' ? (electric ? 'kWh/100 km' : 'L/100 km') : electric ? 'mi/kWh' : 'mpg';

/** A saved mpg (or mi/kWh) as shown in `units`: 40 mpg -> 7.06 L/100 km. */
export const toEfficiency = (figure, electric, units = 'imperial') =>
  units === 'metric' ? (electric ? MI_KWH_TO_KWH100KM : MPG_TO_L100KM) / figure : figure;

/**
 * The mpg as typed: { mpg } (null when left empty), or { error }.
 * "40", "38.5" and "38,5" all read; in 'metric' it's typed as L/100 km.
 */
export function parseMpg(text, units = 'imperial') {
  if (!String(text ?? '').trim()) return { mpg: null };
  const typed = number(text);
  const mpg = units === 'metric' ? MPG_TO_L100KM / typed : typed;
  if (mpg >= 5 && mpg <= 200) return { mpg };
  return {
    error: units === 'metric' ? "Enter the car's average L/100 km, like 5.9" : "Enter the car's average mpg, like 40",
  };
}

/**
 * Miles per kWh as typed: { milesPerKwh } (null when left empty), or { error };
 * in 'metric' it's typed as kWh/100 km.
 */
export function parseMilesPerKwh(text, units = 'imperial') {
  if (!String(text ?? '').trim()) return { milesPerKwh: null };
  const typed = number(text);
  const milesPerKwh = units === 'metric' ? MI_KWH_TO_KWH100KM / typed : typed;
  if (milesPerKwh >= 1 && milesPerKwh <= 10) return { milesPerKwh };
  return {
    error:
      units === 'metric'
        ? "Enter the car's average kWh/100 km, like 16.5"
        : "Enter the car's average miles per kWh, like 3.5",
  };
}

/**
 * The price per litre as typed, in pounds (euros in 'metric'): { price } or
 * { error }. UK pumps show pence ("146.9"), so anything from 10 up is read as
 * pence (or cents).
 */
export function parseFuelPrice(text, units = 'imperial') {
  let price = number(text);
  if (price >= 10) price /= 100;
  return price >= 0.3 && price <= 5
    ? { price: Math.round(price * 1000) / 1000 }
    : { error: `Enter the price per litre, like ${units === 'metric' ? '1.79' : '1.46'}` };
}

/**
 * The price per kWh as typed, in pounds (euros in 'metric'): { price } or
 * { error }. UK tariffs are in pence ("24.5", "79p"), so anything from 3 up is
 * read as pence (or cents); "0.79" reads as pounds.
 */
export function parseChargePrice(text, units = 'imperial') {
  let price = number(text);
  if (price >= 3) price /= 100;
  return price >= 0.03 && price <= 2
    ? { price: Math.round(price * 10000) / 10000 }
    : { error: units === 'metric' ? 'Enter the price per kWh, like 0.35' : 'Enter the price per kWh in pence, like 25' };
}

/** 40 -> "40 mpg", 38.5 -> "38.5 mpg"; in 'metric', 40 -> "7.1 L/100 km". */
export const formatMpg = (mpg, units = 'imperial') =>
  `${Number(toEfficiency(mpg, false, units).toFixed(1))} ${efficiencyUnit(false, units)}`;

/** 3.5 -> "3.5 mi/kWh"; in 'metric', 3.5 -> "17.8 kWh/100 km". */
export const formatMilesPerKwh = (milesPerKwh, units = 'imperial') =>
  `${Number(toEfficiency(milesPerKwh, true, units).toFixed(1))} ${efficiencyUnit(true, units)}`;

/** 1.469 -> "£1.47" (or "€1.47"). */
export const formatFuelPrice = (price, units = 'imperial') => `${currencySymbol(units)}${price.toFixed(2)}`;

/** 0.245 -> "24.5p", 0.79 -> "79p"; in euros, as the pump shows it, "€0.35". */
export const formatChargePrice = (price, units = 'imperial') =>
  units === 'metric' ? `€${price.toFixed(2)}` : `${Number((price * 100).toFixed(1))}p`;

/**
 * What a vehicle's own figure says: "40 mpg" or "3.5 mi/kWh" ("7.1 L/100 km"
 * or "17.8 kWh/100 km" in 'metric'); null when not set.
 */
export function formatEfficiency(vehicle, units = 'imperial') {
  if (vehicle.electric) {
    return vehicle.milesPerKwh != null ? formatMilesPerKwh(vehicle.milesPerKwh, units) : null;
  }
  return vehicle.mpg != null ? formatMpg(vehicle.mpg, units) : null;
}

/**
 * Pounds (or euros) to drive `metres` in `vehicle` ({ electric, mpg,
 * milesPerKwh }), with `prices` = { fuel, charge } (a litre / a kWh, or null).
 * Null when the car's figure or its price isn't set.
 */
export function driveCost(metres, vehicle, { fuel, charge }) {
  const miles = metres / METERS_PER_MILE;
  if (vehicle.electric) {
    return vehicle.milesPerKwh != null && charge != null ? (miles / vehicle.milesPerKwh) * charge : null;
  }
  return vehicle.mpg != null && fuel != null ? (miles / vehicle.mpg) * LITRES_PER_GALLON * fuel : null;
}

const isDiesel = (vehicle) => vehicle?.fuel === 'diesel';

/**
 * The { fuel, charge } prices (or null) for a drive driven at `time` in
 * `vehicle`: fuel at the UK's average for that week, else (no figures yet, a
 * drive before them, or not a UK phone in pounds) the price typed on You, else
 * the UK's latest, as for a plan (the example trip, from 2000, predates the
 * figures, which start in June 2003).
 * `prices` and `weeks` are SettingsContext's `prices` and `ukFuelWeeks`.
 */
export const pricesForDrive = (prices, weeks, time, vehicle) => ({
  fuel:
    ukPriceAt(weeks, time, isDiesel(vehicle)) ??
    prices.fuel?.price ??
    ukPriceAt(weeks, Date.now(), isDiesel(vehicle)),
  charge: prices.charge?.price ?? null,
});

/** The { fuel, charge } prices for a plan: the ones typed on You, else the UK's latest fuel price. */
export const pricesForPlan = (prices, weeks, vehicle) => ({
  fuel: prices.fuel?.price ?? ukPriceAt(weeks, Date.now(), isDiesel(vehicle)),
  charge: prices.charge?.price ?? null,
});

/** "~£19" (or "~€19"), in whole pounds (never "~£0"): the ~ as it's an estimate. */
export const formatCost = (amount, units = 'imperial') =>
  `~${currencySymbol(units)}${Math.max(1, Math.round(amount)).toLocaleString()}`;

/** "~£19 fuel" or "~£6 charging" (or "~€19 fuel"), in whole pounds (never "~£0"). */
export const formatDriveCost = (amount, electric, units = 'imperial') =>
  `${formatCost(amount, units)} ${electric ? 'charging' : 'fuel'}`;

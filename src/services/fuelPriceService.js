// The UK's weekly average pump prices (utils/fuelPrices.js), from the app's server
// (server/app, GET /fuel-prices). The phone keeps the last table it was given and
// asks again once a day at most; offline, or with no server set, it keeps what
// it has (none at first), and costs fall back to the price typed on You.
import Storage from 'expo-sqlite/kv-store';

// Set per build or update, as for printed posters (services/posterService.js).
const API = process.env.EXPO_PUBLIC_SERVER_URL;
const KEY = 'ukFuelPrices';
const DAY_MS = 24 * 60 * 60 * 1000;

/** The saved { weeks, fetchedAt }, or null. */
export function getSavedUkFuelPrices() {
  try {
    const saved = JSON.parse(Storage.getItemSync(KEY));
    return Array.isArray(saved?.weeks) && saved.weeks.length ? saved : null;
  } catch {
    return null;
  }
}

/**
 * A newer table, saved, when the saved one is a day old (or there's none):
 * { weeks, fetchedAt }, or null when there's nothing new or it can't be had.
 */
export async function refreshUkFuelPrices(saved = getSavedUkFuelPrices()) {
  if (!API || (saved && Date.now() - saved.fetchedAt < DAY_MS)) return null;
  const res = await fetch(`${API}/fuel-prices`);
  if (!res.ok) throw new Error(`fuel prices answered ${res.status}`);
  const { weeks } = await res.json();
  if (!Array.isArray(weeks) || !weeks.length) return null;
  const next = { weeks, fetchedAt: Date.now() };
  await Storage.setItemAsync(KEY, JSON.stringify(next));
  return next;
}

// Small persisted user preferences (expo-sqlite key-value store). Sync reads so
// the first render already uses the saved values.
import Storage from 'expo-sqlite/kv-store';
import { Platform } from 'react-native';

import { onUkPhone } from '../utils/region';

const UNITS_KEY = 'settings.units';
// Set once the units are settled. That's on the first launch since km came
// with euros: from the phone (UK phones miles, the rest km), then kept, so a
// trip abroad can't change them. A choice saved before then meant km with
// pounds, so it isn't kept.
const UNITS_SETTLED_KEY = 'settings.unitsSettled';

/**
 * 'metric' | 'imperial': km, L/100 km and euros, or miles, mpg and pounds.
 * Until one is picked on You, UK phones start on miles and the rest on km.
 */
export function getUnits() {
  const saved = Storage.getItemSync(UNITS_KEY);
  if (Storage.getItemSync(UNITS_SETTLED_KEY) && (saved === 'metric' || saved === 'imperial')) return saved;
  const units = onUkPhone ? 'imperial' : 'metric';
  try {
    Storage.setItemSync(UNITS_KEY, units);
    Storage.setItemSync(UNITS_SETTLED_KEY, 'true');
    // Prices typed before then were in pounds.
    if (units === 'metric') Object.values(PRICE_KEYS).forEach((key) => Storage.setItemSync(key, 'null'));
  } catch (err) {
    console.warn('[settings] units not saved', err);
  }
  return units;
}

export function setUnits(units) {
  return Storage.setItemAsync(UNITS_KEY, units);
}

const BREAK_KEY = 'settings.breakReminderMinutes';

// Minutes of driving before Record suggests a break; 0 turns the reminder off.
export const BREAK_REMINDER_OPTIONS = [0, 60, 90, 120, 150, 180];
export const DEFAULT_BREAK_REMINDER_MINUTES = 120;

export function getBreakReminderMinutes() {
  const raw = Storage.getItemSync(BREAK_KEY);
  const saved = raw == null ? NaN : Number(raw);
  return BREAK_REMINDER_OPTIONS.includes(saved) ? saved : DEFAULT_BREAK_REMINDER_MINUTES;
}

export function setBreakReminderMinutes(minutes) {
  return Storage.setItemAsync(BREAK_KEY, String(minutes));
}

const ONBOARDED_KEY = 'settings.onboarded';

/** True once Welcome has been passed; null when unknown (never saved). */
export function getOnboarded() {
  const raw = Storage.getItemSync(ONBOARDED_KEY);
  return raw == null ? null : raw === 'true';
}

export function setOnboarded(done) {
  return Storage.setItemAsync(ONBOARDED_KEY, String(done));
}

const THEME_KEY = 'settings.theme';
export const THEME_OPTIONS = ['system', 'light', 'dark'];

/** 'system' (follow the phone), 'light' or 'dark'. */
export function getTheme() {
  const saved = Storage.getItemSync(THEME_KEY);
  return THEME_OPTIONS.includes(saved) ? saved : 'system';
}

export function setTheme(theme) {
  return Storage.setItemAsync(THEME_KEY, theme);
}

const MAP_VIEW_KEY = 'settings.mapView';
export const MAP_VIEW_OPTIONS = ['map', 'satellite', 'terrain'];

/** How the full maps are drawn: 'map', 'satellite' or 'terrain' (hooks/useMapView.js). */
export function getMapView() {
  const saved = Storage.getItemSync(MAP_VIEW_KEY);
  return MAP_VIEW_OPTIONS.includes(saved) ? saved : 'map';
}

export function setMapView(view) {
  return Storage.setItemAsync(MAP_VIEW_KEY, view);
}

// Prices for plans' fuel cost (utils/fuel.js), each saved as { price, setAt }:
// pounds or euros (as the units) a litre or a kWh, and when it was set. Null
// until set: no defaults.
const PRICE_KEYS = { fuel: 'settings.fuelPrice', charge: 'settings.chargePrice' };

/** The 'fuel' (a litre) or 'charge' (a kWh) price, or null. */
export function getPrice(kind) {
  try {
    const saved = JSON.parse(Storage.getItemSync(PRICE_KEYS[kind]));
    return saved?.price > 0 ? saved : null;
  } catch {
    return null;
  }
}

/** `saved` null clears it. */
export function setPrice(kind, saved) {
  return Storage.setItemAsync(PRICE_KEYS[kind], JSON.stringify(saved));
}

const NAV_APP_KEY = 'settings.navApp';

/** The sat nav apps on offer, in order: Apple Maps only on iPhone (utils/navLinks.js NAV_APPS). */
export const NAV_APP_OPTIONS = Platform.OS === 'ios' ? ['apple', 'google', 'waze'] : ['google', 'waze'];

/** The app Navigate hands drives to: Google Maps on Android and Apple Maps on iPhone until chosen. */
export function getNavApp() {
  const saved = Storage.getItemSync(NAV_APP_KEY);
  return NAV_APP_OPTIONS.includes(saved) ? saved : NAV_APP_OPTIONS[0];
}

export function setNavApp(app) {
  return Storage.setItemAsync(NAV_APP_KEY, app);
}

const SHARE_CARD_KEY = 'shareCardFile';

/** The share image still on the phone, if any, so it's found again after the app is killed. */
export function getShareCardFile() {
  return Storage.getItemSync(SHARE_CARD_KEY);
}

export function setShareCardFile(uri) {
  if (uri == null) Storage.removeItemSync(SHARE_CARD_KEY);
  else Storage.setItemSync(SHARE_CARD_KEY, uri);
}

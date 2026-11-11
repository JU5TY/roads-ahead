// Small persisted user preferences (expo-sqlite key-value store). Sync reads so
// the first render already uses the saved values.
import Storage from 'expo-sqlite/kv-store';
import { Platform } from 'react-native';

const UNITS_KEY = 'settings.units';

/** 'metric' | 'imperial'; miles until km are chosen in Settings. */
export function getUnits() {
  return Storage.getItemSync(UNITS_KEY) === 'metric' ? 'metric' : 'imperial';
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

const SHOW_ROADS_KEY = 'settings.showIconicRoads';

/** Show Iconic Roads across the app (default on). Completions are recorded either way. */
export function getShowIconicRoads() {
  return Storage.getItemSync(SHOW_ROADS_KEY) !== 'false';
}

export function setShowIconicRoads(show) {
  return Storage.setItemAsync(SHOW_ROADS_KEY, String(show));
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
// pounds a litre or a kWh, and when it was set. Null until set: no defaults.
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

const RECORD_MAP_HIDDEN_KEY = 'recordMapHidden';

/** Whether Record's map was hidden last time, so the next drive starts the same way. */
export function getRecordMapHidden() {
  return Storage.getItemSync(RECORD_MAP_HIDDEN_KEY) === 'true';
}

export function setRecordMapHidden(hidden) {
  return Storage.setItemAsync(RECORD_MAP_HIDDEN_KEY, String(hidden));
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

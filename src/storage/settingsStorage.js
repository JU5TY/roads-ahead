// Small persisted user preferences (expo-sqlite key-value store). Sync reads so
// the first render already uses the saved values.
import Storage from 'expo-sqlite/kv-store';

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

const RECORD_MAP_HIDDEN_KEY = 'recordMapHidden';

/** Whether Record's map was hidden last time, so the next drive starts the same way. */
export function getRecordMapHidden() {
  return Storage.getItemSync(RECORD_MAP_HIDDEN_KEY) === 'true';
}

export function setRecordMapHidden(hidden) {
  return Storage.setItemAsync(RECORD_MAP_HIDDEN_KEY, String(hidden));
}

// Road lines from the routing service (services/routing.js), saved so a plan's
// map can draw them without asking again. Google allows its coordinates to be
// kept for 30 days, so older lines are deleted, and they never go in the backup
// file. Each is saved under its drive's points, so a drive whose stops change
// gets a new line and the old one runs out.
import Storage from 'expo-sqlite/kv-store';

const PREFIX = 'route.';
export const KEEP_MS = 30 * 24 * 60 * 60 * 1000;

/** The key a drive's line is saved under: its points, rounded to about a metre. */
export function routeKey(points) {
  return points.map((p) => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}${p.via ? 'v' : ''}`).join(';');
}

/** A saved line for these points, or null when there's none or it's over 30 days old. */
export async function getSavedLine(key, now = Date.now()) {
  try {
    const saved = JSON.parse((await Storage.getItemAsync(PREFIX + key)) ?? 'null');
    if (!saved) return null;
    if (now - saved.savedAt > KEEP_MS) {
      await Storage.removeItemAsync(PREFIX + key);
      return null;
    }
    return saved.line;
  } catch {
    return null;
  }
}

export async function saveLine(key, line) {
  await Storage.setItemAsync(PREFIX + key, JSON.stringify({ savedAt: Date.now(), line }));
}

/** Deletes every saved line over 30 days old, including those of drives since changed. */
export async function forgetOldLines(now = Date.now()) {
  const keys = (await Storage.getAllKeysAsync()).filter((k) => k.startsWith(PREFIX));
  for (const key of keys) await getSavedLine(key.slice(PREFIX.length), now);
}

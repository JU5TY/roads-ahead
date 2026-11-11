// Ferry and tunnel crossings, saved on the drive (drives.sea_crossings), and
// the drive's stats worked out again without them. See utils/crossings.js.
import Storage from 'expo-sqlite/kv-store';

import {
  CROSSINGS_VERSION,
  detectCrossings,
  overlapsAny,
  statsWithoutCrossings,
} from '../utils/crossings';
import { getDb } from './db';
import { getDrivePoints } from './driveStorage';

const CHECKED_KEY = 'crossings.checkedVersion';

/**
 * Find one completed drive's crossings and save them. A drive with a crossing
 * (now or before) gets its stats redone so the crossing isn't counted as
 * driving, and so does one whose rest stops now join up; others keep the stats
 * worked out while recording. A crossing the
 * driver paused over is already left out, so it isn't saved. Returns the crossings.
 */
export async function checkDriveCrossings(driveId) {
  const points = await getDrivePoints(driveId);
  const db = await getDb();
  let crossings = [];
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync(
      'SELECT stats, places, sea_crossings FROM drives WHERE id = ?',
      driveId
    );
    if (!row) return;
    const current = JSON.parse(row.stats);
    const pauses = (current.pauses ?? []).filter((p) => p.endedAt !== null && p.from);
    crossings = detectCrossings(points).filter((c) => !overlapsAny(c, pauses));
    const had = row.sea_crossings ? JSON.parse(row.sea_crossings).length > 0 : false;
    const gaps = [...crossings, ...pauses].sort((a, b) => a.startedAt - b.startedAt);
    const redone = statsWithoutCrossings(points, gaps);
    // Without a crossing, only redo a drive whose rest stops now join up (one
    // recorded before walks round a stop were joined into it).
    if (crossings.length === 0 && !had && redone.stops.length >= current.stops.length) {
      await db.runAsync("UPDATE drives SET sea_crossings = '[]' WHERE id = ?", driveId);
      return;
    }
    const stats = {
      ...current,
      ...redone,
      // Saved points don't keep altitude accuracy, so keep the climb measured live.
      maxAltitudeM: current.maxAltitudeM,
      elevationGainM: current.elevationGainM,
      pauses: current.pauses ?? [],
      paused: false,
    };
    // Stop names are stored by position; keep each with its stop (new ones get looked up).
    const places = row.places ? JSON.parse(row.places) : null;
    if (places?.stops) {
      const names = new Map(current.stops.map((s, i) => [s.startedAt, places.stops[i] ?? null]));
      places.stops = stats.stops.map((s) => names.get(s.startedAt) ?? null);
    }
    await db.runAsync(
      'UPDATE drives SET stats = ?, places = ?, sea_crossings = ? WHERE id = ?',
      JSON.stringify(stats),
      places ? JSON.stringify(places) : row.places,
      JSON.stringify(crossings),
      driveId
    );
  });
  return crossings;
}

/**
 * Check every completed drive once per version of detection and borders, so
 * trips recorded before crossings existed get theirs. Safe to call on every launch.
 */
export async function checkAllCrossingsIfNeeded() {
  if (Storage.getItemSync(CHECKED_KEY) === CROSSINGS_VERSION) return;
  const db = await getDb();
  const rows = await db.getAllAsync(
    "SELECT id FROM drives WHERE status = 'completed' ORDER BY started_at"
  );
  for (const { id } of rows) await checkDriveCrossings(id);
  await Storage.setItemAsync(CHECKED_KEY, CROSSINGS_VERSION);
}

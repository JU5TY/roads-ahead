// Iconic Roads completions: which roads each drive completed, and whether the
// drive's times are hidden (stats.timesHidden). Road data itself is bundled
// (src/utils/iconicRoads.js); only the user's progress is stored here.
import Storage from 'expo-sqlite/kv-store';

import { ROADS_VERSION, detectCompletions, shouldHideTimes } from '../utils/iconicRoads';
import { getDb } from './db';
import { getDrivePoints } from './driveStorage';

const CHECKED_KEY = 'roads.checkedVersion';

/** Check one completed drive against the road list and save the result. Returns its completions. */
export async function checkDrive(driveId) {
  const db = await getDb();
  const row = await db.getFirstAsync('SELECT stats FROM drives WHERE id = ?', driveId);
  if (!row) return [];
  const points = await getDrivePoints(driveId);
  const completions = detectCompletions(points);
  const stats = { ...JSON.parse(row.stats), timesHidden: shouldHideTimes(points, completions) };
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM road_completions WHERE drive_id = ?', driveId);
    for (const c of completions) {
      await db.runAsync(
        'INSERT INTO road_completions (road_id, drive_id, completed_at) VALUES (?, ?, ?)',
        c.roadId,
        driveId,
        c.completedAt
      );
    }
    await db.runAsync('UPDATE drives SET stats = ? WHERE id = ?', JSON.stringify(stats), driveId);
  });
  return completions;
}

/**
 * Check every completed drive once per version of the road list, so past trips
 * earn roads added later. Runs in the background; safe to call on every launch.
 */
export async function checkAllDrivesIfNeeded() {
  if (Storage.getItemSync(CHECKED_KEY) === ROADS_VERSION) return;
  const db = await getDb();
  const rows = await db.getAllAsync(
    "SELECT id FROM drives WHERE status = 'completed' ORDER BY started_at"
  );
  for (const { id } of rows) await checkDrive(id);
  await Storage.setItemAsync(CHECKED_KEY, ROADS_VERSION);
}

const rowToCompletion = (r) => ({
  roadId: r.road_id,
  driveId: r.drive_id,
  completedAt: r.completed_at,
});

/** Completions on one drive, oldest first. */
export async function getDriveCompletions(driveId) {
  const db = await getDb();
  const rows = await db.getAllAsync(
    'SELECT * FROM road_completions WHERE drive_id = ? ORDER BY completed_at',
    driveId
  );
  return rows.map(rowToCompletion);
}

/** Completions on any drive of a trip, oldest first. */
export async function getTripCompletions(tripId) {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT c.* FROM road_completions c JOIN drives d ON d.id = c.drive_id
     WHERE d.trip_id = ? ORDER BY c.completed_at`,
    tripId
  );
  return rows.map(rowToCompletion);
}

/**
 * Per-road totals: Map roadId → { count, first, last } (times in ms).
 * Roads never completed are absent.
 */
export async function getRoadTotals() {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT road_id, COUNT(*) AS count, MIN(completed_at) AS first, MAX(completed_at) AS last
     FROM road_completions GROUP BY road_id`
  );
  return new Map(rows.map((r) => [r.road_id, { count: r.count, first: r.first, last: r.last }]));
}

/** A road's completions with their drive and trip, newest first. */
export async function getRoadCompletions(roadId) {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT c.*, d.trip_id, d.started_at AS drive_started_at FROM road_completions c
     JOIN drives d ON d.id = c.drive_id
     WHERE c.road_id = ? ORDER BY c.completed_at DESC`,
    roadId
  );
  return rows.map((r) => ({
    ...rowToCompletion(r),
    tripId: r.trip_id,
    driveStartedAt: r.drive_started_at,
  }));
}

/** Map tripId → the ids of the Iconic Roads completed on that trip (for Trips search). */
export async function getRoadIdsByTrip() {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT DISTINCT d.trip_id, c.road_id FROM road_completions c JOIN drives d ON d.id = c.drive_id`
  );
  const byTrip = new Map();
  for (const r of rows) byTrip.set(r.trip_id, [...(byTrip.get(r.trip_id) ?? []), r.road_id]);
  return byTrip;
}

/** Map tripId → number of different Iconic Roads completed on that trip. */
export async function getRoadCountsByTrip() {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT d.trip_id, COUNT(DISTINCT c.road_id) AS roads FROM road_completions c
     JOIN drives d ON d.id = c.drive_id GROUP BY d.trip_id`
  );
  return new Map(rows.map((r) => [r.trip_id, r.roads]));
}

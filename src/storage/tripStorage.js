// Trips: a journey made of one or more drives (see db.js for the schema).
// Days are not stored; they are derived from drive start dates (utils/tripSummary.js).
import { getDb } from './db';
import { rowToDrive } from './driveStorage';
import { forgetExampleTrip, getExampleTripId } from './exampleTrip';

function rowToTrip(row, drives) {
  return {
    id: row.id,
    name: row.name,
    notes: row.notes,
    createdAt: row.created_at,
    drives, // oldest first
  };
}

/**
 * All trips that have at least one completed drive, most recent first.
 * Active (still recording) drives are left out.
 */
export async function listTrips() {
  const db = await getDb();
  const [tripRows, driveRows] = await Promise.all([
    db.getAllAsync('SELECT * FROM trips'),
    db.getAllAsync("SELECT * FROM drives WHERE status = 'completed' ORDER BY started_at"),
  ]);
  const drivesByTrip = new Map();
  for (const row of driveRows) {
    const list = drivesByTrip.get(row.trip_id) ?? [];
    list.push(rowToDrive(row));
    drivesByTrip.set(row.trip_id, list);
  }
  return tripRows
    .filter((row) => drivesByTrip.has(row.id))
    .map((row) => rowToTrip(row, drivesByTrip.get(row.id)))
    .sort((a, b) => b.drives.at(-1).startedAt - a.drives.at(-1).startedAt);
}

/** One trip with its drives (oldest first), or null. */
export async function getTrip(tripId, { includeActive = false } = {}) {
  const db = await getDb();
  const row = await db.getFirstAsync('SELECT * FROM trips WHERE id = ?', tripId);
  if (!row) return null;
  const status = includeActive ? '' : "AND status = 'completed'";
  const driveRows = await db.getAllAsync(
    `SELECT * FROM drives WHERE trip_id = ? ${status} ORDER BY started_at`,
    tripId
  );
  return rowToTrip(row, driveRows.map(rowToDrive));
}

/**
 * The trip whose latest drive ended within `withinMs`, offered as "Continue".
 * Null when there is none.
 */
export async function getContinuableTrip(withinMs, now = Date.now()) {
  const db = await getDb();
  const last = await db.getFirstAsync(
    "SELECT trip_id, ended_at FROM drives WHERE status = 'completed' ORDER BY ended_at DESC LIMIT 1"
  );
  if (!last || now - last.ended_at > withinMs) return null;
  return getTrip(last.trip_id);
}

export async function updateTrip(tripId, { name, notes }) {
  const db = await getDb();
  // Empty strings clear the field (an unnamed trip is titled from its places).
  await db.runAsync(
    'UPDATE trips SET name = ?, notes = ? WHERE id = ?',
    name?.trim() || null,
    notes?.trim() || null,
    tripId
  );
}

/** Delete a trip with all of its drives, their points and Iconic Roads. */
export async function deleteTrip(tripId) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'DELETE FROM points WHERE drive_id IN (SELECT id FROM drives WHERE trip_id = ?)',
      tripId
    );
    await db.runAsync(
      'DELETE FROM road_completions WHERE drive_id IN (SELECT id FROM drives WHERE trip_id = ?)',
      tripId
    );
    await db.runAsync('DELETE FROM drives WHERE trip_id = ?', tripId);
    await db.runAsync('DELETE FROM trips WHERE id = ?', tripId);
  });
}

/** Remove the example trip, if it's still there: the first recorded drive replaces it. */
export async function removeExampleTrip() {
  const id = getExampleTripId();
  if (id === null) return;
  await deleteTrip(id);
  await forgetExampleTrip();
}

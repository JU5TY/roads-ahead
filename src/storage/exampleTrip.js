// The example trip (src/utils/exampleTrip.js): saved as an ordinary trip when the
// database is first created, so every screen shows it like any other, and
// removed when the first drive is recorded. Its id is kept in the key-value store
// so it isn't mistaken for a real drive (Welcome) and is never saved again.
import Storage from 'expo-sqlite/kv-store';

import { EXAMPLE_TRIP_NAME, EXAMPLE_TRIP_NOTES, exampleDrives } from '../utils/exampleTrip';

const KEY = 'exampleTrip.id';
const POINTS_PER_INSERT = 500; // rows per INSERT, well under SQLite's bound-parameter limit

/** The example trip's id while it's still there, else null. */
export function getExampleTripId() {
  const id = Storage.getItemSync(KEY);
  return id ? Number(id) : null;
}

export const forgetExampleTrip = () => Storage.removeItemAsync(KEY);

/** Save the example trip into `db`. Called by db.js while it creates the database. */
export async function seedExampleTrip(db) {
  const drives = exampleDrives();
  try {
    await db.withTransactionAsync(async () => {
      const trip = await db.runAsync(
        'INSERT INTO trips (name, notes, created_at) VALUES (?, ?, ?)',
        EXAMPLE_TRIP_NAME,
        EXAMPLE_TRIP_NOTES,
        drives[0].startedAt
      );
      Storage.setItemSync(KEY, String(trip.lastInsertRowId));
      for (const drive of drives) {
        const row = await db.runAsync(
          "INSERT INTO drives (trip_id, started_at, ended_at, status, stats, places) VALUES (?, ?, ?, 'completed', ?, ?)",
          trip.lastInsertRowId,
          drive.startedAt,
          drive.endedAt,
          JSON.stringify(drive.stats),
          JSON.stringify(drive.places)
        );
        for (let i = 0; i < drive.fixes.length; i += POINTS_PER_INSERT) {
          const batch = drive.fixes.slice(i, i + POINTS_PER_INSERT);
          await db.runAsync(
            `INSERT INTO points (drive_id, latitude, longitude, altitude, speed, accuracy, timestamp) VALUES ${batch
              .map(() => '(?, ?, ?, ?, ?, ?, ?)')
              .join(', ')}`,
            batch.flatMap((f) => [
              row.lastInsertRowId,
              f.latitude,
              f.longitude,
              f.altitude,
              f.speed,
              f.accuracy,
              f.timestamp,
            ])
          );
        }
      }
    });
  } catch (err) {
    // Rolled back, so its id may be given to a real trip later.
    await forgetExampleTrip();
    throw err;
  }
}

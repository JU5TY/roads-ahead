// Shared SQLite connection and schema migrations (expo-sqlite).
// Used from both React screens and the background location task, so it must
// not depend on React context.
//
// Schema (current):
//   trips  (id, name, notes, created_at)                  a journey, e.g. "Scotland 2026"
//   drives (id, trip_id, started_at, ended_at, status,    one START→STOP recording
//           stats, places)
//   points (id, drive_id, latitude, longitude, altitude,  raw GPS fixes of a drive
//           speed, accuracy, timestamp)
//   road_completions (id, road_id, drive_id,              Iconic Roads completed on a drive
//           completed_at)                                 (road ids from src/data/iconicRoads.json)
//   drives.sea_crossings                                  ferry and tunnel crossings (JSON, utils/crossings.js)
import * as SQLite from 'expo-sqlite';

import { seedExampleTrip } from './exampleTrip';

// The original (version 0) schema. Later versions are reached via MIGRATIONS.
const BASE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    status TEXT NOT NULL DEFAULT 'active',
    stats TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    altitude REAL,
    speed REAL,
    accuracy REAL,
    timestamp INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_points_trip_time ON points (trip_id, timestamp);
`;

// Applied in order; MIGRATIONS[n] takes PRAGMA user_version from n to n + 1.
// Never edit or reorder an entry once it has shipped, only append.
const MIGRATIONS = [
  // 1: place names for start, end and rest stops (JSON).
  'ALTER TABLE trips ADD COLUMN places TEXT;',
  // 2: multi-day trips. Each existing recording becomes a drive inside its own trip
  // (same id, so nothing else needs remapping).
  // points is rebuilt rather than renamed so its foreign key points at drives
  // (RENAME TABLE only rewrites references on some SQLite builds).
  `
    ALTER TABLE trips RENAME TO drives;
    CREATE TABLE points_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drive_id INTEGER NOT NULL REFERENCES drives(id) ON DELETE CASCADE,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      altitude REAL,
      speed REAL,
      accuracy REAL,
      timestamp INTEGER NOT NULL
    );
    INSERT INTO points_new (id, drive_id, latitude, longitude, altitude, speed, accuracy, timestamp)
      SELECT id, trip_id, latitude, longitude, altitude, speed, accuracy, timestamp FROM points;
    DROP TABLE points;
    ALTER TABLE points_new RENAME TO points;
    CREATE INDEX idx_points_drive_time ON points (drive_id, timestamp);
    CREATE TABLE trips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      notes TEXT,
      created_at INTEGER NOT NULL
    );
    ALTER TABLE drives ADD COLUMN trip_id INTEGER REFERENCES trips(id);
    INSERT INTO trips (id, created_at) SELECT id, started_at FROM drives;
    UPDATE drives SET trip_id = id;
    CREATE INDEX idx_drives_trip ON drives (trip_id, started_at);
  `,
  // 3: Iconic Roads completions. Deleted with their drive in driveStorage/tripStorage
  // (foreign keys aren't enforced).
  `
    CREATE TABLE road_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      road_id TEXT NOT NULL,
      drive_id INTEGER NOT NULL REFERENCES drives(id) ON DELETE CASCADE,
      completed_at INTEGER NOT NULL
    );
    CREATE INDEX idx_road_completions_drive ON road_completions (drive_id);
    CREATE INDEX idx_road_completions_road ON road_completions (road_id, completed_at);
  `,
  // 4: the countries each drive went through (JSON, see utils/countries.js).
  'ALTER TABLE drives ADD COLUMN countries TEXT;',
  // 5: the Garage. Each drive records the vehicle it was driven in (null: none set).
  `
    CREATE TABLE vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    ALTER TABLE drives ADD COLUMN vehicle_id INTEGER REFERENCES vehicles(id);
  `,
  // 6: ferry and tunnel crossings on each drive (JSON, see utils/crossings.js).
  'ALTER TABLE drives ADD COLUMN sea_crossings TEXT;',
  // 7: vehicles get a make, model, optional registration and nickname. The old
  // name is split at its first space ("Mazda MX-5" -> Mazda, MX-5); `name`
  // stays (it's NOT NULL) and holds the label (utils/vehicles.js vehicleLabel).
  `
    ALTER TABLE vehicles ADD COLUMN make TEXT;
    ALTER TABLE vehicles ADD COLUMN model TEXT;
    ALTER TABLE vehicles ADD COLUMN registration TEXT;
    ALTER TABLE vehicles ADD COLUMN nickname TEXT;
    UPDATE vehicles SET
      make = CASE WHEN instr(trim(name), ' ') > 0
        THEN substr(trim(name), 1, instr(trim(name), ' ') - 1) ELSE trim(name) END,
      model = CASE WHEN instr(trim(name), ' ') > 0
        THEN trim(substr(trim(name), instr(trim(name), ' ') + 1)) ELSE '' END;
  `,
];

/** Bring the schema up to date. Resolves to true when the database was just created. */
async function migrate(db) {
  const { user_version: version } = await db.getFirstAsync('PRAGMA user_version');
  if (version === 0) await db.execAsync(BASE_SCHEMA);
  for (let v = version; v < MIGRATIONS.length; v++) {
    await db.withTransactionAsync(() =>
      db.execAsync(`${MIGRATIONS[v]} PRAGMA user_version = ${v + 1};`)
    );
  }
  return version === 0;
}

let dbPromise = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('roadtrip.db');
      await db.execAsync('PRAGMA journal_mode = WAL;');
      // A new install starts with the example trip (never again, even once it's gone).
      if (await migrate(db)) {
        await seedExampleTrip(db).catch((err) => console.warn('[db] example trip failed', err));
      }
      return db;
    })();
    // Let a failed open be retried on the next call.
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

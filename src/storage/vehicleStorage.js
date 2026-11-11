// The Garage: the user's vehicles. Each drive keeps the vehicle it was driven
// in (drives.vehicle_id); new drives get the default one.
import { normalizeRegistration, vehicleLabel } from '../utils/vehicles';
import { getDb } from './db';

/** Columns as saved: trimmed, registration normalized, `name` the label, `mpg` and `milesPerKwh` numbers or null. */
function toColumns({ make, model, registration, nickname, electric, mpg, milesPerKwh }) {
  const v = {
    make: make.trim(),
    model: model.trim(),
    registration: normalizeRegistration(registration),
    nickname: nickname?.trim() || null,
    electric: electric ? 1 : 0,
    mpg: mpg ?? null,
    milesPerKwh: milesPerKwh ?? null,
  };
  return { ...v, name: vehicleLabel(v) };
}

/**
 * All vehicles, default first, with their totals:
 * [{ id, make, model, registration, nickname, electric, mpg, milesPerKwh, isDefault,
 *    distanceM, tripCount }].
 */
export async function listVehicles() {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT v.id, v.make, v.model, v.registration, v.nickname, v.electric, v.mpg, v.miles_per_kwh,
            v.is_default,
            COALESCE(SUM(json_extract(d.stats, '$.distanceM')), 0) AS distance_m,
            COUNT(DISTINCT d.trip_id) AS trip_count
     FROM vehicles v
     LEFT JOIN drives d ON d.vehicle_id = v.id AND d.status = 'completed'
     GROUP BY v.id
     ORDER BY v.is_default DESC, v.created_at`
  );
  return rows.map((r) => ({
    id: r.id,
    make: r.make ?? '',
    model: r.model ?? '',
    registration: r.registration,
    nickname: r.nickname,
    electric: r.electric === 1,
    mpg: r.mpg,
    milesPerKwh: r.miles_per_kwh,
    isDefault: r.is_default === 1,
    distanceM: r.distance_m,
    tripCount: r.trip_count,
  }));
}

/**
 * Add a vehicle ({ make, model, registration?, nickname?, electric?, mpg?, milesPerKwh? }). The first one
 * becomes the default, and every drive recorded before the Garage existed is
 * put down to it.
 */
export async function addVehicle(fields) {
  const db = await getDb();
  const v = toColumns(fields);
  await db.withTransactionAsync(async () => {
    const any = await db.getFirstAsync('SELECT 1 FROM vehicles LIMIT 1');
    const res = await db.runAsync(
      `INSERT INTO vehicles (name, make, model, registration, nickname, electric, mpg, miles_per_kwh, is_default, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      v.name,
      v.make,
      v.model,
      v.registration,
      v.nickname,
      v.electric,
      v.mpg,
      v.milesPerKwh,
      any ? 0 : 1,
      Date.now()
    );
    if (!any) {
      await db.runAsync(
        'UPDATE drives SET vehicle_id = ? WHERE vehicle_id IS NULL',
        res.lastInsertRowId
      );
    }
  });
}

export async function updateVehicle(id, fields) {
  const db = await getDb();
  const v = toColumns(fields);
  await db.runAsync(
    `UPDATE vehicles SET name = ?, make = ?, model = ?, registration = ?, nickname = ?,
       electric = ?, mpg = ?, miles_per_kwh = ? WHERE id = ?`,
    v.name,
    v.make,
    v.model,
    v.registration,
    v.nickname,
    v.electric,
    v.mpg,
    v.milesPerKwh,
    id
  );
}

/** Put a drive down to another vehicle. */
export async function setDriveVehicle(driveId, vehicleId) {
  const db = await getDb();
  await db.runAsync('UPDATE drives SET vehicle_id = ? WHERE id = ?', vehicleId, driveId);
}

/** Remove a vehicle; its drives keep their trips but no longer name a vehicle. */
export async function deleteVehicle(id) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE drives SET vehicle_id = NULL WHERE vehicle_id = ?', id);
    await db.runAsync('DELETE FROM vehicles WHERE id = ?', id);
    // Keep a default while any vehicle is left.
    await db.runAsync(
      `UPDATE vehicles SET is_default = 1 WHERE id = (SELECT id FROM vehicles ORDER BY created_at LIMIT 1)
       AND NOT EXISTS (SELECT 1 FROM vehicles WHERE is_default = 1)`
    );
  });
}

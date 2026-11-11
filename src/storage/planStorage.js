// Plans: trips being planned, each a list of drives and each drive a list of
// stops, kept in order by `position` (see db.js for the schema and
// utils/plans.js for what the fields mean). A recorded drive points at the
// planned drive it was (drives.plan_drive_id); the plan's trip is found from
// those links, not stored.
import { getDb } from './db';

function rowToStop(row) {
  return {
    id: row.id,
    position: row.position,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    source: row.source,
    roadId: row.road_id,
    reversed: row.reversed === 1,
  };
}

function rowToPlan(row, driveRows, stopRows) {
  return {
    id: row.id,
    name: row.name,
    startDate: row.start_date, // 'YYYY-MM-DD', or null for Someday
    routeId: row.route_id,
    createdAt: row.created_at,
    drives: driveRows
      .filter((d) => d.plan_id === row.id)
      .map((d) => ({
        id: d.id,
        position: d.position,
        start: d.start ? JSON.parse(d.start) : null,
        stops: stopRows.filter((s) => s.plan_drive_id === d.id).map(rowToStop),
      })),
  };
}

/** Every plan with its drives and stops, in order, newest first. */
export async function listPlans() {
  const db = await getDb();
  const [plans, drives, stops] = await Promise.all([
    db.getAllAsync('SELECT * FROM plans ORDER BY created_at DESC'),
    db.getAllAsync('SELECT * FROM plan_drives ORDER BY position'),
    db.getAllAsync('SELECT * FROM plan_stops ORDER BY position'),
  ]);
  return plans.map((row) => rowToPlan(row, drives, stops));
}

/** One plan with its drives and stops, or null. */
export async function getPlan(planId) {
  const db = await getDb();
  const row = await db.getFirstAsync('SELECT * FROM plans WHERE id = ?', planId);
  if (!row) return null;
  const [drives, stops] = await Promise.all([
    db.getAllAsync('SELECT * FROM plan_drives WHERE plan_id = ? ORDER BY position', planId),
    db.getAllAsync(
      `SELECT s.* FROM plan_stops s JOIN plan_drives d ON d.id = s.plan_drive_id
       WHERE d.plan_id = ? ORDER BY s.position`,
      planId
    ),
  ]);
  return rowToPlan(row, drives, stops);
}

async function insertStop(db, planDriveId, position, stop) {
  await db.runAsync(
    `INSERT INTO plan_stops (plan_drive_id, position, name, latitude, longitude, source, road_id, reversed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    planDriveId,
    position,
    stop.name ?? null,
    stop.latitude,
    stop.longitude,
    stop.source ?? 'pin',
    stop.roadId ?? null,
    stop.reversed ? 1 : 0
  );
}

/**
 * Save a new plan: { name, startDate?, routeId?, drives?: [{ start?, stops? }] }
 * (a ready-made route's copy has its drives; a new plan starts with one empty
 * drive). Returns its id.
 */
export async function createPlan({ name, startDate = null, routeId = null, drives = [{}] }) {
  const db = await getDb();
  let planId;
  await db.withTransactionAsync(async () => {
    const { lastInsertRowId } = await db.runAsync(
      'INSERT INTO plans (name, start_date, route_id, created_at) VALUES (?, ?, ?, ?)',
      name,
      startDate,
      routeId,
      Date.now()
    );
    planId = lastInsertRowId;
    for (const [i, drive] of drives.entries()) {
      const added = await db.runAsync(
        'INSERT INTO plan_drives (plan_id, position, start) VALUES (?, ?, ?)',
        planId,
        i,
        drive.start ? JSON.stringify(drive.start) : null
      );
      for (const [j, stop] of (drive.stops ?? []).entries()) {
        await insertStop(db, added.lastInsertRowId, j, stop);
      }
    }
  });
  return planId;
}

export async function renamePlan(planId, name) {
  const db = await getDb();
  await db.runAsync('UPDATE plans SET name = ? WHERE id = ?', name, planId);
}

/** 'YYYY-MM-DD', or null for no date (Someday). */
export async function setPlanStartDate(planId, startDate) {
  const db = await getDb();
  await db.runAsync('UPDATE plans SET start_date = ? WHERE id = ?', startDate, planId);
}

/** Delete a plan with its drives and stops. Recorded drives keep their trips, unlinked. */
export async function deletePlan(planId) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const inPlan = 'SELECT id FROM plan_drives WHERE plan_id = ?';
    await db.runAsync(`UPDATE drives SET plan_drive_id = NULL WHERE plan_drive_id IN (${inPlan})`, planId);
    await db.runAsync(`DELETE FROM plan_stops WHERE plan_drive_id IN (${inPlan})`, planId);
    await db.runAsync('DELETE FROM plan_drives WHERE plan_id = ?', planId);
    await db.runAsync('DELETE FROM plans WHERE id = ?', planId);
  });
}

/** Add an empty drive at the end of a plan (the + tab). Returns its id. */
export async function addPlanDrive(planId) {
  const db = await getDb();
  const { next } = await db.getFirstAsync(
    'SELECT COALESCE(MAX(position) + 1, 0) AS next FROM plan_drives WHERE plan_id = ?',
    planId
  );
  const { lastInsertRowId } = await db.runAsync(
    'INSERT INTO plan_drives (plan_id, position, start) VALUES (?, ?, NULL)',
    planId,
    next
  );
  return lastInsertRowId;
}

/**
 * Delete a planned drive and its stops; the drives after it move up one, and a
 * linked start now follows the drive before. Recorded drives stay, unlinked.
 */
export async function deletePlanDrive(planDriveId) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const drive = await db.getFirstAsync('SELECT * FROM plan_drives WHERE id = ?', planDriveId);
    if (!drive) return;
    await db.runAsync('UPDATE drives SET plan_drive_id = NULL WHERE plan_drive_id = ?', planDriveId);
    await db.runAsync('DELETE FROM plan_stops WHERE plan_drive_id = ?', planDriveId);
    await db.runAsync('DELETE FROM plan_drives WHERE id = ?', planDriveId);
    await db.runAsync(
      'UPDATE plan_drives SET position = position - 1 WHERE plan_id = ? AND position > ?',
      drive.plan_id,
      drive.position
    );
  });
}

/** Where a drive starts: { name, latitude, longitude }, or null to follow the drive before. */
export async function setPlanDriveStart(planDriveId, start) {
  const db = await getDb();
  await db.runAsync(
    'UPDATE plan_drives SET start = ? WHERE id = ?',
    start ? JSON.stringify(start) : null,
    planDriveId
  );
}

/**
 * Add a stop to a planned drive, at the end or at `position`:
 * { name, latitude, longitude, source: 'search' | 'pin', roadId?, reversed? }.
 */
export async function addPlanStop(planDriveId, stop, position = null) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const { count } = await db.getFirstAsync(
      'SELECT COUNT(*) AS count FROM plan_stops WHERE plan_drive_id = ?',
      planDriveId
    );
    const at = position === null ? count : Math.max(0, Math.min(position, count));
    await db.runAsync(
      'UPDATE plan_stops SET position = position + 1 WHERE plan_drive_id = ? AND position >= ?',
      planDriveId,
      at
    );
    await insertStop(db, planDriveId, at, stop);
  });
}

/** Move a stop to `position` within its drive (dragging it in the timeline). */
export async function movePlanStop(stopId, position) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const stop = await db.getFirstAsync('SELECT * FROM plan_stops WHERE id = ?', stopId);
    if (!stop) return;
    const ids = (
      await db.getAllAsync(
        'SELECT id FROM plan_stops WHERE plan_drive_id = ? ORDER BY position',
        stop.plan_drive_id
      )
    ).map((r) => r.id);
    ids.splice(ids.indexOf(stopId), 1);
    ids.splice(Math.max(0, Math.min(position, ids.length)), 0, stopId);
    for (const [i, id] of ids.entries()) {
      await db.runAsync('UPDATE plan_stops SET position = ? WHERE id = ?', i, id);
    }
  });
}

/** Remove a stop; the stops after it move up one. */
export async function deletePlanStop(stopId) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const stop = await db.getFirstAsync('SELECT * FROM plan_stops WHERE id = ?', stopId);
    if (!stop) return;
    await db.runAsync('DELETE FROM plan_stops WHERE id = ?', stopId);
    await db.runAsync(
      'UPDATE plan_stops SET position = position - 1 WHERE plan_drive_id = ? AND position > ?',
      stop.plan_drive_id,
      stop.position
    );
  });
}

/** Link a recorded drive to the planned drive it was, or unlink it (null). */
export async function linkDriveToPlan(driveId, planDriveId) {
  const db = await getDb();
  await db.runAsync('UPDATE drives SET plan_drive_id = ? WHERE id = ?', planDriveId, driveId);
}

/**
 * Which planned drives have been driven, for a plan: a Map of planned drive id
 * to the recorded drives linked to it [{ id, tripId, startedAt }]. The plan's
 * trip is the trip of any of them.
 */
export async function getPlanDrives(planId) {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT d.id, d.trip_id, d.started_at, d.plan_drive_id FROM drives d
     JOIN plan_drives p ON p.id = d.plan_drive_id
     WHERE p.plan_id = ? AND d.status = 'completed' ORDER BY d.started_at`,
    planId
  );
  const driven = new Map();
  for (const r of rows) {
    const list = driven.get(r.plan_drive_id) ?? [];
    list.push({ id: r.id, tripId: r.trip_id, startedAt: r.started_at });
    driven.set(r.plan_drive_id, list);
  }
  return driven;
}

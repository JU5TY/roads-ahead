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
    roundTrip: row.round_trip === 1,
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
  return Promise.all(
    plans.map(async (row) => {
      const plan = rowToPlan(row, drives, stops);
      plan.setOff = await setOffOf(db, plan.drives[0]?.id);
      return plan;
    })
  );
}

/** Where a plan's Drive 1 was recorded setting off, { latitude, longitude }, or null. */
async function setOffOf(db, firstDriveId) {
  const first = firstDriveId
    ? await db.getFirstAsync(
        `SELECT p.latitude, p.longitude FROM drives d JOIN points p ON p.drive_id = d.id
         WHERE d.plan_drive_id = ? ORDER BY d.started_at, p.timestamp LIMIT 1`,
        firstDriveId
      )
    : null;
  return first ? { latitude: first.latitude, longitude: first.longitude } : null;
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
  const plan = rowToPlan(row, drives, stops);
  // For a round trip's way back (utils/plans.js withWayBack).
  plan.setOff = await setOffOf(db, drives[0]?.id);
  return plan;
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
 * Save a new plan: { name, startDate?, routeId?, roundTrip?, drives?: [{ start?, stops? }] }
 * (a copied Iconic Trip has its drives; a new plan starts with one empty
 * drive). Returns its id.
 */
export async function createPlan({ name, startDate = null, routeId = null, roundTrip = false, drives = [{}] }) {
  const db = await getDb();
  let planId;
  await db.withTransactionAsync(async () => {
    const { lastInsertRowId } = await db.runAsync(
      'INSERT INTO plans (name, start_date, route_id, round_trip, created_at) VALUES (?, ?, ?, ?, ?)',
      name,
      startDate,
      routeId,
      roundTrip ? 1 : 0,
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

/** One way, or a round trip (the last drive ends back where Drive 1 starts). */
export async function setPlanRoundTrip(planId, roundTrip) {
  const db = await getDb();
  await db.runAsync('UPDATE plans SET round_trip = ? WHERE id = ?', roundTrip ? 1 : 0, planId);
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

/**
 * Stay overnight at a stop ("Stay overnight here"): its drive ends there and
 * the stops after it become a new drive, next in the plan, starting where you
 * stayed (no start of its own). Recorded drives stay with the first part.
 * Returns the new drive's id.
 */
export async function splitPlanDriveAt(stopId) {
  const db = await getDb();
  let newId = null;
  await db.withTransactionAsync(async () => {
    const stop = await db.getFirstAsync('SELECT * FROM plan_stops WHERE id = ?', stopId);
    if (!stop) return;
    const drive = await db.getFirstAsync('SELECT * FROM plan_drives WHERE id = ?', stop.plan_drive_id);
    await db.runAsync(
      'UPDATE plan_drives SET position = position + 1 WHERE plan_id = ? AND position > ?',
      drive.plan_id,
      drive.position
    );
    const { lastInsertRowId } = await db.runAsync(
      'INSERT INTO plan_drives (plan_id, position, start) VALUES (?, ?, NULL)',
      drive.plan_id,
      drive.position + 1
    );
    newId = lastInsertRowId;
    await db.runAsync(
      'UPDATE plan_stops SET plan_drive_id = ?, position = position - ? WHERE plan_drive_id = ? AND position > ?',
      newId,
      stop.position + 1,
      drive.id,
      stop.position
    );
  });
  return newId;
}

/**
 * Don't stay overnight at the end of a drive ("Don't stay here"): the drive
 * after it joins on, its stops after this one's. A start of its own (after a
 * ferry) is dropped with it, and its recorded drives are linked to this one.
 */
export async function joinPlanDriveWithNext(planDriveId) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const drive = await db.getFirstAsync('SELECT * FROM plan_drives WHERE id = ?', planDriveId);
    if (!drive) return;
    const next = await db.getFirstAsync(
      'SELECT * FROM plan_drives WHERE plan_id = ? AND position = ?',
      drive.plan_id,
      drive.position + 1
    );
    if (!next) return;
    const { count } = await db.getFirstAsync(
      'SELECT COUNT(*) AS count FROM plan_stops WHERE plan_drive_id = ?',
      drive.id
    );
    await db.runAsync(
      'UPDATE plan_stops SET plan_drive_id = ?, position = position + ? WHERE plan_drive_id = ?',
      drive.id,
      count,
      next.id
    );
    await db.runAsync('UPDATE drives SET plan_drive_id = ? WHERE plan_drive_id = ?', drive.id, next.id);
    await db.runAsync('DELETE FROM plan_drives WHERE id = ?', next.id);
    await db.runAsync(
      'UPDATE plan_drives SET position = position - 1 WHERE plan_id = ? AND position > ?',
      drive.plan_id,
      next.position
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

/**
 * Put stops into days, in order, after a drag on All re-formed the days
 * (utils/plans.js regroupDays): `days` is [{ planDriveId, stopIds }].
 */
export async function arrangePlanStops(days) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const { planDriveId, stopIds } of days) {
      for (const [i, id] of stopIds.entries()) {
        await db.runAsync('UPDATE plan_stops SET plan_drive_id = ?, position = ? WHERE id = ?', planDriveId, i, id);
      }
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

/** The ids of every planned drive that has a finished recording (for Done and the Planned tab). */
export async function drivenPlanDriveIds() {
  const db = await getDb();
  const rows = await db.getAllAsync(
    "SELECT DISTINCT plan_drive_id FROM drives WHERE plan_drive_id IS NOT NULL AND status = 'completed'"
  );
  return new Set(rows.map((r) => r.plan_drive_id));
}

/** The plan a planned drive belongs to, and the drive's place in it: { plan, index }, or null. */
export async function getPlanOfDrive(planDriveId) {
  const db = await getDb();
  const row = await db.getFirstAsync('SELECT plan_id FROM plan_drives WHERE id = ?', planDriveId);
  const plan = row ? await getPlan(row.plan_id) : null;
  const index = plan ? plan.drives.findIndex((d) => d.id === planDriveId) : -1;
  return index >= 0 ? { plan, index } : null;
}

/**
 * The trip a plan is being driven as: the trip of its latest recorded drive
 * (finished or still going), or null before its first. A drive moved to
 * another trip takes the plan with it.
 */
export async function getPlanTripId(planId) {
  const db = await getDb();
  const row = await db.getFirstAsync(
    `SELECT d.trip_id FROM drives d JOIN plan_drives p ON p.id = d.plan_drive_id
     WHERE p.plan_id = ? ORDER BY d.started_at DESC LIMIT 1`,
    planId
  );
  return row?.trip_id ?? null;
}

/**
 * When each plan was driven: a Map of plan id → { from, to }, the first start
 * and last end of the finished drives linked to it (for the Done chip).
 */
export async function drivenPlanDates() {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT p.plan_id, MIN(d.started_at) AS first, MAX(d.ended_at) AS last
     FROM drives d JOIN plan_drives p ON p.id = d.plan_drive_id
     WHERE d.status = 'completed' GROUP BY p.plan_id`
  );
  return new Map(rows.map((r) => [r.plan_id, { from: r.first, to: r.last }]));
}

/**
 * The plans some planned drives belong to: a Map of planned drive id →
 * { planId, planName, number } (number: Drive 3 is 3). Unknown ids are left out.
 */
export async function getPlanDriveLinks(planDriveIds) {
  const ids = [...new Set(planDriveIds.filter((id) => id != null))];
  if (!ids.length) return new Map();
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT d.id, d.plan_id, pl.name,
            (SELECT COUNT(*) FROM plan_drives o WHERE o.plan_id = d.plan_id AND o.position < d.position) AS before
     FROM plan_drives d JOIN plans pl ON pl.id = d.plan_id
     WHERE d.id IN (${ids.map(() => '?').join(', ')})`,
    ...ids
  );
  return new Map(rows.map((r) => [r.id, { planId: r.plan_id, planName: r.name, number: r.before + 1 }]));
}

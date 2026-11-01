// Background GPS tracking. This module MUST be imported at app start-up (see
// src/app/_layout.js) so the TaskManager task is defined before the OS wakes the
// app in the background to deliver locations.
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import {
  appendFixes,
  completeDrive,
  createDrive,
  deleteDrive,
  getActiveDrive,
  getDrive,
} from '../storage/driveStorage';
import { checkDriveCountries } from '../storage/countryStorage';
import { checkDriveCrossings } from '../storage/crossingStorage';
import { checkDrive } from '../storage/roadStorage';
import { removeExampleTrip } from '../storage/tripStorage';
import {
  applyFixes,
  finalizeStats,
  isUsableFix,
  pauseStats,
  resumeStats,
  toFix,
} from '../utils/geoMath';
import { ensureDrivePlaces } from './placeService';

export const LOCATION_TRACKING_TASK = 'LOCATION_TRACKING_TASK';

// Android often delivers its last known (possibly minutes-old) location first;
// anything from before the drive started is ignored.
const STALE_FIX_TOLERANCE_MS = 10 * 1000;

const TRACKING_OPTIONS = {
  accuracy: Location.Accuracy.BestForNavigation,
  distanceInterval: 10, // meters
  timeInterval: 2000, // ms, Android only
  // While in the background, deliver fixes in batches instead of waking the
  // app for every one. The metrics engine already handles batches.
  deferredUpdatesInterval: 15000,
  // iOS: keep delivering updates while Google Maps (or anything else) is in front.
  activityType: Location.ActivityType.AutomotiveNavigation,
  pausesUpdatesAutomatically: false,
  showsBackgroundLocationIndicator: true,
  // Android: a foreground service keeps the process alive while minimised.
  // Because tracking starts while the app is open, this (and iOS's background
  // indicator) works with "While using the app" permission alone; "Allow all
  // the time" is never needed.
  foregroundService: {
    notificationTitle: 'Road trip in progress',
    notificationBody: 'Recording your route in the background.',
    notificationColor: '#F2A93B',
    killServiceOnDestroy: false,
  },
};

// Location batches can arrive faster than SQLite writes finish; process them
// strictly in order so stats are never computed from a stale snapshot.
let queue = Promise.resolve();
function enqueue(job) {
  const run = queue.then(job);
  queue = run.catch((err) => console.warn('[locationService]', err));
  return run;
}

/** Whether a fix was taken while the drive was paused (a late batch, or a stale first fix). */
const duringPause = (stats, f) =>
  (stats.pauses ?? []).some(
    (p) => f.timestamp >= p.pausedAt && (p.resumedAt === null || f.timestamp < p.resumedAt)
  );

function handleLocations(locations) {
  return enqueue(async () => {
    const drive = await getActiveDrive();
    if (!drive) return;
    const fixes = locations
      .map(toFix)
      .filter(
        (f) =>
          isUsableFix(f) &&
          f.timestamp >= drive.startedAt - STALE_FIX_TOLERANCE_MS &&
          !duringPause(drive.stats, f)
      );
    if (fixes.length === 0) return;
    const stats = applyFixes(drive.stats, fixes);
    await appendFixes(drive.id, fixes, stats);
  });
}

TaskManager.defineTask(LOCATION_TRACKING_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[locationService] task error', error.message);
    return;
  }
  if (data?.locations?.length) {
    await handleLocations(data.locations);
  }
});

// Foreground fallback for Expo Go, where TaskManager/background location is
// unavailable. Tracks only while the app is open.
let foregroundSubscription = null;

const IS_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/** False in Expo Go (and wherever TaskManager is unavailable): tracking is foreground-only. */
export async function canTrackInBackground() {
  if (IS_EXPO_GO) return false;
  try {
    return await TaskManager.isAvailableAsync();
  } catch {
    return false;
  }
}

function toAccess(res) {
  const precise =
    Platform.OS === 'android' ? res.android?.accuracy === 'fine' : res.ios?.accuracy !== 'reduced';
  return { granted: res.status === 'granted', canAskAgain: res.canAskAgain, precise };
}

/** Current location permission: { granted, canAskAgain, precise }. Never prompts. */
export async function getLocationAccess() {
  return toAccess(await Location.getForegroundPermissionsAsync());
}

/** Show the system location prompt. Resolves to the same shape as getLocationAccess. */
export async function requestLocationAccess() {
  return toAccess(await Location.requestForegroundPermissionsAsync());
}

async function startUpdates() {
  if (!(await getLocationAccess()).granted) {
    throw new Error('Location access is needed to record a trip.');
  }
  if (await canTrackInBackground()) {
    if (!(await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK))) {
      await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK, TRACKING_OPTIONS);
    }
    return { background: true };
  }
  if (!foregroundSubscription) {
    foregroundSubscription = await Location.watchPositionAsync(
      {
        accuracy: TRACKING_OPTIONS.accuracy,
        distanceInterval: TRACKING_OPTIONS.distanceInterval,
        timeInterval: TRACKING_OPTIONS.timeInterval,
      },
      (location) => handleLocations([location])
    );
  }
  return { background: false };
}

async function stopUpdates() {
  foregroundSubscription?.remove();
  foregroundSubscription = null;
  if (
    (await canTrackInBackground()) &&
    (await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK))
  ) {
    await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK);
  }
}

/**
 * Start recording a drive, as part of trip `tripId` or of a new trip when it is
 * null. Location permission must already be granted (see the dashboard's
 * permission sheet). Returns { drive, background }.
 */
export async function startDrive({ tripId = null } = {}) {
  const existing = await getActiveDrive();
  // Start updates before creating the drive so a failure leaves no empty drive behind.
  const { background } = await startUpdates();
  const drive = existing ?? (await createDrive({ tripId }));
  return { drive, background };
}

/**
 * Pause the active drive: location updates stop (and with them the notification)
 * until resumeDrive, and nothing in between counts as driving.
 */
export async function pauseDrive() {
  await stopUpdates();
  return enqueue(async () => {
    const drive = await getActiveDrive();
    if (!drive) return null;
    const stats = pauseStats(drive.stats, Date.now());
    await appendFixes(drive.id, [], stats);
    return { ...drive, stats };
  });
}

/** Resume a paused drive. Call while the app is open (Android starts its service then). */
export async function resumeDrive() {
  const drive = await enqueue(async () => {
    const active = await getActiveDrive();
    if (!active) return null;
    const stats = resumeStats(active.stats, Date.now());
    await appendFixes(active.id, [], stats);
    return { ...active, stats };
  });
  if (drive) await startUpdates();
  return drive;
}

/**
 * Stop recording and close out the active drive, including its crossings, Iconic Roads and countries.
 * Returns the completed drive id.
 */
export async function stopDrive() {
  await stopUpdates();
  // Wait for any in-flight batch so the final stats include it.
  return enqueue(async () => {
    const drive = await getActiveDrive();
    if (!drive) return null;
    const endedAt = Date.now();
    await completeDrive(drive.id, endedAt, finalizeStats(drive.stats));
    // The first recorded drive replaces the example trip new installs start with.
    await removeExampleTrip().catch((err) =>
      console.warn('[locationService] removing the example trip failed', err)
    );
    // Ferry and tunnel crossings first: they redo the stats the checks below build on.
    await checkDriveCrossings(drive.id).catch((err) =>
      console.warn('[locationService] crossings check failed', err)
    );
    // Iconic Roads, before Drive saved opens so it can show them (all offline).
    await checkDrive(drive.id).catch((err) =>
      console.warn('[locationService] Iconic Roads check failed', err)
    );
    // Countries too, before the place lookup so border crossings get names.
    await checkDriveCountries(drive.id).catch((err) =>
      console.warn('[locationService] countries check failed', err)
    );
    // Look up place names now while we're likely online; failures retry later.
    getDrive(drive.id)
      .then((completed) => ensureDrivePlaces(completed, { includeStops: true }))
      .catch((err) => console.warn('[locationService] place lookup failed', err));
    return drive.id;
  });
}

/**
 * Stop recording and throw the active drive away (Record's "Nothing recorded
 * yet"). Its trip goes too if the drive was all it had.
 */
export async function discardDrive() {
  await stopUpdates();
  return enqueue(async () => {
    const drive = await getActiveDrive();
    if (drive) await deleteDrive(drive.id);
  });
}

/**
 * Call on launch: if a drive was left active (app killed, phone rebooted),
 * make sure location updates are running again. Returns { background } or null.
 */
export async function resumeActiveDrive() {
  const drive = await getActiveDrive();
  // Never prompt on launch; if access was revoked the dashboard still shows the drive.
  if (!drive || !(await getLocationAccess()).granted) return null;
  // Paused: Record shows it, but GPS stays off until Resume.
  if (drive.stats.paused) return { background: await canTrackInBackground() };
  return startUpdates();
}

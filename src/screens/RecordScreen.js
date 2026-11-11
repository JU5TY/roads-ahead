import * as Location from 'expo-location';
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, View } from 'react-native';

import PermissionSheet from '../components/PermissionSheet';
import ReadyView from '../components/record/ReadyView';
import RecordingView from '../components/record/RecordingView';
import { showMessage } from '../components/ui/DialogHost';
import { useStyles } from '../hooks/useTheme';
import {
  canTrackInBackground,
  discardDrive,
  getLocationAccess,
  pauseDrive,
  requestLocationAccess,
  resumeDrive,
  startDrive,
  stopDrive,
} from '../services/locationService';
import { getActiveDrive, getDriveRoutePreview } from '../storage/driveStorage';
import { getContinuableTrip, getTrip } from '../storage/tripStorage';
import { liveMetrics } from '../utils/geoMath';
import { CONTINUE_WINDOW_MS, driveNumberFor, tripTitle } from '../utils/tripSummary';

const REFRESH_MS = 1000;
const ROUTE_REFRESH_MS = 10 * 1000;
const ROUTE_POINTS = 400;

/**
 * Record tab: "Ready to go" (ReadyView) until a drive is live, then the
 * full-screen recording view (RecordingView). Owns the active drive (polled from
 * SQLite, which the background task writes), the actions on it and the
 * location-permission flow.
 */
export default function RecordScreen() {
  const styles = useStyles(makeStyles);
  // Tabs stay mounted in the background; only keep the screen on while Record is showing.
  const focused = useIsFocused();
  const [drive, setDrive] = useState(null); // the active drive, if recording
  // { driveId, text }, e.g. "Scotland 2026 · Day 2" for the active drive.
  const [tripLabelFor, setTripLabelFor] = useState(null);
  // { driveId, points }: the live route so far, thinned.
  const [routeFor, setRouteFor] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [foregroundOnly, setForegroundOnly] = useState(false);
  const [sheet, setSheet] = useState(null); // PermissionSheet kind, or null
  const [recent, setRecent] = useState(null); // trip that can be continued, if any
  const [here, setHere] = useState(null); // last known position, for the Ready map

  // Trip chosen before the permission check (null = new trip).
  const chosenTripRef = useRef(null);

  // Expo Go can only record while the app is open; warn while recording there.
  useEffect(() => {
    canTrackInBackground().then((ok) => setForegroundOnly(!ok));
  }, []);

  // The background task writes to SQLite; poll it once a second while visible.
  // Also refresh the trip that Ready offers to continue.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const tick = async () => {
        const active = await getActiveDrive();
        if (!cancelled) {
          setDrive(active);
          setNow(Date.now());
        }
      };
      tick();
      getContinuableTrip(CONTINUE_WINDOW_MS)
        .then((trip) => !cancelled && setRecent(trip))
        .catch(() => {});
      // Centre the Ready map on the phone, without asking for access just for that.
      getLocationAccess()
        .then((access) => (access.granted ? Location.getLastKnownPositionAsync() : null))
        .then(
          (pos) =>
            !cancelled &&
            pos &&
            setHere({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
        )
        .catch(() => {});
      const id = setInterval(tick, REFRESH_MS);
      return () => {
        cancelled = true;
        clearInterval(id);
      };
    }, [])
  );

  // Which trip and day the active drive belongs to.
  const activeId = drive?.id;
  const activeTripId = drive?.tripId;
  const activeStartedAt = drive?.startedAt;
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    getTrip(activeTripId)
      .then((trip) => {
        if (cancelled || !trip) return;
        const number = driveNumberFor(trip.drives, activeStartedAt);
        const name = tripTitle(trip) ?? 'New trip';
        // A trip's first drive is just the trip's name.
        setTripLabelFor({ driveId: activeId, text: number > 1 ? `${name} · Drive ${number}` : name });
      })
      .catch((err) => console.warn('[record] trip label failed', err));
    return () => {
      cancelled = true;
    };
  }, [activeId, activeTripId, activeStartedAt]);

  // The route drawn so far; refreshed less often than the numbers.
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    const load = () =>
      getDriveRoutePreview(activeId, ROUTE_POINTS)
        .then((points) => !cancelled && setRouteFor({ driveId: activeId, points }))
        .catch((err) => console.warn('[record] route failed', err));
    load();
    const id = setInterval(load, ROUTE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [activeId]);

  const run = async (action) => {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      showMessage('Something went wrong', err.message);
    } finally {
      setBusy(false);
    }
  };

  const beginDrive = (tripId) =>
    run(async () => {
      const res = await startDrive({ tripId });
      setDrive(res.drive);
    });

  /** Start recording into `tripId` (null = new trip), once location access is sorted. */
  const startRecording = async (tripId) => {
    chosenTripRef.current = tripId;
    // Explain before (or instead of) the system prompt; start straight away once allowed.
    const access = await getLocationAccess();
    if (!access.granted) return setSheet(access.canAskAgain ? 'ask' : 'blocked');
    if (!access.precise) return setSheet('approximate');
    return beginDrive(tripId);
  };

  const stop = () =>
    run(async () => {
      const driveId = await stopDrive();
      setDrive(null);
      if (driveId) router.push(`/saved/${driveId}`);
    });

  // Nothing recorded: no drive to save, back to Ready.
  const discard = () =>
    run(async () => {
      await discardDrive();
      setDrive(null);
    });

  // Pause stops GPS; the gap is drawn dotted and isn't counted as driving.
  const pause = () =>
    run(async () => {
      const paused = await pauseDrive();
      if (paused) setDrive(paused);
    });
  const resume = () =>
    run(async () => {
      const resumed = await resumeDrive();
      if (resumed) setDrive(resumed);
    });

  const onSheetPrimary = async () => {
    const kind = sheet;
    setSheet(null);
    if (kind !== 'ask') {
      Linking.openSettings();
      return;
    }
    const access = await requestLocationAccess();
    if (!access.granted) {
      // A first "Don't allow" just closes; after that only Settings can help.
      if (!access.canAskAgain) setSheet('blocked');
      return;
    }
    if (!access.precise) return setSheet('approximate');
    return beginDrive(chosenTripRef.current);
  };

  const onSheetSecondary = () => {
    const kind = sheet;
    setSheet(null);
    if (kind === 'approximate') beginDrive(chosenTripRef.current);
  };

  const permissionSheet = (
    <PermissionSheet kind={sheet} onPrimary={onSheetPrimary} onSecondary={onSheetSecondary} />
  );

  if (!drive) {
    return (
      <View style={[styles.screen, styles.ready]}>
        {permissionSheet}
        <ReadyView here={here} recent={recent} now={now} busy={busy} onStart={startRecording} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {permissionSheet}
      <RecordingView
        drive={drive}
        live={liveMetrics(drive, now)}
        route={routeFor && routeFor.driveId === activeId ? routeFor.points : []}
        tripLabel={tripLabelFor && tripLabelFor.driveId === activeId ? tripLabelFor.text : null}
        busy={busy}
        focused={focused}
        foregroundOnly={foregroundOnly}
        onPause={pause}
        onResume={resume}
        onSave={stop}
        onDiscard={discard}
      />
    </View>
  );
}

const makeStyles = (c) => ({
  screen: { flex: 1, backgroundColor: c.screen },
  ready: { backgroundColor: c.background },
});

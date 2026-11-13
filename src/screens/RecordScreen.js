import { router, useFocusEffect, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, View } from 'react-native';

import PermissionSheet from '../components/PermissionSheet';
import PlanCard from '../components/record/PlanCard';
import ReadyView from '../components/record/ReadyView';
import RecordingView from '../components/record/RecordingView';
import { showMessage } from '../components/ui/DialogHost';
import { useSettings } from '../context/SettingsContext';
import { useStyles } from '../hooks/useTheme';
import {
  canTrackInBackground,
  discardDrive,
  getLastPosition,
  getLocationAccess,
  pauseDrive,
  requestLocationAccess,
  resumeDrive,
  startDrive,
  stopDrive,
} from '../services/locationService';
import {
  getActiveDrive,
  getDrivePoints,
  getDrivePointsAfter,
  getDriveRoutePreview,
} from '../storage/driveStorage';
import { getPlanOfDrive, getPlanTripId } from '../storage/planStorage';
import { getContinuableTrip, getTrip } from '../storage/tripStorage';
import { liveMetrics } from '../utils/geoMath';
import { NAV_APPS, NAV_APP_HOME, takesWholeDrive } from '../utils/navLinks';
import { planHandover, planProgress, stopsPassed, withWayBack } from '../utils/plans';
import { CONTINUE_WINDOW_MS, driveNumberFor, tripTitle } from '../utils/tripSummary';

const REFRESH_MS = 1000;
const ROUTE_REFRESH_MS = 10 * 1000;
const ROUTE_POINTS = 400;

/** Open a sat nav link, saying so when the app isn't there. */
const openNav = (url, appName) =>
  Linking.openURL(url).catch(() => showMessage(appName, `Couldn’t open ${appName}.`));

/**
 * Record tab: "Ready to go" (ReadyView) until a drive is live, then the
 * full-screen recording view (RecordingView). Owns the active drive (polled from
 * SQLite, which the background task writes), the actions on it and the
 * location-permission flow. Opened with `planDrive` (a planned drive's id, from
 * a plan's Start drive), it records that drive into the plan's trip and hands it
 * to the sat nav app.
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

  // What to start once location access is sorted: { tripId (null = new trip),
  // tripName?, planDriveId?, nav?: { url, appName } to open once recording }.
  const chosenRef = useRef({ tripId: null });
  const { planDrive } = useLocalSearchParams();
  const { navApp } = useSettings();

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
      getLastPosition().then((pos) => !cancelled && pos && setHere(pos));
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

  // A planned drive's plan, for Record's card: { driveId, plan, index }.
  const [planOf, setPlanOf] = useState(null);
  const activePlanDriveId = drive?.planDriveId;
  useEffect(() => {
    if (!activeId || !activePlanDriveId) return;
    let cancelled = false;
    getPlanOfDrive(activePlanDriveId)
      .then((found) => !cancelled && found && setPlanOf({ driveId: activeId, ...found }))
      .catch((err) => console.warn('[record] plan failed', err));
    return () => {
      cancelled = true;
    };
  }, [activeId, activePlanDriveId]);

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

  // A planned drive's card, from every point (the thinned route can skip a
  // stop): { driveId, plan, progress }. Points are read as they come in.
  const [planCardFor, setPlanCardFor] = useState(null);
  useEffect(() => {
    if (!planOf || planOf.driveId !== activeId) return;
    let cancelled = false;
    const points = [];
    let reading = false; // a slow read isn't overlapped by the next
    const load = async () => {
      if (reading) return;
      reading = true;
      let fresh;
      try {
        fresh = await getDrivePointsAfter(activeId, points.at(-1)?.timestamp ?? -1);
      } finally {
        reading = false;
      }
      if (cancelled || !fresh.length) return;
      points.push(...fresh);
      const { index } = planOf;
      // Loaded as the drive began, so a round trip's first drive sets off from its first point.
      const plan = withWayBack(planOf.plan, points[0]);
      setPlanCardFor({ driveId: activeId, plan, progress: planProgress(plan, index, points) });
    };
    const loadSafely = () => load().catch((err) => console.warn('[record] plan card failed', err));
    loadSafely();
    const id = setInterval(loadSafely, ROUTE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [activeId, planOf]);

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

  const beginDrive = ({ nav, ...chosen }) =>
    run(async () => {
      const res = await startDrive(chosen);
      setDrive(res.drive);
      if (nav) openNav(nav.url, nav.appName);
    });

  /**
   * Start recording, once location access is sorted: into `tripId` (null =
   * new trip), or a planned drive (see chosenRef).
   */
  const startRecording = async (tripId, plan = {}) => {
    chosenRef.current = { tripId, ...plan };
    // Explain before (or instead of) the system prompt; start straight away once allowed.
    const access = await getLocationAccess();
    if (!access.granted) return setSheet(access.canAskAgain ? 'ask' : 'blocked');
    if (!access.precise) return setSheet('approximate');
    return beginDrive(chosenRef.current);
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
    return beginDrive(chosenRef.current);
  };

  const onSheetSecondary = () => {
    const kind = sheet;
    setSheet(null);
    if (kind === 'approximate') beginDrive(chosenRef.current);
  };

  // A plan's Start drive: record it into the plan's trip (made, named after the
  // plan, by its first drive), then open the sat nav. Taken once, then cleared.
  useEffect(() => {
    if (!planDrive) return;
    router.setParams({ planDrive: undefined });
    (async () => {
      const found = await getPlanOfDrive(Number(planDrive));
      if (!found) return;
      if (await getActiveDrive()) {
        showMessage('Already recording', 'Stop the drive you’re recording, then start this one.');
        return;
      }
      const { index } = found;
      const here = await getLastPosition();
      // A round trip that hasn't set off yet comes back to here.
      const plan = withWayBack(found.plan, here);
      const tripId = await getPlanTripId(plan.id);
      const { links, appName } = planHandover(plan, index, { here, app: navApp });
      await startRecording(tripId, {
        tripName: tripId ? null : plan.name,
        planDriveId: plan.drives[index].id,
        nav: links.length ? { url: links[0], appName } : null,
      });
    })().catch((err) => console.warn('[record] plan start failed', err));
    // Only a new `planDrive` starts anything; the rest is read as it is then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planDrive]);

  // Navigate: a planned drive goes back to the sat nav for the stops still
  // ahead (never back to its start); otherwise, or with none left, the app
  // just opens.
  const navigate = async () => {
    const home = () => openNav(NAV_APP_HOME[navApp], NAV_APPS[navApp]);
    try {
      const found = drive?.planDriveId ? await getPlanOfDrive(drive.planDriveId) : null;
      if (!found) return home();
      const plan = withWayBack(found.plan, null);
      const { index } = found;
      const passed = stopsPassed(plan, index, await getDrivePoints(drive.id));
      const { links, appName } = planHandover(plan, index, { here: null, app: navApp, underway: true, passed });
      return links.length ? openNav(links[0], appName) : home();
    } catch (err) {
      console.warn('[record] navigate failed', err);
      return home();
    }
  };

  // On a planned drive, the card: what's next, or where you are and Next leg.
  // Next leg shows where the sat nav needs the next part handed over: Waze
  // (one stop at a time), or a drive too long for one Google Maps link.
  let planCard = null;
  const routePoints = routeFor && routeFor.driveId === activeId ? routeFor.points : [];
  if (planOf && planCardFor && planCardFor.driveId === activeId) {
    const { plan, progress } = planCardFor;
    const whole = planHandover(plan, planOf.index, { here: null, app: navApp });
    planCard = (
      <PlanCard
        progress={progress}
        nextLeg={!takesWholeDrive(navApp) || whole.links.length > 1}
        onNavigate={navigate}
        onNextLeg={navigate}
      />
    );
  }

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
        route={routePoints}
        planCard={planCard}
        tripLabel={tripLabelFor && tripLabelFor.driveId === activeId ? tripLabelFor.text : null}
        busy={busy}
        focused={focused}
        foregroundOnly={foregroundOnly}
        onNavigate={navigate}
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

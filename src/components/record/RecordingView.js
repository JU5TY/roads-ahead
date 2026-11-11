import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, LayoutAnimation, Linking, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSettings } from '../../context/SettingsContext';
import { useStyles, useTheme } from '../../hooks/useTheme';
import { getRecordMapHidden, setRecordMapHidden } from '../../storage/settingsStorage';
import { type } from '../../theme';
import { routeGaps, routeSegments } from '../../utils/crossings';
import { formatDistance, formatDurationShort, speedUnit, toSpeed } from '../../utils/format';
import ConfirmDialog from '../ui/ConfirmDialog';
import { showMessage } from '../ui/DialogHost';
import Icon from '../ui/Icon';
import IconButton from '../ui/IconButton';
import LiveMap from './LiveMap';

const GOOGLE_MAPS_NAV_URL = 'https://www.google.com/maps/dir/?api=1&travelmode=driving';
const BREAK_SOON_MS = 30 * 60 * 1000; // the break bar shows this long before a break is due
// The map eases shorter as the break bar fades in (and back when a stop resets it).
const BREAK_BAR_ANIMATION = LayoutAnimation.create(350, 'easeInEaseOut', 'opacity');

/** Keeps the screen on while mounted (only while a drive is live and Record is showing). */
function KeepScreenOn() {
  useKeepAwake('record');
  return null;
}

const openGoogleMaps = () =>
  Linking.openURL(GOOGLE_MAPS_NAV_URL).catch(() =>
    showMessage('Google Maps', 'Couldn’t open Google Maps.')
  );

/**
 * Record while a drive is live: the map (which can be hidden), status, speed,
 * distance and driving time, the break bar, and Navigate / Pause or Resume / Stop.
 * `live` is liveMetrics(drive), `route` the points drawn so far and `tripLabel`
 * "Scotland 2026 · Drive 2". Stop asks first: Save, or Discard when nothing moved.
 */
export default function RecordingView({
  drive,
  live,
  route,
  tripLabel,
  busy,
  focused,
  foregroundOnly,
  onPause,
  onResume,
  onSave,
  onDiscard,
}) {
  const { units, breakReminderMinutes } = useSettings();
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  // Remembered between drives.
  const [mapHidden, setMapHiddenState] = useState(getRecordMapHidden);
  const setMapHidden = (hidden) => {
    setMapHiddenState(hidden);
    setRecordMapHidden(hidden).catch((err) => console.warn('[record] save failed', err));
  };
  const [confirmingStop, setConfirmingStop] = useState(false);
  const [centreKey, setCentreKey] = useState(0);

  const lastFix = drive.stats.lastFix;
  const position = lastFix ? { latitude: lastFix.latitude, longitude: lastFix.longitude } : null;
  const paused = live.isPaused;
  const status = paused
    ? 'Paused'
    : !live.hasFix
      ? 'Waiting for GPS'
      : live.waitingToSetOff
        ? 'Waiting to set off'
        : live.isAutoPaused
          ? 'Stopped'
          : 'Recording';
  const speed = paused ? 0 : Math.round(toSpeed(live.currentSpeedMps, units));
  const distance = formatDistance(live.distanceM, units);
  const driving = formatDurationShort(live.drivingMs);
  // Break bar: hidden until the last BREAK_SOON_MS before a break is due, then
  // counts down in blue; once due it fills orange and counts up.
  const breakDueMs = breakReminderMinutes * 60000;
  const breakSoon = breakReminderMinutes > 0 && live.stintMs >= breakDueMs - BREAK_SOON_MS;
  const breakDue = breakSoon && live.stintMs >= breakDueMs;
  const overdueMs = live.stintMs - breakDueMs;
  // When the bar comes or goes, animate the next layout so the map doesn't jump.
  const [breakShown, setBreakShown] = useState(breakSoon);
  if (breakShown !== breakSoon) {
    LayoutAnimation.configureNext(BREAK_BAR_ANIMATION);
    setBreakShown(breakSoon);
  }
  // Trips shows the "Recording · 1h 12m" banner to come back.
  const minimise = () => router.navigate('/trips');
  const closeDialog = (then) => () => {
    setConfirmingStop(false);
    then();
  };

  return (
    <>
      {live.distanceM > 0 ? (
        <ConfirmDialog
          visible={confirmingStop}
          title="Save this drive?"
          highlight={`${distance} · ${driving}`}
          message="Drive again within 3 days to continue this trip."
          confirmLabel="Save"
          onCancel={() => setConfirmingStop(false)}
          onConfirm={closeDialog(onSave)}
        />
      ) : (
        <ConfirmDialog
          visible={confirmingStop}
          title="Nothing recorded yet"
          message="You haven’t moved yet, so there’s no drive to save."
          confirmLabel="Discard"
          destructive
          onCancel={() => setConfirmingStop(false)}
          onConfirm={closeDialog(onDiscard)}
        />
      )}
      {/* Mid-drive the phone is usually in a mount: don't let the screen sleep. */}
      {focused ? <KeepScreenOn /> : null}
      {!mapHidden ? (
        <View style={[styles.map, { flexBasis: 320 + insets.top }]}>
          <LiveMap
            segments={routeSegments('live', route, routeGaps(drive), c.accent)}
            position={position}
            centreKey={centreKey}
            follow
          />
          <IconButton
            icon="expand_more"
            iconSize={26}
            variant="floating"
            accessibilityLabel="Minimise, keep recording"
            onPress={minimise}
            style={[styles.mapButtonLeft, { top: insets.top + 12 }]}
          />
          <IconButton
            icon="my_location"
            variant="floating"
            accessibilityLabel="Centre on my position"
            onPress={() => setCentreKey((k) => k + 1)}
            style={[styles.mapButtonRight, { top: insets.top + 12 }]}
          />
          <IconButton
            icon="visibility_off"
            variant="floating"
            accessibilityLabel="Hide map"
            onPress={() => setMapHidden(true)}
            style={[styles.mapButtonRight, styles.mapButtonBottom]}
          />
        </View>
      ) : null}

      <View
        style={[
          styles.body,
          {
            paddingTop: mapHidden ? insets.top + 20 : 20,
            paddingBottom: insets.bottom + 28,
          },
        ]}
      >
        <View style={styles.statusRow}>
          {paused ? (
            <View style={[styles.statusPill, styles.statusPillPaused]}>
              <Icon name="pause" filled size={18} color={c.onWarningContainer} />
              <Text style={[type.button, styles.onWarning]}>Paused</Text>
            </View>
          ) : (
            <View style={[styles.statusPill, status !== 'Recording' && styles.statusPillIdle]}>
              <View style={[styles.statusDot, status !== 'Recording' && styles.statusDotIdle]} />
              <Text style={[type.button, styles.statusText, status !== 'Recording' && styles.text]}>
                {status}
              </Text>
            </View>
          )}
          <Text style={[type.body, styles.muted, styles.statusTrip]} numberOfLines={1}>
            {tripLabel ?? ''}
          </Text>
          {mapHidden ? (
            <>
              <IconButton
                icon="map"
                variant="record"
                accessibilityLabel="Show map"
                onPress={() => setMapHidden(false)}
                style={styles.rowButton}
              />
              <IconButton
                icon="expand_more"
                variant="record"
                iconSize={26}
                accessibilityLabel="Minimise, keep recording"
                onPress={minimise}
                style={[styles.rowButton, styles.rowButtonLast]}
              />
            </>
          ) : null}
        </View>

        {foregroundOnly ? (
          <Text style={[type.small, styles.muted, styles.expoGo]}>
            Expo Go records only while the app is open. Use a development build for background
            tracking.
          </Text>
        ) : null}

        <View
          style={[styles.hero, mapHidden && styles.heroHidden]}
          accessible
          accessibilityLabel={`Speed ${speed} ${speedUnit(units)}`}
        >
          <Text style={mapHidden ? styles.heroBig : styles.heroValue} numberOfLines={1}>
            {speed}
          </Text>
          <Text style={mapHidden ? styles.heroBigUnit : styles.heroUnit}>{speedUnit(units)}</Text>
        </View>

        <View style={styles.liveStats}>
          <View style={styles.liveStat} accessible accessibilityLabel={`Distance ${distance}`}>
            <Text style={[type.stat, styles.liveValue]} numberOfLines={1} adjustsFontSizeToFit>
              {distance}
            </Text>
            <Text style={styles.liveLabel}>distance</Text>
          </View>
          <View style={styles.liveDivider} />
          <View style={styles.liveStat} accessible accessibilityLabel={`Driving ${driving}`}>
            <Text style={[type.stat, styles.liveValue]} numberOfLines={1} adjustsFontSizeToFit>
              {driving}
            </Text>
            <Text style={styles.liveLabel}>driving</Text>
          </View>
        </View>

        {breakSoon ? (
          <View style={styles.breakBox}>
            <View style={styles.breakTitle}>
              <Icon
                name="local_cafe"
                filled={breakDue}
                size={20}
                color={breakDue ? c.breakDue : c.text}
              />
              <Text style={[type.bodyStrong, styles.text, styles.flex]}>
                {!breakDue
                  ? `Break in ${formatDurationShort(breakDueMs - live.stintMs)}`
                  : overdueMs < 60000
                    ? 'Break due now'
                    : `Break ${formatDurationShort(overdueMs)} overdue`}
              </Text>
            </View>
            <View style={styles.breakTrack}>
              <View
                style={[
                  styles.breakFill,
                  breakDue && styles.breakFillDue,
                  { width: `${Math.min(100, (live.stintMs / breakDueMs) * 100)}%` },
                ]}
              />
            </View>
          </View>
        ) : null}

        <View style={styles.flex} />
        <View style={styles.controls}>
          <IconButton
            icon="near_me"
            variant="record"
            size={64}
            iconSize={28}
            label="Navigate"
            labelStyle={styles.controlLabel}
            onPress={openGoogleMaps}
            style={styles.sideControl}
          />
          {busy ? (
            <ActivityIndicator color={c.accent} style={styles.centreBusy} />
          ) : paused ? (
            <IconButton
              icon="play_arrow"
              filled
              variant="filled"
              size={80}
              iconSize={44}
              label="Resume"
              labelStyle={styles.controlLabel}
              style={styles.flex}
              onPress={onResume}
            />
          ) : (
            <IconButton
              icon="pause"
              filled
              variant="pause"
              size={80}
              iconSize={40}
              label="Pause"
              labelStyle={styles.controlLabel}
              style={styles.flex}
              onPress={onPause}
            />
          )}
          <IconButton
            icon="stop"
            filled
            variant="stop"
            size={64}
            iconSize={32}
            label="Stop"
            labelStyle={styles.controlLabel}
            accessibilityLabel="Stop recording"
            onPress={() => setConfirmingStop(true)}
            style={styles.sideControl}
          />
        </View>
      </View>
    </>
  );
}

const makeStyles = (c) => ({
  // Design height, but the map gives way on shorter screens so the controls keep their spacing.
  map: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 180,
    borderBottomWidth: 1,
    borderBottomColor: c.outline,
    backgroundColor: c.card,
  },
  mapButtonLeft: { position: 'absolute', left: 12 },
  mapButtonRight: { position: 'absolute', right: 12 },
  mapButtonBottom: { bottom: 12 },
  flex: { flex: 1, minWidth: 0 },
  text: { color: c.text },
  muted: { color: c.textMuted },
  body: {
    flexGrow: 1,
    flexShrink: 0,
    paddingHorizontal: 20,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 24,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 32,
    paddingLeft: 12,
    paddingRight: 14,
    borderRadius: 16,
    backgroundColor: c.recordingPill,
  },
  statusPillIdle: { backgroundColor: c.track },
  statusPillPaused: { gap: 6, paddingLeft: 10, backgroundColor: c.warningContainer },
  statusText: { color: c.onRecordingPill },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.stop },
  statusDotIdle: { backgroundColor: c.textMuted },
  statusTrip: { flex: 1 },
  expoGo: { marginHorizontal: 4 },
  hero: { alignItems: 'center', marginTop: 28 },
  heroHidden: { marginTop: 64 },
  heroValue: {
    fontFamily: type.stat.fontFamily,
    fontSize: 72,
    lineHeight: 72,
    letterSpacing: -2,
    color: c.textStrong,
  },
  heroUnit: { ...type.bodyStrong, color: c.textMuted },
  heroBig: {
    fontFamily: type.stat.fontFamily,
    fontSize: 120,
    lineHeight: 120,
    letterSpacing: -2,
    color: c.textStrong,
  },
  heroBigUnit: { ...type.statUnit, fontSize: 20, color: c.textMuted },
  liveStats: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  liveStat: { flex: 1, alignItems: 'center' },
  liveValue: { color: c.textStrong },
  liveLabel: { ...type.bodySmall, color: c.textMuted },
  liveDivider: { width: 1, height: 40, backgroundColor: c.outline },
  breakBox: { gap: 10, marginTop: 32 },
  breakTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  onWarning: { color: c.onWarningContainer },
  breakTrack: { height: 8, borderRadius: 4, backgroundColor: c.recordControl, overflow: 'hidden' },
  breakFill: { height: 8, borderRadius: 4, backgroundColor: c.accent },
  breakFillDue: { backgroundColor: c.breakDue },
  controls: { flexDirection: 'row', alignItems: 'flex-start' },
  // Centres the 64 circles on the 80 one.
  sideControl: { flex: 1, paddingTop: 8 },
  controlLabel: { fontSize: 15, lineHeight: 20 },
  rowButton: { marginVertical: -8 },
  rowButtonLast: { marginRight: -8 },
  centreBusy: { flex: 1, height: 108 },
});

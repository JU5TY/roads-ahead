import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, LayoutAnimation, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSettings } from '../../context/SettingsContext';
import { useStyles, useTheme } from '../../hooks/useTheme';
import { pressedOpacity, type } from '../../theme';
import {
  distanceParts,
  formatDistance,
  formatDurationShort,
  speedUnit,
  toSpeed,
} from '../../utils/format';
import ConfirmDialog from '../ui/ConfirmDialog';
import Icon from '../ui/Icon';
import IconButton from '../ui/IconButton';

const BREAK_SOON_MS = 30 * 60 * 1000; // the break bar shows this long before a break is due
// The break bar fades in (and out when a stop resets it).
const BREAK_BAR_ANIMATION = LayoutAnimation.create(350, 'easeInEaseOut', 'opacity');

/** Keeps the screen on while mounted (only while a drive is live and Record is showing). */
function KeepScreenOn() {
  useKeepAwake('record');
  return null;
}

/**
 * One of the big numbers, its units small and grey with a space before each, as
 * in the stat cards: "48.7 mi", "1 h 42 m". `parts` alternates number, unit.
 */
function LiveValue({ parts }) {
  const styles = useStyles(makeStyles);
  return (
    <Text style={styles.liveValue} numberOfLines={1} adjustsFontSizeToFit>
      {parts.map((part, i) =>
        i % 2 ? (
          <Text key={i} style={styles.liveUnit}>
            {` ${part}`}
          </Text>
        ) : (
          part
        )
      )}
    </Text>
  );
}

/** One of Record's wide controls: a pill with an icon and a word. */
function Control({ icon, label, bg, fg, tall = false, onPress, accessibilityLabel, style }) {
  const styles = useStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.control,
        tall && styles.controlTall,
        { backgroundColor: bg },
        pressed && styles.pressed,
        style,
      ]}
    >
      <Icon name={icon} filled={tall} size={tall ? 32 : 24} color={fg} />
      <Text style={[tall ? styles.controlLabelTall : type.bodyStrong, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Record while a drive is live, kept simple as the sat nav is usually on screen:
 * status, distance and driving time, speed, the break bar, and Navigate over
 * Pause or Resume / Stop. No map: the route shows on Drive saved and the trip.
 * `live` is liveMetrics(drive) and `tripLabel` "Scotland 2026 · Drive 2". Stop
 * asks first: Save, or Discard when nothing moved.
 * Navigate (onNavigate) opens the sat nav app. `planCard` (a planned drive's
 * PlanCard) sits under the speed.
 */
export default function RecordingView({
  live,
  tripLabel,
  busy,
  focused,
  foregroundOnly,
  planCard,
  onNavigate,
  onPause,
  onResume,
  onSave,
  onDiscard,
}) {
  const { units, breakReminderMinutes } = useSettings();
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const [confirmingStop, setConfirmingStop] = useState(false);

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
  const distanceSplit = distanceParts(live.distanceM, units);
  // "1h 42m" -> ['1', 'h', ' 42', 'm']
  const drivingSplit = driving.split(/([hm])/).filter(Boolean);
  // Break bar: hidden until the last BREAK_SOON_MS before a break is due, then
  // counts down in blue; once due it fills orange and counts up.
  const breakDueMs = breakReminderMinutes * 60000;
  const breakSoon = breakReminderMinutes > 0 && live.stintMs >= breakDueMs - BREAK_SOON_MS;
  const breakDue = breakSoon && live.stintMs >= breakDueMs;
  const overdueMs = live.stintMs - breakDueMs;
  // When the bar comes or goes, animate the next layout so it doesn't jump.
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
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.body, { paddingTop: insets.top + 20 }]}
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
          <IconButton
            icon="expand_more"
            variant="record"
            iconSize={26}
            accessibilityLabel="Minimise, keep recording"
            onPress={minimise}
            style={styles.rowButton}
          />
        </View>

        {foregroundOnly ? (
          <Text style={[type.small, styles.muted, styles.expoGo]}>
            Expo Go records only while the app is open. Use a development build for background
            tracking.
          </Text>
        ) : null}

        <View style={styles.liveStats}>
          <View style={styles.liveStat} accessible accessibilityLabel={`Distance ${distance}`}>
            <LiveValue parts={[distanceSplit.value, distanceSplit.unit]} />
            <Text style={styles.liveLabel}>Distance</Text>
          </View>
          <View style={styles.liveDivider} />
          <View style={styles.liveStat} accessible accessibilityLabel={`Driving time ${driving}`}>
            <LiveValue parts={drivingSplit} />
            <Text style={styles.liveLabel}>Driving time</Text>
          </View>
        </View>

        <View
          style={styles.speed}
          accessible
          accessibilityLabel={`Speed ${speed} ${speedUnit(units)}`}
        >
          <Text style={styles.speedValue}>{speed}</Text>
          <Text style={[type.body, styles.muted]}>{speedUnit(units)}</Text>
        </View>

        {planCard}

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
      </ScrollView>

      <View style={[styles.controls, { paddingBottom: insets.bottom + 28 }]}>
        <Control
          icon="near_me"
          label="Navigate"
          bg={c.recordControl}
          fg={c.onRecordControl}
          onPress={onNavigate}
        />
        <View style={styles.controlRow}>
          {busy ? (
            <ActivityIndicator color={c.accent} style={styles.busy} />
          ) : paused ? (
            <Control
              icon="play_arrow"
              label="Resume"
              bg={c.accent}
              fg={c.onAccent}
              tall
              onPress={onResume}
              style={styles.flex}
            />
          ) : (
            <Control
              icon="pause"
              label="Pause"
              bg={c.textStrong}
              fg={c.screen}
              tall
              onPress={onPause}
              style={styles.flex}
            />
          )}
          <Control
            icon="stop"
            label="Stop"
            bg={c.stop}
            fg={c.onStop}
            tall
            accessibilityLabel="Stop recording"
            onPress={() => setConfirmingStop(true)}
            style={styles.flex}
          />
        </View>
      </View>
    </>
  );
}

const makeStyles = (c) => ({
  flex: { flex: 1, minWidth: 0 },
  text: { color: c.text },
  muted: { color: c.textMuted },
  body: { paddingHorizontal: 20, paddingBottom: 24 },
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
  expoGo: { marginTop: 12, marginHorizontal: 4 },
  liveStats: { flexDirection: 'row', alignItems: 'center', marginTop: 56 },
  liveStat: { flex: 1, alignItems: 'center' },
  liveValue: {
    fontFamily: type.stat.fontFamily,
    fontSize: 44,
    lineHeight: 52,
    letterSpacing: -1,
    color: c.textStrong,
  },
  liveUnit: { fontFamily: type.statUnit.fontFamily, fontSize: 22, letterSpacing: 0, color: c.textMuted },
  liveLabel: { ...type.body, color: c.textMuted },
  liveDivider: { width: 1, height: 56, backgroundColor: c.outline },
  speed: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 20,
  },
  speedValue: { fontFamily: type.stat.fontFamily, fontSize: 20, lineHeight: 26, color: c.textStrong },
  breakBox: { gap: 10, marginTop: 36, paddingHorizontal: 4 },
  breakTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  onWarning: { color: c.onWarningContainer },
  breakTrack: { height: 8, borderRadius: 4, backgroundColor: c.recordControl, overflow: 'hidden' },
  breakFill: { height: 8, borderRadius: 4, backgroundColor: c.accent },
  breakFillDue: { backgroundColor: c.breakDue },
  controls: { gap: 12, paddingHorizontal: 20, paddingTop: 12 },
  controlRow: { flexDirection: 'row', gap: 12 },
  // Navigate 56 tall; Pause, Resume and Stop 72, sharing the row.
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 56,
    borderRadius: 28,
  },
  controlTall: { height: 72, borderRadius: 36 },
  controlLabelTall: { ...type.button, fontSize: 18, lineHeight: 24 },
  pressed: { opacity: pressedOpacity },
  rowButton: { marginVertical: -8, marginRight: -8 },
  busy: { flex: 1, height: 72 },
});

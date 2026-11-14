import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ActionSheet from '../components/ActionSheet';
import { showMessage } from '../components/ui/DialogHost';
import DetailLayout from '../components/detail/DetailLayout';
import FloatingButton from '../components/ui/FloatingButton';
import RouteMap from '../components/RouteMap';
import Icon from '../components/ui/Icon';
import InfoNote from '../components/ui/InfoNote';
import ListRow from '../components/ui/ListRow';
import SectionHeader from '../components/ui/SectionHeader';
import StatRow from '../components/ui/StatRow';
import StatusCard from '../components/roads/StatusCard';
import { useSettings } from '../context/SettingsContext';
import { useHere } from '../hooks/useHere';
import { useStyles, useTheme } from '../hooks/useTheme';
import { getRoadCompletions } from '../storage/roadStorage';
import { addPlanStop, createPlan, drivenPlanDriveIds, getPlan, listPlans } from '../storage/planStorage';
import { getTrip } from '../storage/tripStorage';
import { floating, pressedOpacity, radius, type } from '../theme';
import { distanceParts, elevationParts, formatLongDate, formatShortDate } from '../utils/format';
import { bendsLabel, completedLabel, getRoad } from '../utils/iconicRoads';
import { addPosition, dateOf, groupPlans, mapPlanOf, roadStop } from '../utils/plans';
import { driveNumberFor, tripTitle } from '../utils/tripSummary';

const NOTE = 'Iconic Roads are never timed. Drive them at your own pace.';

/** One drive that completed the road, with its trip and day. */
function DriveRow({ item, isLast }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <Pressable
      // The trip, with this drive picked.
      onPress={() => router.push(`/trips/${item.tripId}?drive=${item.driveId}`)}
      accessibilityRole="link"
      style={({ pressed }) => [
        styles.driveRow,
        !isLast && styles.rowDivider,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.badge}>
        <Icon name="landscape" filled size={22} color={c.onRoadContainer} />
      </View>
      <View style={styles.flex}>
        <Text style={[type.bodyStrong, styles.text]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[type.small, styles.muted]} numberOfLines={1}>
          {formatLongDate(item.driveStartedAt)} · {timesLabel(item.count)}
        </Text>
      </View>
      <Icon name="chevron_right" size={24} color={c.textMuted} />
    </Pressable>
  );
}

/** "14 May 2027 · 3 days", or "2 days" for a plan with no date: a plan's row in the Plan sheet. */
function planDetail(plan) {
  const n = plan.drives.length;
  const days = `${n} ${n === 1 ? 'day' : 'days'}`;
  if (!plan.startDate) return days;
  const date = dateOf(plan.startDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  return `${date} · ${days}`;
}

/**
 * An Iconic Road: its line, facts, how often it's been completed, and the drives
 * that did. The floating Plan adds it to a new plan, or the last day of one
 * still to drive (not a copied Iconic Trip, which can't be changed).
 */
export default function RoadScreen() {
  const { id } = useLocalSearchParams();
  const road = getRoad(id);
  const { units } = useSettings();
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const [drives, setDrives] = useState(null); // [{ driveId, tripId, title, count, ... }]
  const [summary, setSummary] = useState({ count: 0, first: null, last: null });
  const [plans, setPlans] = useState(null); // the Plan sheet's plans while it's open, else null
  const { here } = useHere();
  const insets = useSafeAreaInsets();

  useFocusEffect(
    useCallback(() => {
      if (!road) return undefined;
      let cancelled = false;
      (async () => {
        const completions = await getRoadCompletions(road.id); // newest first
        const trips = new Map();
        for (const tid of new Set(completions.map((x) => x.tripId)))
          trips.set(tid, await getTrip(tid));
        const byDrive = new Map();
        for (const x of completions) {
          const entry = byDrive.get(x.driveId) ?? { ...x, count: 0 };
          entry.count += 1;
          byDrive.set(x.driveId, entry);
        }
        const rows = [...byDrive.values()].map((x) => {
          const trip = trips.get(x.tripId);
          const number = driveNumberFor(trip?.drives ?? [], x.driveStartedAt);
          const name = trip ? tripTitle(trip) : null;
          return { ...x, title: name ? `${name} · Drive ${number}` : `Drive ${number}` };
        });
        if (cancelled) return;
        setDrives(rows);
        setSummary({
          count: completions.length,
          first: completions.at(-1)?.completedAt ?? null,
          last: completions[0]?.completedAt ?? null,
        });
      })().catch((err) => console.warn('[road] load failed', err));
      return () => {
        cancelled = true;
      };
    }, [road])
  );

  const line = useMemo(
    () => (road ? road.line.map(([latitude, longitude]) => ({ latitude, longitude })) : []),
    [road]
  );

  if (!road) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={[type.body, styles.muted]}>This road is no longer in the list.</Text>
      </View>
    );
  }

  const length = distanceParts(road.lengthM, units);
  const highest = elevationParts(road.highestM, units);
  const climb = elevationParts(road.climbM, units);
  const loop = road.from === road.to;
  const navigate = () => {
    const [lat, lng] = road.line[0];
    Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
    ).catch(() => showMessage('Google Maps', 'Couldn’t open Google Maps.'));
  };

  // The plans it can go in: still to drive, and not a copied Iconic Trip.
  const openPlans = async () => {
    try {
      const [all, driven] = await Promise.all([listPlans(), drivenPlanDriveIds()]);
      const { comingUp, someday } = groupPlans(all, driven);
      setPlans([...comingUp, ...someday].filter((p) => !p.routeId));
    } catch (err) {
      console.warn('[road] plans failed', err);
    }
  };
  const addTo = async (planId) => {
    setPlans(null);
    try {
      let id = planId;
      if (id == null) {
        // A new plan named after the road, Day 1 from wherever the phone is.
        const plan = { drives: [{ start: null, stops: [] }] };
        const stop = roadStop(mapPlanOf(plan, here), 0, road);
        id = await createPlan({ name: road.name, drives: [{ stops: [stop] }] });
      } else {
        const plan = await getPlan(id);
        const last = plan.drives.length - 1;
        await addPlanStop(plan.drives[last].id, roadStop(plan, last, road), addPosition(plan, last));
      }
      router.push(`/plans/${id}`);
    } catch (err) {
      console.warn('[road] add to plan failed', err);
    }
  };

  const map = (
    <RouteMap
      flat
      segments={[{ key: 'road', coordinates: line, color: c.accent }]}
      markers={[
        { key: 'start', coordinate: line[0], title: road.from, color: c.start },
        { key: 'end', coordinate: line.at(-1), title: road.to, color: c.finish },
      ]}
    />
  );

  // Length and Highest point on every road; the rest is in Details, Corners
  // taking Bends' place where they're counted (the Ring).
  const steepest = road.steepestPct ? `${road.steepestPct}%` : null;
  const stats = [
    { icon: 'straighten', ...length, label: 'Length' },
    { icon: 'altitude', ...highest, label: 'Highest point' },
  ];
  // [icon, title, value]
  const details = [
    ['trending_up', 'Climb', `${climb.value} ${climb.unit}`],
    steepest && ['show_chart', 'Steepest', steepest],
    road.corners
      ? ['turn_sharp_right', 'Corners', String(road.corners)]
      : ['turn_sharp_right', 'Bends', bendsLabel(road)],
    ['swap_horiz', 'Road type', road.roadType],
  ].filter(Boolean);

  return (
    <DetailLayout
      map={map}
      mapHeight={360}
      actions={[{ icon: 'near_me', label: 'Navigate to start', onPress: navigate }]}
      floating={
        <FloatingButton
          icon="bookmark"
          iconColor={c.accent}
          label="Plan"
          accessibilityLabel={`Add ${road.name} to a plan`}
          onPress={openPlans}
          style={{ bottom: insets.bottom + floating.recordPill.lift }}
        />
      }
    >
      <ActionSheet
        visible={plans != null}
        message={`Add ${road.name} to`}
        actions={[
          { key: 'new', icon: 'add', label: 'A new plan', onPress: () => addTo(null) },
          ...(plans ?? []).map((p) => ({
            key: String(p.id),
            icon: 'bookmark',
            label: p.name,
            detail: planDetail(p),
            onPress: () => addTo(p.id),
          })),
        ]}
        onClose={() => setPlans(null)}
      />
      <Text style={[type.kicker, styles.kicker]}>
        {`${road.region} · ${road.country}`.toUpperCase()}
      </Text>
      <Text style={[type.title, styles.title]}>{road.name}</Text>
      <Text style={[type.body, styles.muted, styles.subtitle]}>
        {road.routeLabel ?? (loop ? `Loop from ${road.from}` : `${road.from} → ${road.to}`)}
      </Text>

      <StatusCard
        done={summary.count > 0}
        icon="landscape"
        title={summary.count > 0 ? completedLabel(summary.count) : 'Not completed yet'}
        detail={
          summary.count > 1
            ? `First ${formatShortDate(summary.first)} · last ${formatShortDate(summary.last)}`
            : summary.count
              ? formatShortDate(summary.last)
              : loop
                ? 'Drive the full lap to complete it'
                : 'Drive the full road to complete it'
        }
      />

      <StatRow style={styles.stats} stats={stats} />

      <SectionHeader title="About" style={styles.aboutHeader} />
      <Text style={[type.lead, styles.muted, styles.blurb]}>{road.blurb}</Text>

      <SectionHeader title="Details" />
      <View style={styles.group}>
        {details.map(([icon, title, value], i) => (
          <ListRow
            key={title}
            icon={icon}
            title={title}
            value={value}
            strongValue
            dense
            divider={i < details.length - 1}
          />
        ))}
      </View>

      {drives?.length ? (
        <>
          <SectionHeader title="Your drives" />
          <View style={styles.group}>
            {drives.map((item, i) => (
              <DriveRow key={item.driveId} item={item} isLast={i === drives.length - 1} />
            ))}
          </View>
        </>
      ) : null}

      <InfoNote text={NOTE} />
    </DetailLayout>
  );
}

/** "completed", "completed twice", "completed 3 times" */
const timesLabel = (n) =>
  n === 1 ? 'completed' : n === 2 ? 'completed twice' : `completed ${n} times`;

const makeStyles = (c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  kicker: { color: c.accent, marginHorizontal: 4 },
  title: { color: c.text, marginTop: 4, marginHorizontal: 4 },
  subtitle: { marginTop: 2, marginHorizontal: 4 },
  text: { color: c.text },
  muted: { color: c.textMuted },
  stats: { marginTop: 20 },
  blurb: { marginHorizontal: 4 },
  group: {
    paddingHorizontal: 12,
    borderRadius: radius.card,
    backgroundColor: c.card,
    ...c.cardShadow,
  },
  driveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 64,
    paddingHorizontal: 4,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: c.divider },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.roadContainer,
  },
  flex: { flex: 1, minWidth: 0 },
  aboutHeader: { marginBottom: 8 },
  pressed: { opacity: pressedOpacity },
});

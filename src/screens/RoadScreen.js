import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { showMessage } from '../components/ui/DialogHost';
import DetailLayout from '../components/detail/DetailLayout';
import RouteMap from '../components/RouteMap';
import Icon from '../components/ui/Icon';
import ListRow from '../components/ui/ListRow';
import SectionHeader from '../components/ui/SectionHeader';
import StatRow from '../components/ui/StatRow';
import { useSettings } from '../context/SettingsContext';
import { useStyles, useTheme } from '../hooks/useTheme';
import { getRoadCompletions } from '../storage/roadStorage';
import { getTrip } from '../storage/tripStorage';
import { type } from '../theme';
import { distanceParts, elevationParts, formatLongDate, formatShortDate } from '../utils/format';
import { bendsLabel, completedLabel, getRoad } from '../utils/iconicRoads';
import { dayNumberFor, groupIntoDays, tripTitle } from '../utils/tripSummary';

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
        <Icon name="verified" size={22} color={c.onRoadContainer} />
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

/** An Iconic Road: its line, facts, how often it's been completed, and the drives that did. */
export default function RoadScreen() {
  const { id } = useLocalSearchParams();
  const road = getRoad(id);
  const { units } = useSettings();
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const [drives, setDrives] = useState(null); // [{ driveId, tripId, title, dayNumber, multiDay, count, ... }]
  const [summary, setSummary] = useState({ count: 0, first: null, last: null });

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
          const earlier = trip ? trip.drives.filter((d) => d.startedAt < x.driveStartedAt) : [];
          const dayNumber = dayNumberFor(earlier, x.driveStartedAt);
          const name = trip ? tripTitle(trip) : null;
          return {
            ...x,
            dayNumber,
            multiDay: trip ? groupIntoDays(trip.drives).length > 1 : false,
            title: name ? `${name} · Day ${dayNumber}` : `Day ${dayNumber}`,
          };
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

  // Third stat: corners (the Ring), else steepest, else climb. Details then show
  // what didn't fit: climb unless it's the third stat, steepest when corners
  // took its place, otherwise how twisty.
  const steepest = road.steepestPct ? `${road.steepestPct}%` : null;
  const climbIsStat = !road.corners && !steepest;
  // [icon, value, unit, label]
  const third = road.corners
    ? ['turn_sharp_right', String(road.corners), null, 'Corners']
    : steepest
      ? ['show_chart', String(road.steepestPct), '%', 'Steepest']
      : ['trending_up', climb.value, climb.unit, 'Climb'];
  const stats = [
    ['straighten', length.value, length.unit, 'Length'],
    ['landscape', highest.value, highest.unit, 'Highest'],
    third,
  ];
  const details = [
    !climbIsStat && ['trending_up', 'Climb', `${climb.value} ${climb.unit}`],
    road.corners && steepest
      ? ['show_chart', 'Steepest', steepest]
      : ['turn_sharp_right', 'Bends', bendsLabel(road)],
    ['swap_horiz', 'Road type', road.roadType],
  ].filter(Boolean);

  return (
    <DetailLayout
      map={map}
      mapHeight={360}
      actions={[{ icon: 'near_me', label: 'Navigate to start', onPress: navigate }]}
    >
      <Text style={[type.kicker, styles.kicker]}>
        {`${road.region} · ${road.country}`.toUpperCase()}
      </Text>
      <Text style={[type.title, styles.title]}>{road.name}</Text>
      <Text style={[type.body, styles.muted, styles.subtitle]}>
        {road.routeLabel ?? (loop ? `Loop from ${road.from}` : `${road.from} → ${road.to}`)}
      </Text>

      {summary.count > 0 ? (
        <View style={[styles.status, styles.statusDone]}>
          <View style={[styles.statusWell, { backgroundColor: c.roadBadge }]}>
            <Icon name="verified" filled size={26} color={c.onRoadBadge} />
          </View>
          <View style={styles.flex}>
            <Text style={[type.bodyStrong, { color: c.onRoadContainer }]}>
              {completedLabel(summary.count)}
            </Text>
            <Text style={[type.small, { color: c.roadContainerMuted }]}>
              {summary.count > 1
                ? `First ${formatShortDate(summary.first)} · last ${formatShortDate(summary.last)}`
                : formatShortDate(summary.last)}
            </Text>
          </View>
        </View>
      ) : (
        <View style={[styles.status, styles.statusTodo]}>
          <View style={[styles.statusWell, { backgroundColor: c.track }]}>
            <Icon name="route" size={24} color={c.outlineStrong} />
          </View>
          <View style={styles.flex}>
            <Text style={[type.bodyStrong, styles.text]}>Not completed yet</Text>
            <Text style={[type.small, styles.muted]}>
              {loop ? 'Drive the full lap to complete it' : 'Drive the full road to complete it'}
            </Text>
          </View>
        </View>
      )}

      <StatRow
        style={styles.stats}
        stats={stats.map(([icon, value, unit, label]) => ({ icon, value, unit, label }))}
      />

      <SectionHeader title="About" style={styles.aboutHeader} />
      <Text style={[type.bodyLarge, styles.muted, styles.blurb]}>{road.blurb}</Text>

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

      <View style={styles.note}>
        <Icon name="info" size={20} color={c.textMuted} />
        <Text style={[type.label, styles.muted, styles.regular, styles.flex]}>{NOTE}</Text>
      </View>
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
  regular: { fontFamily: type.body.fontFamily },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  statusDone: { backgroundColor: c.roadContainer },
  statusTodo: {
    borderWidth: 1,
    borderColor: c.outline,
    paddingVertical: 13,
    paddingHorizontal: 15,
  },
  statusWell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stats: { marginTop: 20 },
  blurb: { marginHorizontal: 4, lineHeight: 24 },
  group: {
    paddingHorizontal: 12,
    borderRadius: 12,
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
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
    marginHorizontal: 4,
  },
  aboutHeader: { marginBottom: 8 },
  pressed: { opacity: 0.6 },
});

import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import NoTrips from '../components/NoTrips';
import RecordingBar from '../components/RecordingBar';
import TripCard from '../components/TripCard';
import SectionHeader from '../components/ui/SectionHeader';
import { useSettings } from '../context/SettingsContext';
import { useRoadCounts } from '../hooks/useRoadCounts';
import { useStyles } from '../hooks/useTheme';
import { ensureDrivePlaces } from '../services/placeService';
import { listTrips } from '../storage/tripStorage';
import { bottomSpace, spacing, type } from '../theme';
import { distanceParts } from '../utils/format';
import { computeTotals } from '../utils/tripSummary';

/** "November", or "November 2025" outside the current year. */
function monthLabel(ts, thisYear) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    month: 'long',
    ...(d.getFullYear() !== thisYear ? { year: 'numeric' } : {}),
  });
}

/** List rows: a month header before the first trip of each month (by latest drive). */
function withMonthHeaders(trips) {
  const thisYear = new Date().getFullYear();
  const rows = [];
  let current = null;
  for (const trip of trips) {
    const label = monthLabel(trip.drives.at(-1).startedAt, thisYear);
    if (label !== current) {
      rows.push({ key: `month-${label}`, month: label });
      current = label;
    }
    rows.push({ key: `trip-${trip.id}`, trip });
  }
  return rows;
}

/** "2026 · 4 trips · 1,260 km", or all-time totals when nothing was driven this year. */
function summaryLine(trips, units) {
  const year = new Date().getFullYear();
  const thisYear = computeTotals(trips, new Date(year, 0, 1).getTime());
  const totals = thisYear.tripCount > 0 ? thisYear : computeTotals(trips);
  const distance = distanceParts(totals.distanceM, units);
  const count = `${totals.tripCount} ${totals.tripCount === 1 ? 'trip' : 'trips'}`;
  const prefix = thisYear.tripCount > 0 ? `${year} · ` : 'All time · ';
  return `${prefix}${count} · ${distance.value} ${distance.unit}`;
}

export default function PastTripsScreen() {
  const { units, showIconicRoads } = useSettings();
  const roadCounts = useRoadCounts();
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const [trips, setTrips] = useState(null);

  const load = useCallback(() => {
    let cancelled = false;
    (async () => {
      const list = await listTrips();
      if (cancelled) return;
      setTrips(list);
      // Titles come from the first drive's start and the last drive's end; fill
      // those in if they couldn't be looked up when the drive ended (offline).
      for (const trip of list) {
        for (const drive of new Set([trip.drives[0], trip.drives.at(-1)])) {
          if (cancelled) return;
          if (drive.places.start !== undefined && drive.places.end !== undefined) continue;
          const places = await ensureDrivePlaces(drive);
          if (cancelled) return;
          setTrips((prev) =>
            prev.map((t) =>
              t.id === trip.id
                ? { ...t, drives: t.drives.map((d) => (d.id === drive.id ? { ...d, places } : d)) }
                : t
            )
          );
        }
      }
    })().catch((err) => console.warn('[trips] load failed', err));
    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(load);

  const rows = useMemo(() => withMonthHeaders(trips ?? []), [trips]);

  const header = (
    <View>
      <Text style={[type.headline, styles.h1]} role="heading">
        Trips
      </Text>
      {trips?.length ? (
        <Text style={[type.body, styles.muted, styles.summary]}>{summaryLine(trips, units)}</Text>
      ) : null}
      <RecordingBar style={styles.recording} />
    </View>
  );

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
      data={rows}
      keyExtractor={(row) => row.key}
      ListHeaderComponent={header}
      renderItem={({ item }) =>
        item.month ? (
          <SectionHeader variant="label" title={item.month} style={styles.month} />
        ) : (
          <TripCard
            trip={item.trip}
            units={units}
            roadCount={showIconicRoads ? (roadCounts.get(item.trip.id) ?? 0) : 0}
          />
        )
      }
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListEmptyComponent={trips ? <NoTrips style={styles.empty} /> : null}
    />
  );
}

const makeStyles = (c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  content: { paddingHorizontal: spacing.md, paddingBottom: bottomSpace.recordPill },
  h1: { color: c.text, marginHorizontal: 4, marginTop: 8, height: 56, textAlignVertical: 'center' },
  summary: { marginHorizontal: 4, marginTop: 2 },
  recording: { marginTop: 20 },
  month: { marginTop: 20, marginBottom: 4 },
  separator: { height: spacing.sm },
  muted: { color: c.textMuted },
  empty: { paddingTop: 124 },
});

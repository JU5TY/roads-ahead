import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import NoTrips from '../components/NoTrips';
import PlanCard from '../components/plan/PlanCard';
import PlanSheet from '../components/plan/PlanSheet';
import RecordingBar from '../components/RecordingBar';
import TripCard from '../components/TripCard';
import BannerCard from '../components/ui/BannerCard';
import FloatingButton from '../components/ui/FloatingButton';
import SectionHeader from '../components/ui/SectionHeader';
import SegmentedSwitch from '../components/ui/SegmentedSwitch';
import { useSettings } from '../context/SettingsContext';
import { useRoadCounts } from '../hooks/useRoadCounts';
import { useStyles, useTheme } from '../hooks/useTheme';
import { ensureDrivePlaces } from '../services/placeService';
import { createPlan, drivenPlanDates, drivenPlanDriveIds, listPlans } from '../storage/planStorage';
import { listTrips } from '../storage/tripStorage';
import { bottomSpace, floating, spacing, type } from '../theme';
import { groupPlans } from '../utils/plans';

const VIEWS = [
  ['driven', 'Driven'],
  ['planned', 'Planned'],
];

/**
 * Planned tab rows: Coming up, Someday and Done, each with its header when it
 * has plans. `dates` (plan id → { from, to }) dates the Done chips.
 */
function planRows(plans, driven, dates) {
  const { comingUp, someday, done } = groupPlans(plans, driven);
  return [
    ['Coming up', comingUp, false],
    ['Someday', someday, false],
    ['Done', done, true],
  ].flatMap(([title, list, isDone]) =>
    list.length
      ? [
          { key: `group-${title}`, month: title },
          ...list.map((plan) => ({
            key: `plan-${plan.id}`,
            plan,
            done: isDone,
            drivenDates: isDone ? (dates.get(plan.id) ?? null) : null,
          })),
        ]
      : []
  );
}

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

export default function PastTripsScreen() {
  const { units } = useSettings();
  const roadCounts = useRoadCounts();
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const [trips, setTrips] = useState(null);
  const [plans, setPlans] = useState(null); // { list, driven, dates }
  const [planning, setPlanning] = useState(false);
  // Driven or Planned, kept in the route so the Record pill can step aside for Plan.
  const planned = useLocalSearchParams().view === 'planned';
  const showView = (view) => router.setParams({ view: view === 'planned' ? 'planned' : undefined });

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
    Promise.all([listPlans(), drivenPlanDriveIds(), drivenPlanDates()])
      .then(([list, driven, dates]) => !cancelled && setPlans({ list, driven, dates }))
      .catch((err) => console.warn('[trips] plans failed', err));
    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(load);

  const rows = useMemo(
    () =>
      planned
        ? plans
          ? planRows(plans.list, plans.driven, plans.dates)
          : []
        : withMonthHeaders(trips ?? []),
    [planned, plans, trips]
  );

  const plan = async ({ name, startDate, roundTrip }) => {
    setPlanning(false);
    const id = await createPlan({ name, startDate, roundTrip });
    router.push(`/plans/${id}`);
  };

  const header = (
    <View>
      <Text style={[type.headline, styles.h1]} role="heading">
        Trips
      </Text>
      <SegmentedSwitch
        options={VIEWS}
        value={planned ? 'planned' : 'driven'}
        onChange={showView}
        stretch
        style={styles.switch}
      />
      {planned ? null : <RecordingBar style={styles.recording} />}
    </View>
  );

  const empty = planned ? (
    plans ? (
      <View style={styles.noPlans}>
        <Text style={[type.section, styles.text]}>No plans yet</Text>
        <Text style={[type.body, styles.muted, styles.center]}>
          Plan a trip day by day, then hand each day to your sat nav
        </Text>
      </View>
    ) : null
  ) : trips ? (
    <NoTrips style={styles.empty} />
  ) : null;

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
        data={rows}
        keyExtractor={(row) => row.key}
        ListHeaderComponent={header}
        renderItem={({ item }) =>
          item.month ? (
            <SectionHeader variant="label" title={item.month} style={styles.month} />
          ) : item.plan ? (
            <PlanCard plan={item.plan} done={item.done} drivenDates={item.drivenDates} />
          ) : (
            <TripCard
              trip={item.trip}
              units={units}
              roadCount={roadCounts.get(item.trip.id) ?? 0}
            />
          )
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={empty}
        // Under the plans: copy an Iconic Trip instead of planning from scratch.
        ListFooterComponent={
          planned && plans ? (
            <BannerCard
              icon="signpost"
              filled
              title="Iconic Trips"
              subtitle="Planned day by day for you"
              onPress={() => router.push('/routes')}
              style={styles.routes}
            />
          ) : null
        }
      />
      {planned ? (
        <FloatingButton
          icon="add"
          iconColor={c.accent}
          label="Plan"
          accessibilityLabel="Plan a trip"
          onPress={() => setPlanning(true)}
          style={styles.planButton}
        />
      ) : null}
      <PlanSheet visible={planning} onSave={plan} onClose={() => setPlanning(false)} />
    </View>
  );
}

const makeStyles = (c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  content: { paddingHorizontal: spacing.md, paddingBottom: bottomSpace.recordPill },
  h1: { color: c.text, marginHorizontal: 4, marginTop: 8, height: 56, textAlignVertical: 'center' },
  switch: { marginTop: 16 },
  recording: { marginTop: 20 },
  month: { marginTop: 20, marginBottom: 4 },
  separator: { height: spacing.sm },
  muted: { color: c.textMuted },
  text: { color: c.text },
  center: { textAlign: 'center' },
  empty: { paddingTop: 124 },
  routes: { marginTop: 20 },
  noPlans: { alignItems: 'center', gap: spacing.sm, paddingTop: 96, paddingHorizontal: spacing.lg },
  // Where the Record pill sits on Driven, so the two never overlap.
  planButton: { bottom: floating.recordPill.lift },
});

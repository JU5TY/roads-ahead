import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, FlatList, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import NoTrips from '../components/NoTrips';
import PlanCard from '../components/plan/PlanCard';
import PlanSheet from '../components/plan/PlanSheet';
import RecordingBar from '../components/RecordingBar';
import TripCard from '../components/TripCard';
import BannerCard from '../components/ui/BannerCard';
import FloatingButton from '../components/ui/FloatingButton';
import Icon from '../components/ui/Icon';
import IconButton from '../components/ui/IconButton';
import SectionHeader from '../components/ui/SectionHeader';
import SegmentedSwitch from '../components/ui/SegmentedSwitch';
import { useSettings } from '../context/SettingsContext';
import { useHere } from '../hooks/useHere';
import { useRoadCounts } from '../hooks/useRoadCounts';
import { useStyles, useTheme } from '../hooks/useTheme';
import { ensureDrivePlaces } from '../services/placeService';
import { createPlan, drivenPlanDates, drivenPlanDriveIds, listPlans } from '../storage/planStorage';
import { getRoadIdsByTrip } from '../storage/roadStorage';
import { listTrips } from '../storage/tripStorage';
import { listVehicles } from '../storage/vehicleStorage';
import { bottomSpace, floating, radius, spacing, type } from '../theme';
import { groupPlans } from '../utils/plans';
import { planSearchText, searchMatches, tripSearchText } from '../utils/tripSearch';

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
  // Where the phone is: a plan's Day 1 from "Your location" starts its thumbnail there, as its map does.
  const { here } = useHere();
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const [trips, setTrips] = useState(null);
  const [plans, setPlans] = useState(null); // { list, driven, dates }
  const [planning, setPlanning] = useState(false);
  // Driven or Planned, kept in the route so the Record pill can step aside for Plan.
  const params = useLocalSearchParams();
  const planned = params.view === 'planned';
  const showView = (view) => router.setParams({ view: view === 'planned' ? 'planned' : undefined });
  // Searching: the title becomes a search box (the Record pill steps aside, the
  // keyboard is up). Kept in the route too, so the pill knows. `query` is what's typed.
  const searching = params.search === '1';
  const [query, setQuery] = useState('');
  // What trips are found by beyond the list itself: { roads: tripId → road ids, vehicles: id → vehicle }.
  const [extras, setExtras] = useState(null);
  const openSearch = () => router.setParams({ search: '1' });
  const closeSearch = useCallback(() => {
    setQuery('');
    router.setParams({ search: undefined });
  }, []);
  useEffect(() => {
    if (!searching) return;
    let cancelled = false;
    Promise.all([getRoadIdsByTrip(), listVehicles()])
      .then(([roads, list]) => {
        if (!cancelled) setExtras({ roads, vehicles: new Map(list.map((v) => [v.id, v])) });
      })
      .catch((err) => console.warn('[trips] search data failed', err));
    return () => {
      cancelled = true;
    };
  }, [searching]);
  // Back closes the search rather than leaving Trips; only while Trips is showing
  // (it stays mounted under a trip's page).
  useFocusEffect(
    useCallback(() => {
      if (!searching) return undefined;
      const back = BackHandler.addEventListener('hardwareBackPress', () => {
        closeSearch();
        return true;
      });
      return () => back.remove();
    }, [searching, closeSearch])
  );

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

  // Each trip's and plan's search text, worked out once per list rather than per letter typed.
  const tripTexts = useMemo(
    () =>
      searching && trips
        ? new Map(
            trips.map((t) => [
              t.id,
              tripSearchText(t, { roadIds: extras?.roads.get(t.id), vehicles: extras?.vehicles }),
            ])
          )
        : null,
    [searching, trips, extras]
  );
  const planTexts = useMemo(
    () => (searching && plans ? new Map(plans.list.map((p) => [p.id, planSearchText(p)])) : null),
    [searching, plans]
  );

  const rows = useMemo(() => {
    const found = (texts, id) => !texts || searchMatches(texts.get(id), query);
    return planned
      ? plans
        ? planRows(
            plans.list.filter((p) => found(planTexts, p.id)),
            plans.driven,
            plans.dates
          )
        : []
      : withMonthHeaders((trips ?? []).filter((t) => found(tripTexts, t.id)));
  }, [planned, plans, trips, query, tripTexts, planTexts]);

  const plan = async ({ name, startDate, roundTrip }) => {
    setPlanning(false);
    const id = await createPlan({ name, startDate, roundTrip });
    router.push(`/plans/${id}`);
  };

  const header = (
    <View>
      {searching ? (
        <View style={styles.search}>
          <Icon name="search" size={22} color={c.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search trips"
            placeholderTextColor={c.textMuted}
            style={styles.input}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search trips"
          />
          <IconButton
            icon="close"
            variant="plain"
            size={44}
            iconSize={22}
            accessibilityLabel="Clear and close search"
            onPress={closeSearch}
          />
        </View>
      ) : (
        <View style={styles.titleRow}>
          <Text style={[type.headline, styles.h1]} role="heading">
            Trips
          </Text>
          <IconButton icon="search" variant="plain" accessibilityLabel="Search trips" onPress={openSearch} />
        </View>
      )}
      <SegmentedSwitch
        options={VIEWS}
        value={planned ? 'planned' : 'driven'}
        onChange={showView}
        stretch
        style={styles.switch}
      />
      {planned || searching ? null : <RecordingBar style={styles.recording} />}
    </View>
  );

  const empty = searching && query.trim() ? (
    <View style={styles.noMatch}>
      <Icon name="search" size={40} color={c.textMuted} />
      <Text style={[type.body, styles.muted, styles.center]}>No trips match “{query.trim()}”</Text>
    </View>
  ) : planned ? (
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
            <PlanCard plan={item.plan} here={here} done={item.done} drivenDates={item.drivenDates} />
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
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={
          planned && plans && !searching ? (
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
      {planned && !searching ? (
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
  // The top margin sits on the row, not the title, so the search button centres on the title.
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginRight: -8,
  },
  h1: { color: c.text, marginHorizontal: 4, height: 56, textAlignVertical: 'center' },
  // As Add stop's search box; in the title's place, the same height overall.
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    marginTop: 12,
    paddingLeft: spacing.md,
    paddingRight: 4,
    borderRadius: radius.card,
    backgroundColor: c.card,
    ...c.cardShadow,
  },
  input: { ...type.bodyLarge, flex: 1, minWidth: 0, color: c.text, paddingVertical: 12 },
  noMatch: { alignItems: 'center', gap: spacing.md, paddingTop: 64, paddingHorizontal: spacing.lg },
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

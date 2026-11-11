import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import ActionSheet from '../components/ActionSheet';
import DetailLayout from '../components/detail/DetailLayout';
import { TitleBlock } from '../components/detail/TripStats';
import PlanSheet from '../components/plan/PlanSheet';
import PlanTimeline from '../components/plan/PlanTimeline';
import RouteMap from '../components/RouteMap';
import Button from '../components/ui/Button';
import { showDialog } from '../components/ui/DialogHost';
import FilterChip from '../components/ui/FilterChip';
import Icon from '../components/ui/Icon';
import { useHere } from '../hooks/useHere';
import { usePlanRoutes } from '../hooks/usePlanRoutes';
import { useSettings } from '../context/SettingsContext';
import { useStyles, useTheme } from '../hooks/useTheme';
import {
  addPlanDrive,
  addPlanStop,
  deletePlan,
  deletePlanDrive,
  deletePlanStop,
  getPlan,
  movePlanStop,
  renamePlan,
  setPlanDriveStart,
  setPlanStartDate,
} from '../storage/planStorage';
import { dayColorFor, pressedOpacity, spacing, type } from '../theme';
import { formatDistance, formatDurationShort } from '../utils/format';
import { ICONIC_ROADS, getRoad, roadPlace } from '../utils/iconicRoads';
import {
  driveMarkers,
  driveReach,
  driveStart,
  fromHere,
  planKicker,
  planOutline,
  roadStop,
  stopCounts,
} from '../utils/plans';

/**
 * A plan: its map, the Drive tabs (+ adds one), and the picked drive as a
 * timeline. Stops are added and reordered here; the menu edits the name and
 * date, or deletes a drive or the plan. Params: `id`.
 */
export default function PlanScreen() {
  const { id } = useLocalSearchParams();
  const planId = Number(id);
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const [plan, setPlan] = useState(null);
  const [picked, setPicked] = useState(0);
  const [menu, setMenu] = useState(null); // 'options' | 'edit' | 'road' | 'start' | { stop }
  const { here } = useHere();

  const reload = useCallback(
    () =>
      getPlan(planId)
        .then((p) => {
          if (!p) return router.back();
          setPlan(p);
          setPicked((i) => Math.min(i, p.drives.length - 1));
        })
        .catch((err) => console.warn('[plan] load failed', err)),
    [planId]
  );
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const colorOf = useCallback((i) => dayColorFor(c, i + 1), [c]);
  // On the map, a Drive 1 with no start runs from where the phone is.
  const mapPlan = useMemo(() => (plan ? fromHere(plan, here) : null), [plan, here]);
  const outline = useMemo(() => (mapPlan ? planOutline(mapPlan) : []), [mapPlan]);
  const routes = usePlanRoutes(mapPlan, picked);
  const { units } = useSettings();

  if (!plan) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  const drive = plan.drives[picked];
  const start = driveStart(plan, picked);
  const pickedCoords = outline[picked]?.coordinates ?? [];
  const finish = drive.stops.length ? driveReach(plan, picked) : null;
  const { stops } = stopCounts([drive]);
  const act = (fn) => () => {
    setMenu(null);
    fn().then(reload).catch((err) => console.warn('[plan] change failed', err));
  };

  const addDrive = act(async () => {
    await addPlanDrive(plan.id);
    setPicked(plan.drives.length);
  });
  const pickPlace = (mode) => {
    setMenu(null);
    router.push({ pathname: '/plans/add-stop', params: { plan: plan.id, drive: picked, mode } });
  };
  // Where the drive would start if it followed on (Drive 1: wherever the phone is).
  const followOn = driveStart({ ...plan, drives: plan.drives.map((d) => (d === drive ? { ...d, start: null } : d)) }, picked);
  const addRoad = (road) => act(() => addPlanStop(drive.id, roadStop(plan, picked, road)))();
  const confirmDeleteDrive = () => {
    setMenu(null);
    const next = plan.drives[picked + 1];
    showDialog({
      title: `Delete Drive ${picked + 1}?`,
      message: [
        stops ? `Its ${stops === 1 ? 'stop goes' : `${stops} stops go`} too.` : null,
        next && !next.start ? `Drive ${picked + 2} will start where Drive ${picked} ends.` : null,
        "This can't be undone.",
      ]
        .filter(Boolean)
        .join(' '),
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () =>
        deletePlanDrive(drive.id)
          .then(() => setPicked(Math.max(0, picked - 1)))
          .then(reload),
    });
  };
  const confirmDeletePlan = () => {
    setMenu(null);
    showDialog({
      title: `Delete ${plan.name}?`,
      message: "Its drives and stops go too. Trips you've driven stay. This can't be undone.",
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () => deletePlan(plan.id).then(() => router.back()),
    });
  };

  const markers = driveMarkers(mapPlan, picked).map((m) => ({ ...m, color: colorOf(picked) }));

  // Miles and times for the picked drive: '142 mi · 3h 10m', and each leg's.
  const { status, route, legStops } = routes.picked;
  const miles = (metres) => formatDistance(metres, units, metres < 16000 ? 1 : 0);
  const time = (seconds) => formatDurationShort(seconds * 1000);
  let routeSummary = null;
  if (status === 'done') routeSummary = `${miles(route.metres)} · ${time(route.seconds)}`;
  else if (status === 'failed' || status === 'limited') routeSummary = 'Road times unavailable right now';
  const legTexts = {};
  if (status === 'done') {
    route.legs.forEach((leg, k) => {
      const stop = drive.stops[legStops[k]];
      if (stop) legTexts[stop.id] = `${miles(leg.metres)} · ${time(leg.seconds)}`;
    });
  }

  const map = outline.some((d) => d.coordinates.length) ? (
    <RouteMap
      flat
      segments={outline.map(({ index, coordinates }) => ({
        key: `drive-${index}`,
        // Along the roads once routed (or from a line saved in the last 30 days), else straight.
        coordinates: routes.lines[index] ?? coordinates,
        // The picked drive stands out; the rest fade back, as on a trip.
        color: index === picked ? colorOf(index) : `${colorOf(index)}40`,
        // Solid along the roads; dotted while it's still a straight guess, as a trip dots a ferry.
        dotted: !routes.lines[index],
      }))}
      fitTo={pickedCoords.length > 1 ? pickedCoords : undefined}
      markers={markers}
    />
  ) : (
    <View style={styles.noMap}>
      <Icon name="map" size={32} color={c.textMuted} />
      <Text style={[type.body, styles.muted]}>Add a stop to see the route</Text>
    </View>
  );

  const stop = menu?.stop;
  const stopIndex = stop ? drive.stops.findIndex((s) => s.id === stop.id) : -1;

  return (
    <DetailLayout
      map={map}
      actions={[{ icon: 'more_vert', label: 'More options', onPress: () => setMenu('options') }]}
    >
      <ActionSheet
        visible={menu === 'options'}
        actions={[
          { icon: 'edit', label: 'Edit name and date', onPress: () => setMenu('edit') },
          ...(plan.drives.length > 1
            ? [{ icon: 'delete', label: 'Delete this drive', style: 'destructive', onPress: confirmDeleteDrive }]
            : []),
          { icon: 'delete', label: 'Delete plan', style: 'destructive', onPress: confirmDeletePlan },
        ]}
        onClose={() => setMenu(null)}
      />
      <PlanSheet
        visible={menu === 'edit'}
        plan={plan}
        onSave={({ name, startDate }) =>
          act(async () => {
            await renamePlan(plan.id, name);
            await setPlanStartDate(plan.id, startDate);
          })()
        }
        onClose={() => setMenu(null)}
      />
      <ActionSheet
        visible={menu === 'road'}
        actions={[...ICONIC_ROADS]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((road) => ({
            key: road.id,
            icon: 'verified',
            label: road.name,
            detail: roadPlace(road),
            onPress: () => addRoad(road),
          }))}
        onClose={() => setMenu(null)}
      />
      <ActionSheet
        visible={menu === 'start'}
        message={`Where Drive ${picked + 1} starts`}
        actions={[
          picked === 0
            ? {
                icon: 'my_location',
                label: 'Wherever you are',
                detail: 'Where the phone is when you start',
                selected: !drive.start,
                onPress: act(() => setPlanDriveStart(drive.id, null)),
              }
            : {
                icon: 'link',
                label: `Where Drive ${picked} ends`,
                detail: `${followOn?.name ?? 'Its last stop'} · moves if Drive ${picked} changes`,
                selected: !drive.start,
                onPress: act(() => setPlanDriveStart(drive.id, null)),
              },
          {
            icon: 'edit_location_alt',
            label: 'Start somewhere else',
            detail: picked === 0 ? 'Pick a place, or drop a pin' : 'After a ferry, train or hire car',
            selected: !!drive.start,
            onPress: () => pickPlace('start'),
          },
        ]}
        onClose={() => setMenu(null)}
      />
      <ActionSheet
        visible={!!stop}
        message={stop ? (stop.roadId ? getRoad(stop.roadId)?.name : (stop.name ?? 'Dropped pin')) : null}
        actions={[
          ...(stopIndex > 0
            ? [{ icon: 'expand_less', label: 'Move up', onPress: act(() => movePlanStop(stop.id, stopIndex - 1)) }]
            : []),
          ...(stop && stopIndex < drive.stops.length - 1
            ? [{ icon: 'expand_more', label: 'Move down', onPress: act(() => movePlanStop(stop.id, stopIndex + 1)) }]
            : []),
          ...(stop
            ? [
                {
                  icon: 'delete',
                  label: stop.roadId ? 'Remove Iconic Road' : 'Remove stop',
                  style: 'destructive',
                  onPress: act(() => deletePlanStop(stop.id)),
                },
              ]
            : []),
        ]}
        onClose={() => setMenu(null)}
      />

      <TitleBlock kicker={planKicker(plan)} title={plan.name} />

      <View style={styles.tabsRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsScroll}
          contentContainerStyle={styles.tabs}
          role="radiogroup"
        >
          {plan.drives.map((d, i) => (
            <FilterChip
              key={d.id}
              label={`Drive ${i + 1}`}
              dot={colorOf(i)}
              selected={i === picked}
              onPress={() => setPicked(i)}
            />
          ))}
        </ScrollView>
        {/* Pinned at the end of the tabs, so it's there however many drives there are. */}
        <Pressable
          onPress={addDrive}
          accessibilityRole="button"
          accessibilityLabel="Add a drive"
          style={({ pressed }) => [styles.addDrive, pressed && styles.pressed]}
        >
          <Icon name="add" size={22} color={c.accent} />
        </Pressable>
      </View>

      <View style={styles.heading}>
        <Text style={[type.section, styles.text]} numberOfLines={2}>
          {finish ? `${start?.name ?? 'Your location'} → ${finish.name ?? 'Dropped pin'}` : `From ${start?.name ?? 'your location'}`}
        </Text>
        <Text style={[type.bodySmall, styles.muted]}>
          {[stops === 0 ? 'No stops yet' : `${stops} ${stops === 1 ? 'stop' : 'stops'}`, routeSummary]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>

      <PlanTimeline
        legTexts={legTexts}
        drive={drive}
        index={picked}
        start={start}
        color={colorOf(picked)}
        onStopPress={(s) => setMenu({ stop: s })}
        onStartPress={() => setMenu('start')}
        onMove={(s, position) => movePlanStop(s.id, position).then(reload).catch((err) => console.warn('[plan] move failed', err))}
      />

      <View style={styles.buttons}>
        <Button
          label="Add stop"
          icon="add_location_alt"
          variant="tonal"
          size="small"
          onPress={() => pickPlace('stop')}
          style={styles.button}
        />
        <Button
          label="Iconic Road"
          icon="verified"
          variant="tonal"
          size="small"
          onPress={() => setMenu('road')}
          style={styles.button}
        />
      </View>
    </DetailLayout>
  );
}

const makeStyles = (c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  noMap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: c.mapLand },
  tabsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, marginRight: -spacing.md },
  tabsScroll: { flexGrow: 1, flexShrink: 1, marginLeft: -spacing.md },
  tabs: { gap: 8, paddingLeft: spacing.md },
  addDrive: {
    width: 48,
    height: 32,
    marginRight: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: { marginTop: 20, marginBottom: 10, marginHorizontal: 4, gap: 2 },
  buttons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  button: { flex: 1 },
  text: { color: c.text },
  muted: { color: c.textMuted },
  pressed: { opacity: pressedOpacity },
});

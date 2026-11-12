import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ActionSheet from '../components/ActionSheet';
import DetailLayout from '../components/detail/DetailLayout';
import PriceSheet from '../components/PriceSheet';
import { TitleBlock } from '../components/detail/TripStats';
import PlanSheet from '../components/plan/PlanSheet';
import PlanTimeline from '../components/plan/PlanTimeline';
import StartDriveSheet from '../components/plan/StartDriveSheet';
import NavAppSheet from '../components/NavAppSheet';
import RouteMap from '../components/RouteMap';
import VehicleSheet from '../components/VehicleSheet';
import Button from '../components/ui/Button';
import { showDialog } from '../components/ui/DialogHost';
import FilterChip from '../components/ui/FilterChip';
import FloatingButton from '../components/ui/FloatingButton';
import Icon from '../components/ui/Icon';
import { useHere } from '../hooks/useHere';
import { usePlanRoutes } from '../hooks/usePlanRoutes';
import { useSettings } from '../context/SettingsContext';
import { useStyles, useTheme } from '../hooks/useTheme';
import { useVehicles } from '../hooks/useVehicles';
import {
  addPlanDrive,
  addPlanStop,
  deletePlan,
  deletePlanDrive,
  deletePlanStop,
  getPlan,
  getPlanDrives,
  movePlanStop,
  renamePlan,
  setPlanDriveStart,
  setPlanRoundTrip,
  setPlanStartDate,
} from '../storage/planStorage';
import { addVehicle, updateVehicle } from '../storage/vehicleStorage';
import { dayColorFor, floating, pressedOpacity, spacing, type } from '../theme';
import { formatDistance, formatDurationShort } from '../utils/format';
import { driveCost, formatDriveCost } from '../utils/fuel';
import { ICONIC_ROADS, getRoad, roadPlace } from '../utils/iconicRoads';
import {
  driveMarkers,
  driveReach,
  driveStart,
  mapPlanOf,
  planKicker,
  planHandover,
  planOutline,
  roadStop,
  stopCounts,
  withWayBack,
} from '../utils/plans';

/**
 * A plan: its map, the Drive tabs (All once there are two; + adds one), and
 * the picked drive as a timeline, or on All every drive's, to look at. Stops are added and reordered here; the menu edits the name,
 * date and one way or round trip, or deletes a drive or the plan. Params: `id`.
 */
export default function PlanScreen() {
  const { id } = useLocalSearchParams();
  const planId = Number(id);
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const [plan, setPlan] = useState(null);
  // The tab: a drive's index, or null for All (shown once there are two drives).
  const [tab, setTab] = useState(0);
  const [driven, setDriven] = useState(() => new Set()); // planned drive ids with a recording
  // 'options' | 'edit' | 'road' | 'start' | 'back' | 'vehicle' | 'price' | 'go' | 'nav' | { stop }
  const [menu, setMenu] = useState(null);
  const { here } = useHere();
  const insets = useSafeAreaInsets();

  const reload = useCallback(
    () =>
      Promise.all([getPlan(planId), getPlanDrives(planId)])
        .then(([p, drives]) => {
          if (!p) return router.back();
          setPlan(p);
          setDriven(new Set(drives.keys()));
          setTab((i) => (i === null ? (p.drives.length > 1 ? null : 0) : Math.min(i, p.drives.length - 1)));
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
  // On the map, a Drive 1 with no start runs from where it set off or where the
  // phone is, and a round trip comes back there.
  const mapPlan = useMemo(() => (plan ? mapPlanOf(plan, here) : null), [plan, here]);
  const outline = useMemo(() => (mapPlan ? planOutline(mapPlan) : []), [mapPlan]);
  const routes = usePlanRoutes(mapPlan, tab);
  const { units, prices, setPrice, navApp } = useSettings();
  const [vehicles, reloadVehicles] = useVehicles();
  // Plans aren't tied to a car: the fuel is worked out for the default one.
  const vehicle = vehicles?.find((v) => v.isDefault) ?? null;

  if (!plan) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  const all = tab === null;
  // The drive in focus: the tab's, or on All the next one not yet driven (for Start drive).
  const next = plan.drives.findIndex((d) => !driven.has(d.id));
  const picked = tab ?? (next >= 0 ? next : plan.drives.length - 1);
  const drive = plan.drives[picked];
  // The plan with a round trip's way back (its last drive's final stop, id 'home').
  const wayPlan = withWayBack(plan, here);
  const wayStops = mapPlan.drives[picked].stops;
  const start = driveStart(plan, picked);
  const fitCoords = all ? outline.flatMap((d) => d.coordinates) : (outline[picked]?.coordinates ?? []);
  const finish = wayStops.length ? driveReach(wayPlan, picked) : null;
  const { stops } = stopCounts([drive]);
  const shownStops = all ? stopCounts(plan.drives).stops : stops;
  const act = (fn) => () => {
    setMenu(null);
    fn().then(reload).catch((err) => console.warn('[plan] change failed', err));
  };

  // The new drive is picked once the plan has it, or the screen reads a drive that isn't there yet.
  const addDrive = () =>
    addPlanDrive(plan.id)
      .then(reload)
      .then(() => setTab(plan.drives.length))
      .catch((err) => console.warn('[plan] add drive failed', err));
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
          .then(() => setTab(Math.max(0, picked - 1)))
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

  // A copied ready-made route can't be changed for now: its drives and stops are as they came.
  const locked = !!plan.routeId;
  // "Fort William → Applecross"; Drive 1 with no start runs from wherever you are.
  const startName = start?.name ?? 'Your location';
  let routeName = finish ? `${startName} → ${finish.name ?? 'Dropped pin'}` : null;
  if (finish?.home && picked === 0) routeName = `Round trip from ${startName}`;
  // All: where the trip starts and where it ends.
  const lastIndex = plan.drives.length - 1;
  const tripStart = driveStart(plan, 0)?.name;
  const tripEnd = mapPlan.drives.some((d) => d.stops.length) ? driveReach(wayPlan, lastIndex) : null;
  let tripName = tripEnd
    ? `${tripStart ?? 'Your location'} → ${tripEnd.name ?? 'Dropped pin'}`
    : `From ${tripStart ?? 'your location'}`;
  if (tripEnd?.home) tripName = `Round trip from ${tripStart ?? 'Your location'}`;
  // What Start drive hands the sat nav, from the plan as saved (not the map's fromHere).
  const handover = wayStops.length ? planHandover(wayPlan, picked, { here, app: navApp }) : null;

  // The picked drive's start, stops and finish; on All, just where the trip starts and ends.
  let markers = driveMarkers(mapPlan, picked).map((m) => ({ ...m, color: colorOf(picked) }));
  if (all) {
    const first = driveMarkers(mapPlan, 0).filter((m) => m.kind === 'start');
    const end = driveMarkers(mapPlan, lastIndex).filter((m) => m.kind === 'finish');
    markers = [
      ...first.map((m) => ({ ...m, key: 'trip-start', color: colorOf(0) })),
      ...end.map((m) => ({ ...m, key: 'trip-finish', color: colorOf(lastIndex) })),
    ];
    // A round trip starts and ends in the same place: one dot.
    if (tripEnd?.home) markers = markers.filter((m) => m.key !== 'trip-start');
  }

  // Miles and times: '142 mi · 3h 10m', for the picked drive or (All) the whole
  // trip once every drive has come back, and each leg's.
  const miles = (metres) => formatDistance(metres, units, metres < 16000 ? 1 : 0);
  const time = (seconds) => formatDurationShort(seconds * 1000);
  // '£19 fuel' (or '£8 charging') once the car's own figure and its price are
  // both set; until then, a link to add them.
  const electric = !!vehicle?.electric;
  const priceKind = electric ? 'charge' : 'fuel';
  const summaryOf = (results) => {
    const asked = results.filter((r) => r.status !== 'none');
    if (asked.some((r) => r.status === 'failed' || r.status === 'limited')) {
      return { status: 'failed', text: 'Road times unavailable right now' };
    }
    if (!asked.length || asked.some((r) => r.status !== 'done')) return { status: asked.length ? 'loading' : 'none' };
    const metres = asked.reduce((sum, r) => sum + r.route.metres, 0);
    const seconds = asked.reduce((sum, r) => sum + r.route.seconds, 0);
    const pounds = vehicle ? driveCost(metres, vehicle, { fuel: prices.fuel?.price, charge: prices.charge?.price }) : null;
    const cost = pounds != null ? ` · ${formatDriveCost(pounds, electric)}` : '';
    return { status: 'done', text: `${miles(metres)} · ${time(seconds)}${cost}`, costed: pounds != null };
  };
  const summary = summaryOf(all ? routes.drives : [routes.drives[picked]]);
  const routeSummary = summary.text ?? null;
  // Start drive's sheet is always about one drive.
  const goSummary = summaryOf([routes.drives[picked]]);
  const askCost = summary.status === 'done' && !summary.costed && vehicles != null;
  const hasFigure = (v) => (v.electric ? v.milesPerKwh : v.mpg) != null;
  // The car's figure first (adding the car if there's none), then the price.
  const addCost = () => setMenu(vehicle && hasFigure(vehicle) ? 'price' : 'vehicle');
  const saveVehicle = async (fields) => {
    try {
      if (vehicle) await updateVehicle(vehicle.id, fields);
      else await addVehicle(fields);
    } catch (err) {
      console.warn('[garage] save failed', err);
    }
    // Reloaded first, so the price sheet opens for the car's fuel as saved.
    await reloadVehicles();
    setMenu(hasFigure(fields) && !prices[fields.electric ? 'charge' : 'fuel'] ? 'price' : null);
  };
  // Drive i's leg texts, by the id of the stop each leg arrives at.
  const legTextsOf = (i) => {
    const { status, route, legStops } = routes.drives[i];
    const texts = {};
    if (status !== 'done') return texts;
    route.legs.forEach((leg, k) => {
      const stop = mapPlan.drives[i].stops[legStops[k]];
      if (stop) texts[stop.id] = `${miles(leg.metres)} · ${time(leg.seconds)}`;
    });
    return texts;
  };

  const map = outline.some((d) => d.coordinates.length) ? (
    <RouteMap
      flat
      segments={outline.map(({ index, coordinates }) => ({
        key: `drive-${index}`,
        // Along the roads once routed (or from a line saved in the last 30 days), else straight.
        coordinates: routes.lines[index] ?? coordinates,
        // The picked drive stands out; the rest fade back, as on a trip. All shows them all.
        color: all || index === picked ? colorOf(index) : `${colorOf(index)}40`,
        // Solid along the roads; dotted while it's still a straight guess, as a trip dots a ferry.
        dotted: !routes.lines[index],
      }))}
      fitTo={fitCoords.length > 1 ? fitCoords : undefined}
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
      floating={
        // Starts the picked drive (on All, the next one not yet driven), once it goes somewhere.
        wayStops.length ? (
          <FloatingButton
            icon="play_arrow"
            filled
            iconColor={c.start}
            label={`Drive ${picked + 1}`}
            accessibilityLabel={`Start drive ${picked + 1}`}
            onPress={() => setMenu('go')}
            style={{ bottom: insets.bottom + floating.recordPill.lift }}
          />
        ) : null
      }
    >
      <StartDriveSheet
        visible={menu === 'go'}
        number={picked + 1}
        route={routeName}
        detail={goSummary.status === 'done' ? goSummary.text : null}
        color={colorOf(picked)}
        handover={handover}
        units={units}
        onPickApp={() => setMenu('nav')}
        // Record starts it: location access is asked for there, then the sat nav opens.
        onStart={() => {
          setMenu(null);
          router.navigate({ pathname: '/record', params: { planDrive: drive.id } });
        }}
        onClose={() => setMenu(null)}
      />
      {/* Picked from Start drive, so it goes back there. */}
      <NavAppSheet visible={menu === 'nav'} onClose={() => setMenu('go')} />
      <ActionSheet
        visible={menu === 'options'}
        actions={[
          { icon: 'edit', label: 'Edit name, date and route', onPress: () => setMenu('edit') },
          ...(plan.drives.length > 1 && !locked && !all
            ? [{ icon: 'delete', label: 'Delete this drive', style: 'destructive', onPress: confirmDeleteDrive }]
            : []),
          { icon: 'delete', label: 'Delete plan', style: 'destructive', onPress: confirmDeletePlan },
        ]}
        onClose={() => setMenu(null)}
      />
      <PlanSheet
        visible={menu === 'edit'}
        plan={plan}
        onSave={({ name, startDate, roundTrip }) =>
          act(async () => {
            await renamePlan(plan.id, name);
            await setPlanStartDate(plan.id, startDate);
            await setPlanRoundTrip(plan.id, roundTrip);
          })()
        }
        onClose={() => setMenu(null)}
      />
      <VehicleSheet
        visible={menu === 'vehicle'}
        vehicle={vehicle}
        others={(vehicles ?? []).filter((v) => v !== vehicle)}
        focusEfficiency
        onSave={saveVehicle}
        onClose={() => setMenu(null)}
      />
      <PriceSheet
        visible={menu === 'price'}
        kind={priceKind}
        price={prices[priceKind]?.price}
        onSave={(price) => {
          setPrice(priceKind, price);
          setMenu(null);
        }}
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
        visible={menu === 'back'}
        message="A round trip ends back where Drive 1 starts"
        actions={[
          {
            icon: 'arrow_forward',
            label: 'Make it one way',
            detail: `Drive ${plan.drives.length} ends at its last stop`,
            onPress: act(() => setPlanRoundTrip(plan.id, false)),
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
          {/* All, as on a trip, once there's more than one drive. */}
          {plan.drives.length > 1 ? <FilterChip label="All" selected={all} onPress={() => setTab(null)} /> : null}
          {plan.drives.map((d, i) => (
            <FilterChip
              key={d.id}
              label={`Drive ${i + 1}`}
              dot={colorOf(i)}
              selected={i === tab}
              onPress={() => setTab(i)}
            />
          ))}
        </ScrollView>
        {/* Pinned at the end of the tabs, so it's there however many drives there are. */}
        {locked ? null : (
          <Pressable
            onPress={addDrive}
            accessibilityRole="button"
            accessibilityLabel="Add a drive"
            style={({ pressed }) => [styles.addDrive, pressed && styles.pressed]}
          >
            <Icon name="add" size={22} color={c.accent} />
          </Pressable>
        )}
      </View>

      <View style={styles.heading}>
        <Text style={[type.section, styles.text]} numberOfLines={2}>
          {all ? tripName : finish ? routeName : `From ${start?.name ?? 'your location'}`}
        </Text>
        <Text style={[type.bodySmall, styles.muted]}>
          {[shownStops === 0 ? 'No stops yet' : `${shownStops} ${shownStops === 1 ? 'stop' : 'stops'}`, routeSummary]
            .filter(Boolean)
            .join(' · ')}
          {askCost ? (
            <>
              {' · '}
              <Text style={styles.link} onPress={addCost} accessibilityRole="link">
                {electric ? 'Add charging cost' : 'Add fuel cost'}
              </Text>
            </>
          ) : null}
        </Text>
      </View>

      {all ? (
        // One timeline for the whole trip, as a trip's All: each drive in its
        // colour from its "Drive 2 · Start". Tap a drive to change it on its own tab.
        plan.drives.map((d, i) => (
          <Pressable
            key={d.id}
            onPress={() => setTab(i)}
            accessibilityRole="button"
            accessibilityHint={`Opens Drive ${i + 1} to change it`}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <PlanTimeline
              legTexts={legTextsOf(i)}
              drive={{ ...d, stops: mapPlan.drives[i].stops }}
              index={i}
              start={driveStart(plan, i)}
              color={colorOf(i)}
              numbered
              locked
            />
          </Pressable>
        ))
      ) : (
        <PlanTimeline
          legTexts={legTextsOf(picked)}
          drive={{ ...drive, stops: wayStops }}
          index={picked}
          start={start}
          onBackPress={locked ? undefined : () => setMenu('back')}
          color={colorOf(picked)}
          onStopPress={(s) => setMenu({ stop: s })}
          onStartPress={locked ? undefined : () => setMenu('start')}
          onMove={(s, position) => movePlanStop(s.id, position).then(reload).catch((err) => console.warn('[plan] move failed', err))}
          locked={locked}
        />
      )}

      {all ? null : locked ? (
        <View style={styles.lockedNote}>
          <Icon name="info" size={20} color={c.textMuted} />
          <Text style={[type.label, styles.muted, styles.regular, styles.flex]}>
            Copied from Ready-made routes, so its drives and stops stay as they are for now
          </Text>
        </View>
      ) : (
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
      )}
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
  regular: { fontFamily: type.body.fontFamily },
  flex: { flex: 1, minWidth: 0 },
  lockedNote: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, marginHorizontal: 4 },
  link: { color: c.accent, fontFamily: type.bodyStrong.fontFamily },
  pressed: { opacity: pressedOpacity },
});

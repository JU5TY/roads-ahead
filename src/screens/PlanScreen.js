import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
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
  addPlanStop,
  deletePlan,
  deletePlanStop,
  getPlan,
  arrangePlanStops,
  getPlanDrives,
  joinPlanDriveWithNext,
  movePlanStop,
  renamePlan,
  setPlanDriveStart,
  setPlanRoundTrip,
  setPlanStartDate,
  splitPlanDriveAt,
} from '../storage/planStorage';
import { addVehicle, updateVehicle } from '../storage/vehicleStorage';
import { dayColorFor, floating, spacing, type } from '../theme';
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
 * A plan: its map, then the whole route as one timeline (All) to plan it in,
 * or one day's. A stop's sheet makes it where you stay overnight, which ends
 * its day (Day tabs show once there are two). The menu edits the name, date
 * and one way or round trip, or deletes the plan. Params: `id`.
 * Each day is stored as a planned drive (planStorage splitPlanDriveAt / joinPlanDriveWithNext).
 */
export default function PlanScreen() {
  const { id } = useLocalSearchParams();
  const planId = Number(id);
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const [plan, setPlan] = useState(null);
  // The tab: a day's index, or null for All, where the whole route is planned
  // (tabs show once there are two days).
  const [tab, setTab] = useState(null);
  const [driven, setDriven] = useState(() => new Set()); // planned drive ids with a recording
  // 'options' | 'edit' | 'road' | 'back' | 'vehicle' | 'price' | 'go' | 'nav' | { stop, at } | { start, at }
  // (`at`: the day the stop or start is in)
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
          setTab((i) => (i === null || p.drives.length < 2 ? null : Math.min(i, p.drives.length - 1)));
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

  // The day a sheet is about (a stop's, or a start's), and where new stops go:
  // the day's tab, or on All the end of the trip.
  // Only a stop's or a start's sheet is an object; the rest are names (and a
  // name's `.at` is String's own function, so never read it off one).
  const sheet = menu && typeof menu === 'object' ? menu : null;
  const at = sheet?.at ?? picked;
  const atDrive = plan.drives[at];
  const addAt = tab ?? plan.drives.length - 1;
  const pickPlace = (mode, day = addAt) => {
    setMenu(null);
    router.push({ pathname: '/plans/add-stop', params: { plan: plan.id, drive: day, mode } });
  };
  // Where the day would start if it followed on (Day 1: wherever the phone is).
  const followOn = driveStart({ ...plan, drives: plan.drives.map((d) => (d === atDrive ? { ...d, start: null } : d)) }, at);
  const addRoad = (road) => act(() => addPlanStop(plan.drives[addAt].id, roadStop(plan, addAt, road)))();
  const confirmDeletePlan = () => {
    setMenu(null);
    showDialog({
      title: `Delete ${plan.name}?`,
      message: "Its days and stops go too. Trips you've driven stay. This can't be undone.",
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
    // Miles on the road (a ferry's crossing isn't driven, so isn't in the fuel either); time door to door.
    const metres = asked.reduce((sum, r) => sum + r.route.metres, 0);
    const seconds = asked.reduce((sum, r) => sum + r.route.seconds, 0);
    const ferry = asked.some((r) => r.route.ferry) ? ' · includes a ferry' : '';
    const pounds = vehicle ? driveCost(metres, vehicle, { fuel: prices.fuel?.price, charge: prices.charge?.price }) : null;
    const cost = pounds != null ? ` · ${formatDriveCost(pounds, electric)}` : '';
    return { status: 'done', text: `${miles(metres)} · ${time(seconds)}${ferry}${cost}`, costed: pounds != null };
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
  // Drive i's leg texts and which legs take a ferry, by the id of the stop each leg arrives at.
  const legsOf = (i) => {
    const { status, route, legStops } = routes.drives[i];
    const legTexts = {};
    const ferryLegs = new Set();
    if (status !== 'done') return { legTexts, ferryLegs };
    route.legs.forEach((leg, k) => {
      const stop = mapPlan.drives[i].stops[legStops[k]];
      if (!stop) return;
      legTexts[stop.id] = `${miles(leg.metres)} · ${time(leg.seconds)}`;
      if (leg.ferry) ferryLegs.add(stop.id);
    });
    return { legTexts, ferryLegs };
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

  const stop = sheet?.stop;
  const stopIndex = stop ? atDrive.stops.findIndex((s) => s.id === stop.id) : -1;
  // A place you stay at ends its day; the last place of a day (not the trip's) is where you stay.
  const staying = stop && stopIndex === atDrive.stops.length - 1 && at < plan.drives.length - 1;
  // The last place a stop can move down to: above the day's stay, if it has one.
  const lastMovable = atDrive.stops.length - (at < plan.drives.length - 1 ? 2 : 1);
  const stay = stop && !stop.roadId && !locked
    ? staying
      ? {
          icon: 'bedtime',
          label: 'Don’t stay here',
          detail: `Joins Day ${at + 1} and Day ${at + 2} into one`,
          onPress: act(() => joinPlanDriveWithNext(atDrive.id)),
        }
      : {
          icon: 'bedtime',
          label: 'Stay overnight here',
          detail: `Day ${at + 1} ends here and Day ${at + 2} starts here the next morning`,
          onPress: act(() => splitPlanDriveAt(stop.id)),
        }
    : null;
  // The timeline: the whole route on All (one list, days formed around the
  // stays), or one day's. Its leg texts are every shown day's together.
  const shownDays = (all ? plan.drives.map((_, i) => i) : [picked]).map((i) => ({
    index: i,
    start: driveStart(plan, i),
    stops: mapPlan.drives[i].stops,
    last: i === plan.drives.length - 1,
  }));
  const shownLegs = shownDays.map((d) => legsOf(d.index));
  const timeline = (
    <PlanTimeline
      days={shownDays}
      legTexts={Object.assign({}, ...shownLegs.map((l) => l.legTexts))}
      ferryLegs={new Set(shownLegs.flatMap((l) => [...l.ferryLegs]))}
      colorOf={colorOf}
      numbered={plan.drives.length > 1}
      onBackPress={locked ? undefined : () => setMenu('back')}
      onStopPress={(s, day) => setMenu({ stop: s, at: day })}
      onStartPress={(day) => setMenu({ start: true, at: day })}
      onArrange={(groups) =>
        arrangePlanStops(groups.map((stopIds, k) => ({ planDriveId: plan.drives[shownDays[k].index].id, stopIds })))
          .then(reload)
          .catch((err) => console.warn('[plan] move failed', err))
      }
      locked={locked}
    />
  );

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
            label={`Day ${picked + 1}`}
            accessibilityLabel={`Start day ${picked + 1}`}
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
        visible={!!sheet?.start}
        message={`Where Day ${at + 1} starts`}
        actions={[
          at === 0
            ? {
                icon: 'my_location',
                label: 'Wherever you are',
                detail: 'Where the phone is when you start',
                selected: !atDrive.start,
                onPress: act(() => setPlanDriveStart(atDrive.id, null)),
              }
            : {
                icon: 'bedtime',
                label: 'Where you stayed',
                detail: `${followOn?.name ?? 'Your overnight stop'} · moves if the stay changes`,
                selected: !atDrive.start,
                onPress: act(() => setPlanDriveStart(atDrive.id, null)),
              },
          {
            icon: 'edit_location_alt',
            label: 'Start somewhere else',
            detail: at === 0 ? 'Pick a place, or drop a pin' : 'After a ferry, train or hire car',
            selected: !!atDrive.start,
            onPress: () => pickPlace('start', at),
          },
        ]}
        onClose={() => setMenu(null)}
      />
      <ActionSheet
        visible={menu === 'back'}
        message="A round trip ends back where Day 1 starts"
        actions={[
          {
            icon: 'arrow_forward',
            label: 'Make it one way',
            detail: `Day ${plan.drives.length} ends at its last stop`,
            onPress: act(() => setPlanRoundTrip(plan.id, false)),
          },
        ]}
        onClose={() => setMenu(null)}
      />
      <ActionSheet
        visible={!!stop}
        message={stop ? (stop.roadId ? getRoad(stop.roadId)?.name : (stop.name ?? 'Dropped pin')) : null}
        actions={[
          ...(stay ? [stay] : []),
          // A stay keeps its place (drag it on All to move it), and nothing moves below it.
          ...(stopIndex > 0 && !staying
            ? [{ icon: 'expand_less', label: 'Move up', onPress: act(() => movePlanStop(stop.id, stopIndex - 1)) }]
            : []),
          ...(stop && stopIndex < lastMovable
            ? [{ icon: 'expand_more', label: 'Move down', onPress: act(() => movePlanStop(stop.id, stopIndex + 1)) }]
            : []),
          ...(stop
            ? [
                {
                  icon: 'delete',
                  label: stop.roadId ? 'Remove Iconic Road' : 'Remove stop',
                  style: 'destructive',
                  // Removing where you stay removes the stay too: the day joins the next.
                  onPress: act(async () => {
                    await deletePlanStop(stop.id);
                    if (staying) await joinPlanDriveWithNext(atDrive.id);
                  }),
                },
              ]
            : []),
        ]}
        onClose={() => setMenu(null)}
      />

      <TitleBlock kicker={planKicker(plan)} title={plan.name} />

      {/* All, where the route is planned, then a tab per day, once there's more than one. */}
      {plan.drives.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsScroll}
          contentContainerStyle={styles.tabs}
          role="radiogroup"
        >
          <FilterChip label="All" selected={all} onPress={() => setTab(null)} />
          {plan.drives.map((d, i) => (
            <FilterChip
              key={d.id}
              label={`Day ${i + 1}`}
              dot={colorOf(i)}
              selected={i === tab}
              onPress={() => setTab(i)}
            />
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.heading}>
        <Text style={[type.section, styles.text]} numberOfLines={2}>
          {all ? tripName : finish ? routeName : `From ${start?.name ?? 'your location'}`}
        </Text>
        <Text style={[type.bodySmall, styles.muted]}>
          {[
            // A day going straight somewhere (home, on a round trip) has its miles, not "No stops yet".
            shownStops === 0 ? (wayStops.length ? null : 'No stops yet') : `${shownStops} ${shownStops === 1 ? 'stop' : 'stops'}`,
            routeSummary,
          ]
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

      {timeline}

      {locked ? (
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
  tabsScroll: { flexGrow: 0, marginTop: spacing.md, marginHorizontal: -spacing.md },
  tabs: { gap: 8, paddingHorizontal: spacing.md },
  heading: { marginTop: 20, marginBottom: 10, marginHorizontal: 4, gap: 2 },
  buttons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  button: { flex: 1 },
  text: { color: c.text },
  muted: { color: c.textMuted },
  regular: { fontFamily: type.body.fontFamily },
  flex: { flex: 1, minWidth: 0 },
  lockedNote: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, marginHorizontal: 4 },
  link: { color: c.accent, fontFamily: type.bodyStrong.fontFamily },
});

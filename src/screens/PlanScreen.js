import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

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
  movePlanStop,
  renamePlan,
  setPlanDriveStart,
  setPlanStartDate,
} from '../storage/planStorage';
import { addVehicle, updateVehicle } from '../storage/vehicleStorage';
import { dayColorFor, pressedOpacity, spacing, type } from '../theme';
import { formatDistance, formatDurationShort } from '../utils/format';
import { driveCost, formatDriveCost } from '../utils/fuel';
import { ICONIC_ROADS, getRoad, roadPlace } from '../utils/iconicRoads';
import {
  driveMarkers,
  driveReach,
  driveStart,
  fromHere,
  planKicker,
  planHandover,
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
  // 'options' | 'edit' | 'road' | 'start' | 'vehicle' | 'price' | 'go' | 'nav' | { stop }
  const [menu, setMenu] = useState(null);
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

  // A copied ready-made route can't be changed for now: its drives and stops are as they came.
  const locked = !!plan.routeId;
  // "Fort William → Applecross"; Drive 1 with no start runs from wherever you are.
  const routeName = finish ? `${start?.name ?? 'Your location'} → ${finish.name ?? 'Dropped pin'}` : null;
  // What Start drive hands the sat nav, from the plan as saved (not the map's fromHere).
  const handover = drive.stops.length ? planHandover(plan, picked, { here, app: navApp }) : null;

  const markers = driveMarkers(mapPlan, picked).map((m) => ({ ...m, color: colorOf(picked) }));

  // Miles and times for the picked drive: '142 mi · 3h 10m', and each leg's.
  const { status, route, legStops } = routes.picked;
  const miles = (metres) => formatDistance(metres, units, metres < 16000 ? 1 : 0);
  const time = (seconds) => formatDurationShort(seconds * 1000);
  let routeSummary = null;
  if (status === 'done') routeSummary = `${miles(route.metres)} · ${time(route.seconds)}`;
  else if (status === 'failed' || status === 'limited') routeSummary = 'Road times unavailable right now';
  // '£19 fuel' (or '£8 charging') once the car's own figure and its price are
  // both set; until then, a link to add them.
  const electric = !!vehicle?.electric;
  const priceKind = electric ? 'charge' : 'fuel';
  const pounds =
    status === 'done' && vehicle
      ? driveCost(route.metres, vehicle, { fuel: prices.fuel?.price, charge: prices.charge?.price })
      : null;
  if (pounds != null) routeSummary += ` · ${formatDriveCost(pounds, electric)}`;
  const askCost = status === 'done' && pounds == null && vehicles != null;
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
      footer={
        <Button
          label={`Start drive ${picked + 1}`}
          icon="play_arrow"
          disabled={!drive.stops.length}
          onPress={() => setMenu('go')}
        />
      }
    >
      <StartDriveSheet
        visible={menu === 'go'}
        number={picked + 1}
        route={routeName}
        detail={status === 'done' ? routeSummary : null}
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
          { icon: 'edit', label: 'Edit name and date', onPress: () => setMenu('edit') },
          ...(plan.drives.length > 1 && !locked
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
          {finish ? routeName : `From ${start?.name ?? 'your location'}`}
        </Text>
        <Text style={[type.bodySmall, styles.muted]}>
          {[stops === 0 ? 'No stops yet' : `${stops} ${stops === 1 ? 'stop' : 'stops'}`, routeSummary]
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

      <PlanTimeline
        legTexts={legTexts}
        drive={drive}
        index={picked}
        start={start}
        color={colorOf(picked)}
        onStopPress={(s) => setMenu({ stop: s })}
        onStartPress={locked ? undefined : () => setMenu('start')}
        onMove={(s, position) => movePlanStop(s.id, position).then(reload).catch((err) => console.warn('[plan] move failed', err))}
        locked={locked}
      />

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

import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import * as Updates from 'expo-updates';
import { ActivityIndicator, Pressable, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ActionSheet from '../components/ActionSheet';
import CountriesSection from '../components/countries/CountriesSection';
import DetailLayout from '../components/detail/DetailLayout';
import FuelCostRow from '../components/detail/FuelCostRow';
import { DetailsCard, HeroStats, TitleBlock } from '../components/detail/TripStats';
import LongDayNote from '../components/plan/LongDayNote';
import PlanSheet from '../components/plan/PlanSheet';
import PlanTimeline from '../components/plan/PlanTimeline';
import StartDriveSheet from '../components/plan/StartDriveSheet';
import NavAppSheet from '../components/NavAppSheet';
import RouteMap from '../components/RouteMap';
import { showDialog } from '../components/ui/DialogHost';
import FilterChip from '../components/ui/FilterChip';
import FloatingButton from '../components/ui/FloatingButton';
import Icon from '../components/ui/Icon';
import ListRow from '../components/ui/ListRow';
import PillRow from '../components/ui/PillRow';
import SectionHeader from '../components/ui/SectionHeader';
import StatRow from '../components/ui/StatRow';
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
import { dayColorFor, floating, pressedOpacity, spacing, type } from '../theme';
import { lineCountryRows } from '../utils/countries';
import { formatDistance, formatDurationShort } from '../utils/format';
import { lineLength } from '../utils/geoMath';
import { planLink } from '../utils/planLink';
import { driveCost, formatDriveCost, pricesForPlan } from '../utils/fuel';
import { ICONIC_ROADS, getRoad, roadPlace } from '../utils/iconicRoads';
import {
  addPosition,
  driveMarkers,
  driveReach,
  driveRoute,
  driveRouteName,
  driveStart,
  mapPlanOf,
  planKicker,
  planHandover,
  planOutline,
  planRouteName,
  roadStop,
  LONG_DAY_S,
  legMetresAlong,
  stopCounts,
  withWayBack,
} from '../utils/plans';

// Share sends a viameter.app link, which opens the app only once the website
// is live, so it shows on test builds only until then.
const SHARE_PLANS = __DEV__ || Updates.channel !== 'production';

/** Under the timeline: adds to the shown day (Add stop, Add Iconic Road), a row rather than a button. */
function AddRow({ icon, iconColor, filled = false, label, onPress }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.addRow, pressed && styles.pressed]}
    >
      <View style={styles.addRail}>
        <Icon name={icon} size={22} color={iconColor ?? c.accent} filled={filled} />
      </View>
      <Text style={[type.bodyStrong, styles.addLabel]}>{label}</Text>
    </Pressable>
  );
}

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
  // 'options' | 'edit' | 'road' | 'back' | 'go' | 'nav' | { stop, at } | { start, at }
  // (`at`: the day the stop or start is in)
  const [menu, setMenu] = useState(null);
  const [sheet, setSheet] = useState(null); // the last { stop } or { start } menu, kept while it closes
  const [dragging, setDragging] = useState(false); // a stop is being dragged: the page holds still
  const { here, fix, ready: hereReady } = useHere();
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
  const routes = usePlanRoutes(mapPlan, tab, hereReady);
  const { units, prices, ukFuelWeeks, navApp } = useSettings();
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
  const act = (fn) => () => {
    setMenu(null);
    fn().then(reload).catch((err) => console.warn('[plan] change failed', err));
  };

  // The day a sheet is about (a stop's, or a start's), and where new stops go:
  // the day's tab, or on All the end of the trip.
  // Only a stop's or a start's sheet is an object; the rest are names (and a
  // name's `.at` is String's own function, so never read it off one). The last
  // one opened is kept while it slides away, so it doesn't flick to Day 1 (or
  // empty) on the way out; capped in case days were joined meanwhile.
  if (menu && typeof menu === 'object' && menu !== sheet) setSheet(menu);
  const at = Math.min(sheet?.at ?? picked, plan.drives.length - 1);
  const atDrive = plan.drives[at];
  const addAt = tab ?? plan.drives.length - 1;
  const pickPlace = (mode, day = addAt) => {
    setMenu(null);
    router.push({ pathname: '/plans/add-stop', params: { plan: plan.id, drive: day, mode } });
  };
  // Where the day would start if it followed on (Day 1: wherever the phone is).
  const followOn = driveStart({ ...plan, drives: plan.drives.map((d) => (d === atDrive ? { ...d, start: null } : d)) }, at);
  const addRoad = (road) =>
    act(() => addPlanStop(plan.drives[addAt].id, roadStop(plan, addAt, road), addPosition(plan, addAt)))();
  // "Scotland 2027: 3 days, Brighton → Inverness, 2 Iconic Roads", then the link.
  const sharePlan = () => {
    const days = plan.drives.length;
    const { roads } = stopCounts(plan);
    const message = [
      `${plan.name}: ${days} ${days === 1 ? 'day' : 'days'}`,
      planRouteName(plan, here),
      roads ? `${roads} ${roads === 1 ? 'Iconic Road' : 'Iconic Roads'}` : null,
    ]
      .filter(Boolean)
      .join(', ');
    Share.share({ message: `${message}\n${planLink(plan)}` }).catch((err) => console.warn('[plan] share failed', err));
  };
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

  // A copied Iconic Trip can't be changed for now: its days and stops are as they came.
  const locked = !!plan.routeId;
  // "Fort William → Applecross"; Drive 1 with no start runs from wherever you are.
  const routeName = driveRouteName(plan, picked, here);
  // All: where the trip starts and where it ends.
  const tripName = planRouteName(plan, here);
  const lastIndex = plan.drives.length - 1;
  const tripGoesHome = !!mapPlan.drives[lastIndex].stops.at(-1)?.home;
  // What Start drive hands the sat nav, from the plan as saved (not the map's fromHere).
  // How far from the day's start by the real position (null until known: then it goes to the start first).
  const handover = wayStops.length ? planHandover(wayPlan, picked, { here: fix, app: navApp }) : null;

  // The picked drive's start, stops and finish; on All, where the trip starts,
  // each night's stay (red, as each drive's finish) and where the trip ends.
  // Green start and red finish, as on a driven trip's map; stops in the drive's colour.
  const markerColor = { start: c.start, finish: c.finish, stop: colorOf(picked) };
  let markers = driveMarkers(mapPlan, picked).map((m) => ({ ...m, color: markerColor[m.kind] }));
  if (all) {
    const first = driveMarkers(mapPlan, 0).filter((m) => m.kind === 'start');
    const nights = mapPlan.drives
      .slice(0, lastIndex)
      .flatMap((_, i) => driveMarkers(mapPlan, i).filter((m) => m.kind === 'finish'))
      .map((m, i) => ({ ...m, key: `night-${i}`, color: c.finish }));
    const end = driveMarkers(mapPlan, lastIndex).filter((m) => m.kind === 'finish');
    markers = [
      ...nights,
      ...first.map((m) => ({ ...m, key: 'trip-start', color: c.start })),
      ...end.map((m) => ({ ...m, key: 'trip-finish', color: c.finish })),
    ];
    // A round trip starts and ends in the same place: one dot.
    if (tripGoesHome) markers = markers.filter((m) => m.key !== 'trip-start');
  }

  // Miles and times: '142 mi · 3h 10m', for the picked drive or (All) the whole
  // trip once every drive has come back, and each leg's.
  const miles = (metres) => formatDistance(metres, units);
  const time = (seconds) => formatDurationShort(seconds * 1000);
  // '~£19 fuel' (or '~£8 charging') once the car's own figure and its price are
  // both set; until then, nothing.
  const electric = !!vehicle?.electric;
  const summaryOf = (results) => {
    const asked = results.filter((r) => r.status !== 'none');
    if (asked.some((r) => r.status === 'failed' || r.status === 'limited')) {
      return { status: 'failed', text: 'Road times unavailable' };
    }
    if (!asked.length || asked.some((r) => r.status !== 'done')) return { status: asked.length ? 'loading' : 'none' };
    // Miles on the road (a ferry's crossing isn't driven, so isn't in the fuel either); time door to door.
    // A ferry is marked on its leg in the timeline (a boat), not here, so the line stays short.
    const metres = asked.reduce((sum, r) => sum + r.route.metres, 0);
    const seconds = asked.reduce((sum, r) => sum + r.route.seconds, 0);
    const pounds = vehicle ? driveCost(metres, vehicle, pricesForPlan(prices, ukFuelWeeks, vehicle)) : null;
    const cost = pounds != null ? formatDriveCost(pounds, electric, units) : null;
    return { status: 'done', text: `${miles(metres)} · ${time(seconds)}${cost ? ` · ${cost}` : ''}`, metres, seconds, cost };
  };
  // Miles before (or without) Google's road times: measured along the saved road
  // lines, once every day counted (those going somewhere) has one; null otherwise.
  const lineMetresOf = (indexes) => {
    const days = indexes.filter((i) => mapPlan.drives[i].stops.length);
    return days.length && days.every((i) => routes.lines[i])
      ? days.reduce((sum, i) => sum + lineLength(routes.lines[i]), 0)
      : null;
  };
  const tripLineMetres = lineMetresOf(plan.drives.map((_, i) => i));
  const lineMetres = all ? tripLineMetres : lineMetresOf([picked]);
  // The title's line is the whole trip's; a picked day has its own under the day pills.
  const tripSummary = summaryOf(routes.drives);
  const daySummary = summaryOf([routes.drives[picked]]);
  const summary = all ? tripSummary : daySummary;
  // Start drive's sheet is always about one drive.
  const goSummary = daySummary;
  // The Distance shown: Google's road miles, else the saved lines' (null until either is in).
  const shownMetres = summary.status === 'done' ? summary.metres : lineMetres;
  // Fuel from those miles, so it shows either way; null until the car's figure and a price are there.
  const shownPounds =
    vehicle && shownMetres != null
      ? driveCost(shownMetres, vehicle, pricesForPlan(prices, ukFuelWeeks, vehicle))
      : null;
  const shownStops = stopCounts(plan, all ? null : picked).stops;
  // Countries from the road lines, once every day going somewhere has one.
  const goingDays = (all ? plan.drives.map((_, i) => i) : [picked]).filter((i) => mapPlan.drives[i].stops.length);
  const countryRows =
    goingDays.length && goingDays.every((i) => routes.lines[i])
      ? lineCountryRows(
          goingDays.map((i) => routes.lines[i]),
          goingDays.map((i) => i + 1),
          { scaleToM: shownMetres, withDays: all && plan.drives.length > 1 }
        )
      : [];
  // Days with more driving than most people manage, flagged on All.
  const longDays = routes.drives
    .map((d, i) => ({ i, seconds: d.status === 'done' ? d.route.seconds : 0 }))
    .filter((d) => d.seconds > LONG_DAY_S);
  // Drive i's leg texts and which legs take a ferry, by the id of the stop each leg arrives at.
  const legsOf = (i) => {
    const { status, route, legStops } = routes.drives[i];
    const legTexts = {};
    const ferryLegs = new Set();
    if (status !== 'done') {
      // No road times: each leg's miles along the saved road line, the time to come.
      const ask = routes.lines[i] ? driveRoute(mapPlan, i) : null;
      if (ask) {
        legMetresAlong(routes.lines[i], ask.points).forEach((metres, k) => {
          const stop = mapPlan.drives[i].stops[legStops[k]];
          if (stop) legTexts[stop.id] = miles(metres);
        });
      }
      return { legTexts, ferryLegs };
    }
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
      onDragging={setDragging}
      locked={locked}
    />
  );

  return (
    <DetailLayout
      map={map}
      scrollEnabled={!dragging}
      actions={[
        // As a trip's: Share beside the menu. The plan goes inside the link.
        ...(SHARE_PLANS ? [{ icon: 'share', label: 'Share', onPress: sharePlan }] : []),
        { icon: 'more_vert', label: 'More options', onPress: () => setMenu('options') },
      ]}
      floating={
        // Starts the picked drive (on All, the next one not yet driven), once it goes somewhere.
        wayStops.length ? (
          <FloatingButton
            icon="play_arrow"
            filled
            iconColor={c.start}
            label={all || plan.drives.length === 1 ? 'Start' : `Day ${picked + 1}`}
            accessibilityLabel={plan.drives.length === 1 ? 'Start' : `Start Day ${picked + 1}`}
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
      <ActionSheet
        visible={menu === 'road'}
        actions={[...ICONIC_ROADS]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((road) => ({
            key: road.id,
            icon: 'landscape',
            label: road.name,
            detail: roadPlace(road),
            onPress: () => addRoad(road),
          }))}
        onClose={() => setMenu(null)}
      />
      <ActionSheet
        visible={!!menu?.start}
        message={`Day ${at + 1} starts from`}
        actions={[
          at === 0
            ? {
                icon: 'my_location',
                label: 'Your location',
                selected: !atDrive.start,
                onPress: act(() => setPlanDriveStart(atDrive.id, null)),
              }
            : {
                // The place you stayed, by name: it follows the stay if that changes.
                icon: 'bedtime',
                label: followOn?.name ?? 'Where you stayed',
                selected: !atDrive.start,
                onPress: act(() => setPlanDriveStart(atDrive.id, null)),
              },
          {
            icon: 'edit_location_alt',
            label: 'New location',
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
        visible={!!menu?.stop}
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

      {/* As a trip's page: where it goes under its name. */}
      {/* PLANNED, where a past trip's page says DRIVEN, so the two can't be mixed up. */}
      <TitleBlock kicker={`PLANNED · ${planKicker(plan)}`} title={plan.name} subtitle={tripName} />

      {/* All, where the route is planned, then a tab per day, once there's more than one. */}
      {plan.drives.length > 1 ? (
        <PillRow
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
        </PillRow>
      ) : null}

      {/* A picked day: where it goes, as a trip's picked day has. */}
      {all ? null : (
        <View style={styles.heading}>
          <Text style={[type.section, styles.text]} numberOfLines={2}>
            {finish ? routeName : `From ${start?.name ?? 'your location'}`}
          </Text>
        </View>
      )}

      {/* The trip page's headline, once the roads are in. */}
      {summary.status === 'done' || lineMetres != null ? (
        <HeroStats
          stats={{
            distanceM: summary.status === 'done' ? summary.metres : lineMetres,
            movingTimeMs: (summary.seconds ?? 0) * 1000,
          }}
          units={units}
          longDay={(!all || plan.drives.length === 1) && summary.seconds > LONG_DAY_S}
          // Hidden for the second the times take; said plainly when they can't be had.
          showTime={summary.status === 'done' || summary.status === 'failed'}
          timeNote={summary.status === 'failed' ? '—' : null}
        />
      ) : summary.status === 'failed' ? (
        // No road times and no saved lines to measure: just say so, where the time goes.
        <StatRow style={styles.aloneTime} stats={[{ icon: 'timer', label: 'Driving time', value: '—' }]} />
      ) : null}
      {all && plan.drives.length > 1
        ? longDays.map(({ i, seconds }) => (
            <LongDayNote key={plan.drives[i].id} day={i + 1} seconds={seconds} onPress={() => setTab(i)} />
          ))
        : null}

      {/* Route, as an Iconic Trip's day-by-day list is; a past trip's is its Timeline. */}
      <SectionHeader title="Route" />
      {timeline}

      {locked ? null : (
        <View style={styles.addRows}>
          <AddRow icon="add_location_alt" label="Add stop" onPress={() => pickPlace('stop')} />
          <AddRow icon="landscape" iconColor={c.ringNumber} filled label="Add Iconic Road" onPress={() => setMenu('road')} />
        </View>
      )}

      {/* As a trip's page: its countries, then Details, for All or the picked day. */}
      <CountriesSection rows={countryRows} units={units} scope={all ? 'trip' : 'day'} />
      {shownStops || (shownMetres != null && vehicles != null) ? (
        <DetailsCard>
          {shownStops ? (
            <ListRow
              icon="local_cafe"
              title="Rest stops"
              value={String(shownStops)}
              strongValue
              dense
              divider={shownMetres != null && vehicles != null}
            />
          ) : null}
          {shownMetres != null && vehicles != null ? (
            <FuelCostRow
              pounds={shownPounds}
              vehicle={vehicle}
              vehicles={vehicles}
              onVehiclesChanged={reloadVehicles}
            />
          ) : null}
        </DetailsCard>
      ) : null}
    </DetailLayout>
  );
}

const makeStyles = (c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  noMap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: c.mapLand },
  tabsScroll: { flexGrow: 0, marginTop: spacing.md, marginHorizontal: -spacing.md },
  tabs: { gap: 8, paddingHorizontal: spacing.md },
  heading: { marginTop: 20, marginHorizontal: 4, gap: 2 },
  aloneTime: { marginTop: 20 },
  // A gap, not a line, keeps them apart from the last stop; the icon sits in the timeline's rail.
  addRows: { marginTop: spacing.md },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  addRail: { width: 22, alignItems: 'center' },
  addLabel: { color: c.accent },
  pressed: { opacity: pressedOpacity },
  text: { color: c.text },
  muted: { color: c.textMuted },
});

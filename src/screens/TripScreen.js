import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { showDialog } from '../components/ui/DialogHost';
import ActionSheet from '../components/ActionSheet';
import ChartsCard from '../components/charts/ChartsCard';
import TripPhotos from '../components/photos/TripPhotos';
import CountriesSection from '../components/countries/CountriesSection';
import PrintBanner from '../components/poster/PrintBanner';
import DetailLayout from '../components/detail/DetailLayout';
import { routeMarkers, stopMarkerKey, stopMarkers } from '../components/detail/mapMarkers';
import Timeline from '../components/detail/Timeline';
import IconicRoadsSection from '../components/roads/IconicRoadsSection';
import { DetailsRows, HeroStats, TitleBlock } from '../components/detail/TripStats';
import VehicleSection from '../components/detail/VehicleSection';
import EditTripSheet from '../components/EditTripSheet';
import LinkPlanDriveSheet from '../components/LinkPlanDriveSheet';
import MoveDriveSheet from '../components/MoveDriveSheet';
import RouteMap from '../components/RouteMap';
import FilterChip from '../components/ui/FilterChip';
import { useSettings } from '../context/SettingsContext';
import { usePhotos } from '../hooks/usePhotos';
import { usePremium } from '../hooks/usePremium';
import { useRoadTotals } from '../hooks/useRoadTotals';
import { useStyles, useTheme } from '../hooks/useTheme';
import { ensureDrivePlaces } from '../services/placeService';
import { deleteDrive, getDrivePoints } from '../storage/driveStorage';
import { getPlanDriveLinks, linkDriveToPlan } from '../storage/planStorage';
import { getTripCompletions } from '../storage/roadStorage';
import { deleteTrip, getTrip, updateTrip } from '../storage/tripStorage';
import { listVehicles, setDriveVehicle } from '../storage/vehicleStorage';
import { dayColorFor, type } from '../theme';
import {
  formatDate,
  formatDayDate,
  formatTime,
  tripKicker,
} from '../utils/format';
import { routeGaps, routeSegments, withoutCrossings } from '../utils/crossings';
import { averageMovingSpeed, downsample } from '../utils/geoMath';
import { getRoad } from '../utils/iconicRoads';
import { exportTrip } from '../services/exportService';
import { countryRows } from '../utils/countries';
import { buildDriveTimeline, buildTripTimeline } from '../utils/timeline';
import { vehicleLabel } from '../utils/vehicles';
import {
  deleteTripMessage,
  driveElapsedMs,
  groupIntoDays,
  oneWayLabel,
  summarizeDrives,
  tripOneWayLabel,
  tripTitle,
} from '../utils/tripSummary';

// Keep the whole-trip map responsive however many drives it has.
const MAX_MAP_POINTS = 3000;

export default function TripScreen() {
  // `drive` opens on the day of one of the trip's drives (e.g. from an Iconic Road).
  const { id, drive: driveParam } = useLocalSearchParams();
  const { units } = useSettings();
  const premium = usePremium();
  const roadTotals = useRoadTotals();
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const [trip, setTrip] = useState(null);
  const [completions, setCompletions] = useState([]); // Iconic Roads on this trip
  const [pointsByDrive, setPointsByDrive] = useState(null); // driveId -> points
  const [missing, setMissing] = useState(false);
  const [menu, setMenu] = useState(null); // null | 'options' | 'edit' | 'drive' | 'move' | 'link' | 'vehicle'
  // The tab: a day's number, or null for All; until one's tapped, the day of `drive`.
  const [pickedDay, setPickedDay] = useState(undefined);
  const [menuDriveId, setMenuDriveId] = useState(null); // the drive whose ⋮ was tapped
  const [vehicles, setVehicles] = useState([]); // the Garage
  const [loads, setLoads] = useState(0); // bumped to load the trip again (after deleting or linking a drive)
  // The plans the trip's drives were planned as: planned drive id → { planId, planName, number }.
  const [planLinks, setPlanLinks] = useState(new Map());
  const [focusedStop, setFocusedStop] = useState(null); // { driveId, time }: a Timeline stop on All
  const {
    photos,
    access: photoAccess,
    allow: allowPhotos,
  } = usePhotos([[trip?.drives[0]?.startedAt, trip?.drives.at(-1)?.endedAt]]); // the whole trip, overnights too
  const scrollRef = useRef(null);
  const mapRef = useRef(null);

  const setDrivePlaces = (driveId, places) =>
    setTrip((prev) => ({
      ...prev,
      drives: prev.drives.map((d) => (d.id === driveId ? { ...d, places } : d)),
    }));

  // Reload on focus so edits made on a drive (move, delete) show up here.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const t = await getTrip(Number(id));
        if (cancelled) return;
        if (!t || t.drives.length === 0) {
          setMissing(true);
          return;
        }
        const [roads, garage, links] = await Promise.all([
          getTripCompletions(t.id),
          listVehicles(),
          getPlanDriveLinks(t.drives.map((d) => d.planDriveId)),
        ]);
        if (cancelled) return;
        setVehicles(garage);
        setPlanLinks(links);
        setTrip(t);
        setCompletions(roads);
        // The page shows now; the map, Timeline and charts follow once the
        // GPS points (the slow part) are read.
        const all = await Promise.all(t.drives.map((d) => getDrivePoints(d.id)));
        if (cancelled) return;
        setPointsByDrive(new Map(t.drives.map((d, i) => [d.id, all[i]])));
        // Fill in place names that couldn't be looked up when the drive ended.
        const oneDay = groupIntoDays(t.drives).length === 1;
        for (const d of t.drives) {
          const places = await ensureDrivePlaces(d, { includeStops: oneDay });
          if (cancelled) return;
          setDrivePlaces(d.id, places);
        }
      })().catch((err) => console.warn('[trip] load failed', err));
      return () => {
        cancelled = true;
      };
      // `loads` is in the list only to load again after a drive is deleted or linked.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, loads])
  );

  const days = useMemo(() => (trip ? groupIntoDays(trip.drives) : []), [trip]);
  // The picked day (tabs show for a trip of more than one day): its number, or null for All.
  const paramDay = driveParam
    ? (days.find((day) => day.drives.some((d) => d.id === Number(driveParam)))?.number ?? null)
    : null;
  const dayNo = days.length > 1 ? (pickedDay === undefined ? paramDay : pickedDay) : null;
  const dayDrives = dayNo ? (days[dayNo - 1]?.drives ?? null) : null;
  // What All's sections cover: the picked day's drives, or the whole trip.
  const viewDrives = useMemo(() => (trip ? (dayDrives ?? trip.drives) : []), [trip, dayDrives]);
  const summary = useMemo(() => (viewDrives.length ? summarizeDrives(viewDrives) : null), [viewDrives]);
  // Drives that are just an Iconic Road keep their times hidden, so trip totals leave them out.
  const hiddenCount = viewDrives.filter((d) => d.stats.timesHidden).length;
  const timeSummary = useMemo(
    () => (viewDrives.length ? summarizeDrives(viewDrives.filter((d) => !d.stats.timesHidden)) : null),
    [viewDrives]
  );
  // The whole trip's timeline (Overnight rows between days), for All; a day's rows for its tab.
  const timeline = useMemo(() => {
    const items = trip && pointsByDrive ? buildTripTimeline(trip, pointsByDrive) : [];
    return dayNo ? items.filter((item) => item.day === dayNo) : items;
  }, [trip, pointsByDrive, dayNo]);

  const dayColorOf = useCallback(
    (n) => (days.length > 1 ? dayColorFor(c, n) : c.accent),
    [days, c]
  );

  // A trip of one drive is that drive, and so is a picked day of one drive (the
  // usual day); a day of several drives, or All, is null.
  const selectedId =
    trip?.drives.length === 1 ? trip.drives[0].id : dayDrives?.length === 1 ? dayDrives[0].id : null;

  // A picked drive shows its rest stops (and border towns) by name; the first
  // time it's picked, fill in any names the trip view didn't need.
  const selectedDrive = trip?.drives.find((d) => d.id === selectedId);
  const driveTimeline = useMemo(
    () =>
      selectedDrive && pointsByDrive
        ? buildDriveTimeline(selectedDrive, pointsByDrive.get(selectedDrive.id) ?? [])
        : [],
    [selectedDrive, pointsByDrive]
  );
  const named = useRef(new Set());
  useEffect(() => {
    if (!selectedDrive || named.current.has(selectedDrive.id)) return;
    named.current.add(selectedDrive.id);
    ensureDrivePlaces(selectedDrive, { includeStops: true })
      .then((places) => setDrivePlaces(selectedDrive.id, places))
      .catch((err) => console.warn('[trip] stop names failed', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const segments = useMemo(() => {
    if (!trip || !pointsByDrive) return [];
    const perDrive = Math.max(200, Math.floor(MAX_MAP_POINTS / trip.drives.length));
    return days.flatMap((day) =>
      day.drives.flatMap((d) =>
        routeSegments(
          `drive-${d.id}`,
          downsample(pointsByDrive.get(d.id) ?? [], perDrive).map(
            ({ latitude, longitude, timestamp }) => ({ latitude, longitude, timestamp })
          ),
          routeGaps(d),
          // With one day picked, the others fade back.
          dayNo && day.number !== dayNo ? `${dayColorOf(day.number)}40` : dayColorOf(day.number)
        )
      )
    );
  }, [trip, pointsByDrive, days, dayColorOf, dayNo]);
  // Frame the picked day (the whole trip for All). From its points, not the
  // segments, so place names arriving don't move the map again.
  // The drives framed: the picked day's, or a trip's only drive (it's selected
  // without a tab, and its pins come from these points too).
  const fitIds = dayDrives ? dayDrives.map((d) => d.id).join(',') : selectedId ? String(selectedId) : '';
  const fitTo = useMemo(
    () =>
      fitIds && pointsByDrive
        ? fitIds.split(',').flatMap((id) =>
            downsample(pointsByDrive.get(Number(id)) ?? [], 200).map(({ latitude, longitude }) => ({
              latitude,
              longitude,
            }))
          )
        : undefined,
    [pointsByDrive, fitIds]
  );

  const driveColors = useMemo(
    () => new Map(days.flatMap((day) => day.drives.map((d) => [d.id, dayColorOf(day.number)]))),
    [days, dayColorOf]
  );

  // All shows no rest stops: a stop tapped in the Timeline gets its ring, and
  // once that's on the map the map zooms to it.
  useEffect(() => {
    if (focusedStop) {
      mapRef.current?.focusMarker(stopMarkerKey(focusedStop.driveId, focusedStop.time));
    }
  }, [focusedStop]);

  const tracks = useMemo(
    () =>
      days.flatMap((day) =>
        day.drives.filter((d) => viewDrives.includes(d)).map((d) => ({
          key: `drive-${d.id}`,
          color: dayColorOf(day.number),
          points: withoutCrossings(pointsByDrive?.get(d.id) ?? [], routeGaps(d)),
        }))
      ),
    [days, pointsByDrive, dayColorOf, viewDrives]
  );

  if (missing || !trip) {
    return (
      <View style={[styles.screen, styles.center]}>
        {missing ? (
          <Text style={[type.body, styles.muted]}>This trip no longer exists.</Text>
        ) : (
          <ActivityIndicator color={c.accent} />
        )}
      </View>
    );
  }

  const single = trip.drives.length === 1;
  const first = trip.drives[0];
  const last = trip.drives.at(-1);
  const title = tripTitle(trip) ?? formatDate(first.startedAt);
  // Show the route under the title when the user's own name is the title.
  const subtitle = trip.name ? tripOneWayLabel(trip) : null;

  // Every drive in view (the picked day's, or the trip's) is just an Iconic Road.
  const allHidden = hiddenCount === viewDrives.length;
  // Iconic Road rows name the drive ("Completed · Drive 2") when there's more than one.
  const driveOf =
    trip.drives.length > 1
      ? (driveId) => trip.drives.findIndex((d) => d.id === driveId) + 1
      : undefined;

  const showMap = () => scrollRef.current?.scrollTo({ y: 0, animated: true });
  // Timeline stop items carry their start time; find which drive they belong to.
  const showTripStop = (item) => {
    const drive = trip.drives.find((d) => d.stats.stops.some((s) => s.startedAt === item.time));
    showMap();
    if (drive) setFocusedStop({ driveId: drive.id, time: item.time });
  };

  const save = async (values) => {
    setMenu(null);
    await updateTrip(trip.id, values);
    setTrip((prev) => ({
      ...prev,
      name: values.name.trim() || null,
      notes: values.notes.trim() || null,
    }));
  };

  const selected = selectedDrive ?? null;
  const selectedLink = selected ? (planLinks.get(selected.planDriveId) ?? null) : null;
  const latestLink = [...trip.drives].reverse().map((d) => planLinks.get(d.planDriveId)).find(Boolean);
  const tripPlan = selectedLink ?? latestLink ?? null;
  // The drive whose ⋮ (on its Start row in the Timeline) was tapped, and its plan link.
  const menuDrive = trip.drives.find((d) => d.id === menuDriveId) ?? null;
  const menuLink = menuDrive ? (planLinks.get(menuDrive.planDriveId) ?? null) : null;
  const openDriveMenu = (driveId) => {
    setMenuDriveId(driveId);
    setMenu('drive');
  };
  const unlinkDrive = () => {
    setMenu(null);
    linkDriveToPlan(menuDrive.id, null)
      .then(() => setLoads((n) => n + 1))
      .catch((err) => console.warn('[trip] unlink failed', err));
  };
  const pick = (dayNumber) => {
    setPickedDay(dayNumber);
    setFocusedStop(null);
    showMap();
  };
  const dayNumberOf = (d) => days.find((day) => day.drives.includes(d))?.number ?? 1;
  // What the sections below cover: the picked drive, or the whole trip for All.
  const hideTimes = selected ? Boolean(selected.stats.timesHidden) : allHidden;
  const viewRoads = selected
    ? completions.filter((r) => r.driveId === selected.id)
    : completions.filter((r) => viewDrives.some((d) => d.id === r.driveId));
  const viewPhotos = selected
    ? photos.filter((p) => p.time >= selected.startedAt && p.time <= selected.endedAt)
    : dayDrives
      ? photos.filter((p) => p.time >= dayDrives[0].startedAt && p.time <= dayDrives.at(-1).endedAt)
      : photos;
  const viewCountries = selected
    ? countryRows([selected])
    : countryRows(viewDrives, days.length > 1 && !dayDrives ? { dayOf: dayNumberOf } : {});
  const usedVehicleIds = [...new Set(viewDrives.map((d) => d.vehicleId).filter((v) => v != null))];
  const viewVehicle = selected
    ? (vehicles.find((v) => v.id === selected.vehicleId) ?? null)
    : usedVehicleIds.length === 1
      ? (vehicles.find((v) => v.id === usedVehicleIds[0]) ?? null)
      : null;
  const chooseVehicle = (vehicleId) => {
    setMenu(null);
    setDriveVehicle(selected.id, vehicleId)
      .then(() =>
        setTrip((prev) => ({
          ...prev,
          drives: prev.drives.map((d) => (d.id === selected.id ? { ...d, vehicleId } : d)),
        }))
      )
      .catch((err) => console.warn('[trip] vehicle change failed', err));
  };
  const showDriveStop = (item) => {
    showMap();
    mapRef.current?.focusMarker(stopMarkerKey(selected.id, item.time));
  };
  const confirmDeleteDrive = () => {
    setMenu(null);
    showDialog({
      title: 'Delete this drive?',
      message: "Its route and stats will be removed from the trip. This can't be undone.",
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () =>
        deleteDrive(menuDrive.id).then(() => {
          setPickedDay(null);
          setLoads((n) => n + 1);
        }),
    });
  };

  const confirmDelete = () => {
    setMenu(null);
    showDialog({
      title: 'Delete this trip?',
      message: deleteTripMessage(trip, formatDate(first.startedAt)),
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () => deleteTrip(trip.id).then(() => router.back()),
    });
  };

  // On All, only the stop tapped in the Timeline (drawn under start and finish).
  const focusDrive =
    !selected && focusedStop && trip.drives.find((d) => d.id === focusedStop.driveId);
  const focusedStopMarkers = focusDrive
    ? stopMarkers(focusDrive, driveColors.get(focusDrive.id)).filter(
        (m) => m.key === stopMarkerKey(focusDrive.id, focusedStop.time)
      )
    : [];

  // Until the points are read, the map's blank background where it will be.
  const map = !pointsByDrive ? (
    <View style={styles.mapWaiting} />
  ) : (
    <RouteMap
      ref={mapRef}
      flat
      segments={segments}
      fitTo={fitTo}
      // A Timeline stop's ring goes when its card does.
      onSelect={(key) => key === null && setFocusedStop(null)}
      markers={[
        ...focusedStopMarkers,
        ...routeMarkers(
          selected
            ? {
                firstPoint: fitTo?.[0],
                lastPoint: fitTo?.at(-1),
                startName: selected.places.start,
                endName: selected.places.end,
                drives: [selected],
                c,
                colorOf: (d) => driveColors.get(d.id),
              }
            : {
                firstPoint: segments[0]?.coordinates[0],
                lastPoint: segments.at(-1)?.coordinates.at(-1),
                startName: first.places.start,
                endName: last.places.end,
                drives: [],
                c,
              }
        ),
      ]}
    />
  );

  return (
    <DetailLayout
      scrollRef={scrollRef}
      map={map}
      // Top right of the map: Share on its own (one tap), the rest in the menu.
      actions={[
        {
          icon: 'share',
          label: 'Share',
          onPress: () =>
            router.push(`/share?trip=${trip.id}${selected ? `&drive=${selected.id}` : ''}`),
        },
        { icon: 'more_vert', label: 'More options', onPress: () => setMenu('options') },
      ]}
    >
      <ActionSheet
        visible={menu === 'options'}
        actions={[
          // The plan this trip was driven from: the picked drive's, else the latest linked one's.
          ...(tripPlan
            ? [
                {
                  icon: 'bookmark',
                  label: 'Open the plan for this trip',
                  onPress: () => {
                    setMenu(null);
                    router.push(`/plans/${tripPlan.planId}`);
                  },
                },
              ]
            : []),
          { icon: 'edit', label: 'Edit name and notes', onPress: () => setMenu('edit') },
          {
            icon: 'download',
            label: 'Export as GPX',
            badge: premium ? null : 'Premium',
            // Free for everyone for now, though still badged: it goes behind Premium later.
            onPress: () => {
              setMenu(null);
              exportTrip(trip);
            },
          },
          { icon: 'delete', label: 'Delete trip', style: 'destructive', onPress: confirmDelete },
        ]}
        onClose={() => setMenu(null)}
      />
      {/* One drive's own actions, from the ⋮ on its Start row. */}
      <ActionSheet
        visible={menu === 'drive' && !!menuDrive}
        message={menuDrive ? `Drive ${trip.drives.indexOf(menuDrive) + 1}` : null}
        actions={
          menuDrive
            ? [
                // It can move to another trip, e.g. "Continue" was missed.
                {
                  icon: 'drive_file_move',
                  label: single ? 'Add to another trip' : 'Move this drive to another trip',
                  onPress: () => setMenu('move'),
                },
                // A drive recorded with plain Record can be put down to the planned day it was.
                menuLink
                  ? {
                      icon: 'link_off',
                      label: `Unlink from ${menuLink.planName}`,
                      detail: `Day ${menuLink.number}`,
                      onPress: unlinkDrive,
                    }
                  : { icon: 'link', label: 'Link to a planned day', onPress: () => setMenu('link') },
                ...(single
                  ? []
                  : [{ icon: 'delete', label: 'Delete this drive', style: 'destructive', onPress: confirmDeleteDrive }]),
              ]
            : []
        }
        onClose={() => setMenu(null)}
      />
      <EditTripSheet
        visible={menu === 'edit'}
        trip={trip}
        onSave={save}
        onClose={() => setMenu(null)}
      />
      {menuDrive ? (
        <LinkPlanDriveSheet
          visible={menu === 'link'}
          drive={menuDrive}
          onLinked={() => setLoads((n) => n + 1)}
          onClose={() => setMenu(null)}
        />
      ) : null}
      {menuDrive ? (
        <MoveDriveSheet
          visible={menu === 'move'}
          drive={menuDrive}
          allowNewTrip={!single}
          // Follow the drive to its new trip.
          onMoved={(tripId) => router.replace(`/trips/${tripId}?drive=${menuDrive.id}`)}
          onClose={() => setMenu(null)}
        />
      ) : null}
      <ActionSheet
        visible={menu === 'vehicle'}
        actions={vehicles.map((v) => ({
          key: String(v.id),
          label: vehicleLabel(v),
          detail: v.registration,
          selected: v.id === selected?.vehicleId,
          onPress: () => chooseVehicle(v.id),
        }))}
        onClose={() => setMenu(null)}
      />

      <TitleBlock
        kicker={
          allHidden && days.length === 1
            ? formatDayDate(first.startedAt).toUpperCase()
            : tripKicker(first.startedAt, last.endedAt, days.length, { withYear: true })
        }
        title={title}
        subtitle={subtitle}
        notes={trip.notes}
      />
      {days.length > 1 ? (
        // One page per trip: All, or one day at a time.
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pillScroll}
          contentContainerStyle={styles.pills}
          role="radiogroup"
        >
          <FilterChip label="All" selected={!dayNo} onPress={() => pick(null)} />
          {days.map((day) => (
            <FilterChip
              key={day.number}
              label={`Day ${day.number}`}
              dot={dayColorOf(day.number)}
              selected={day.number === dayNo}
              onPress={() => pick(day.number)}
            />
          ))}
        </ScrollView>
      ) : null}
      {dayDrives && dayDrives.length > 1 ? (
        // A day of more than one drive: where it went, and when.
        <View style={styles.picked}>
          <Text style={[type.section, styles.text]} numberOfLines={1}>
            {oneWayLabel({ start: dayDrives[0].places.start, end: dayDrives.at(-1).places.end }) ?? `Day ${dayNo}`}
          </Text>
          <Text style={[type.body, styles.muted]} numberOfLines={1}>
            {[
              `Day ${dayNo}`,
              formatDayDate(dayDrives[0].startedAt),
              `${dayDrives.length} drives`,
              ...(hiddenCount
                ? []
                : [`${formatTime(dayDrives[0].startedAt)}–${formatTime(dayDrives.at(-1).endedAt)}`]),
            ].join(' · ')}
          </Text>
        </View>
      ) : null}
      {selected && !single ? (
        <View style={styles.picked}>
          <Text style={[type.section, styles.text]} numberOfLines={1}>
            {oneWayLabel(selected.places) ?? `Drive ${trip.drives.indexOf(selected) + 1}`}
          </Text>
          <Text style={[type.body, styles.muted]} numberOfLines={1}>
            {[
              ...(days.length > 1 ? [`Day ${dayNumberOf(selected)}`] : []),
              formatDayDate(selected.startedAt),
              ...(selected.stats.timesHidden
                ? []
                : [`${formatTime(selected.startedAt)}–${formatTime(selected.endedAt)}`]),
            ].join(' · ')}
          </Text>
        </View>
      ) : null}
      {/* The same sections for All and for one drive; only what they cover changes. */}
      <HeroStats
        stats={selected ? selected.stats : { ...summary, movingTimeMs: timeSummary.movingTimeMs }}
        units={units}
        timesHidden={hideTimes}
        roadCount={new Set(viewRoads.map((r) => r.roadId)).size}
        countryCount={viewCountries.length}
      />
      {selected ? (
        <IconicRoadsSection
          completions={viewRoads}
          totals={roadTotals ?? new Map()}
          today={new Date(selected.startedAt).toDateString() === new Date().toDateString()}
        />
      ) : (
        <IconicRoadsSection completions={viewRoads} driveOf={driveOf} />
      )}
      {pointsByDrive ? (
        <Timeline
          items={selected ? driveTimeline : timeline}
          color={selected ? driveColors.get(selected.id) : c.accent}
          colorOfDay={selected || days.length === 1 ? undefined : dayColorOf}
          units={units}
          onStopPress={selected ? showDriveStop : showTripStop}
          onDriveOptions={openDriveMenu}
          roads={viewRoads.map((r) => ({
            name: getRoad(r.roadId)?.name,
            completedAt: r.completedAt,
          }))}
          hideTimes={selected ? hideTimes : hiddenCount > 0}
          photos={viewPhotos}
        />
      ) : null}
      <TripPhotos
        photos={viewPhotos}
        access={photoAccess}
        allow={allowPhotos}
        hideTimes={selected ? hideTimes : hiddenCount > 0}
        // Like the print banner: a picked day, else the trip.
        what={dayNo ? 'day' : 'trip'}
      />
      {/* Under Photos, whose picture of the trip it follows; under Timeline when there are none. */}
      <PrintBanner trip={trip} drive={single ? null : selected} />
      <CountriesSection rows={viewCountries} units={units} scope={selected ? 'drive' : 'trip'} />
      {pointsByDrive ? (
        <ChartsCard
          tracks={
            selected
              ? [
                  {
                    key: 'route',
                    color: driveColors.get(selected.id),
                    points: withoutCrossings(
                      pointsByDrive.get(selected.id) ?? [],
                      routeGaps(selected)
                    ),
                  },
                ]
              : tracks
          }
          units={units}
          avgSpeedMps={averageMovingSpeed(selected ? selected.stats : timeSummary)}
          speedHidden={selected ? hideTimes : hiddenCount > 0}
          markers={
            selected
              ? (selected.countries ?? [])
                  .slice(1)
                  .map((v) => ({ time: v.enteredAt, label: 'Border' }))
              : undefined
          }
        />
      ) : null}
      <DetailsRows
        // Elevations aren't times, so a trip's count every drive.
        stats={
          selected
            ? selected.stats
            : allHidden
              ? summary
              : {
                  ...timeSummary,
                  maxAltitudeM: summary.maxAltitudeM,
                  elevationGainM: summary.elevationGainM,
                }
        }
        elapsedMs={selected ? driveElapsedMs(selected) : timeSummary.elapsedMs}
        units={units}
        timesHidden={hideTimes}
        subtitle={dayNo ? 'This day' : selected ? 'This drive' : 'Whole trip'}
        hiddenNote={
          !selected && hiddenCount > 0 && !allHidden
            ? `Times leave out ${hiddenCount === 1 ? 'a drive' : `${hiddenCount} drives`} that ${hiddenCount === 1 ? 'is' : 'are'} just an Iconic Road, for safety.`
            : null
        }
      />
      <VehicleSection
        vehicle={viewVehicle}
        count={selected ? 1 : usedVehicleIds.length}
        // A drive's vehicle can change to another, or to any when none is set.
        onChange={
          selected && vehicles.some((v) => v !== viewVehicle) ? () => setMenu('vehicle') : null
        }
      />
    </DetailLayout>
  );
}

const makeStyles = (c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  mapWaiting: { flex: 1, backgroundColor: c.card }, // RouteMap's own, so nothing flashes
  pillScroll: { marginHorizontal: -16, marginTop: 16, flexGrow: 0 },
  pills: { gap: 8, paddingHorizontal: 16 },
  picked: { marginTop: 16, marginHorizontal: 4 },
  text: { color: c.text },
  muted: { color: c.textMuted },
});

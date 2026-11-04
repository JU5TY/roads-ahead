import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { showDialog } from '../components/ui/DialogHost';
import ActionSheet from '../components/ActionSheet';
import ChartsCard from '../components/charts/ChartsCard';
import TripPhotos from '../components/photos/TripPhotos';
import CountriesSection from '../components/countries/CountriesSection';
import DetailLayout from '../components/detail/DetailLayout';
import { routeMarkers, stopMarkerKey, stopMarkers } from '../components/detail/mapMarkers';
import Timeline from '../components/detail/Timeline';
import IconicRoadsSection from '../components/roads/IconicRoadsSection';
import { DetailsRows, HeroStats, TitleBlock } from '../components/detail/TripStats';
import VehicleSection from '../components/detail/VehicleSection';
import EditTripSheet from '../components/EditTripSheet';
import MoveDriveSheet from '../components/MoveDriveSheet';
import RouteMap from '../components/RouteMap';
import FilterChip from '../components/ui/FilterChip';
import { useSettings } from '../context/SettingsContext';
import { usePhotos } from '../hooks/usePhotos';
import { openPremium, usePremium } from '../hooks/usePremium';
import { useRoadTotals } from '../hooks/useRoadTotals';
import { useStyles, useTheme } from '../hooks/useTheme';
import { ensureDrivePlaces } from '../services/placeService';
import { deleteDrive, getDrivePoints } from '../storage/driveStorage';
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
import { driveGaps, routeSegments, withoutCrossings } from '../utils/crossings';
import { averageMovingSpeed, downsample } from '../utils/geoMath';
import { getRoad } from '../utils/iconicRoads';
import { comingSoon } from '../utils/comingSoon';
import { countryRows } from '../utils/countries';
import { buildDriveTimeline, buildTripTimeline } from '../utils/timeline';
import { vehicleLabel } from '../utils/vehicles';
import {
  deleteTripMessage,
  driveElapsedMs,
  groupIntoDays,
  routeLabel,
  summarizeDrives,
  tripRouteLabel,
  tripTitle,
} from '../utils/tripSummary';

// Keep the whole-trip map responsive however many drives it has.
const MAX_MAP_POINTS = 3000;

export default function TripScreen() {
  // `drive` picks one of the trip's drives on arrival (e.g. from an Iconic Road).
  const { id, drive: driveParam } = useLocalSearchParams();
  const { units, showIconicRoads } = useSettings();
  const premium = usePremium();
  const roadTotals = useRoadTotals();
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const [trip, setTrip] = useState(null);
  const [completions, setCompletions] = useState([]); // Iconic Roads on this trip
  const [pointsByDrive, setPointsByDrive] = useState(null); // driveId -> points
  const [missing, setMissing] = useState(false);
  const [menu, setMenu] = useState(null); // null | 'options' | 'edit' | 'move' | 'vehicle'
  const [picked, setPicked] = useState(driveParam ? Number(driveParam) : null); // drive id, null = All
  const [vehicles, setVehicles] = useState([]); // the Garage
  const [loads, setLoads] = useState(0); // bumped to load the trip again (after deleting a drive)
  const [focusedStop, setFocusedStop] = useState(null); // { driveId, time }: a Timeline stop on All
  const {
    photos,
    access: photoAccess,
    allow: allowPhotos,
  } = usePhotos(trip?.drives.map((d) => [d.startedAt, d.endedAt])); // not the time between drives
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
        const [all, roads, garage] = await Promise.all([
          Promise.all(t.drives.map((d) => getDrivePoints(d.id))),
          getTripCompletions(t.id),
          listVehicles(),
        ]);
        if (cancelled) return;
        setVehicles(garage);
        setTrip(t);
        setCompletions(roads);
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
      // `loads` is in the list only to load again after a drive is deleted.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, loads])
  );

  const days = useMemo(() => (trip ? groupIntoDays(trip.drives) : []), [trip]);
  const summary = useMemo(() => (trip ? summarizeDrives(trip.drives) : null), [trip]);
  // Drives that are just an Iconic Road keep their times hidden, so trip totals leave them out.
  const hiddenCount = trip ? trip.drives.filter((d) => d.stats.timesHidden).length : 0;
  const timeSummary = useMemo(
    () => (trip ? summarizeDrives(trip.drives.filter((d) => !d.stats.timesHidden)) : null),
    [trip]
  );
  // The whole trip's timeline (Overnight rows between days), for All.
  const timeline = useMemo(
    () => (trip && pointsByDrive ? buildTripTimeline(trip, pointsByDrive) : []),
    [trip, pointsByDrive]
  );

  const dayColorOf = useCallback(
    (n) => (days.length > 1 ? dayColorFor(c, n) : c.accent),
    [days, c]
  );

  // A trip of one drive is that drive; otherwise the picked pill, or null for All.
  const selectedId =
    trip?.drives.length === 1
      ? trip.drives[0].id
      : (trip?.drives.find((d) => d.id === picked)?.id ?? null);

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
          driveGaps(d),
          // With one drive picked, the others fade back.
          selectedId && d.id !== selectedId ? `${dayColorOf(day.number)}40` : dayColorOf(day.number)
        )
      )
    );
  }, [trip, pointsByDrive, days, dayColorOf, selectedId]);
  // Frame the picked drive (the whole trip for All). From its points, not the
  // segments, so place names arriving don't move the map again.
  const fitTo = useMemo(
    () =>
      selectedId && pointsByDrive
        ? downsample(pointsByDrive.get(selectedId) ?? [], 200).map(({ latitude, longitude }) => ({
            latitude,
            longitude,
          }))
        : undefined,
    [pointsByDrive, selectedId]
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
        day.drives.map((d) => ({
          key: `drive-${d.id}`,
          color: dayColorOf(day.number),
          points: withoutCrossings(pointsByDrive?.get(d.id) ?? [], driveGaps(d)),
        }))
      ),
    [days, pointsByDrive, dayColorOf]
  );

  if (missing || !trip || !pointsByDrive) {
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
  const subtitle = trip.name ? tripRouteLabel(trip) : null;

  const allHidden = hiddenCount === trip.drives.length;
  const roadsShown = showIconicRoads ? completions : [];
  const dayOf = (driveId) => {
    const drive = trip.drives.find((d) => d.id === driveId);
    return drive ? (days.find((day) => day.drives.includes(drive))?.number ?? 1) : 1;
  };

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
  const pick = (driveId) => {
    setPicked(driveId);
    setFocusedStop(null);
    showMap();
  };
  const dayNumberOf = (d) => days.find((day) => day.drives.includes(d))?.number ?? 1;
  // What the sections below cover: the picked drive, or the whole trip for All.
  const hideTimes = selected ? Boolean(selected.stats.timesHidden) : allHidden;
  const viewRoads = selected ? roadsShown.filter((r) => r.driveId === selected.id) : roadsShown;
  const viewPhotos = selected
    ? photos.filter((p) => p.time >= selected.startedAt && p.time <= selected.endedAt)
    : photos;
  const viewCountries = selected
    ? countryRows([selected])
    : countryRows(trip.drives, days.length > 1 ? { dayOf: dayNumberOf } : {});
  const usedVehicleIds = [...new Set(trip.drives.map((d) => d.vehicleId).filter((v) => v != null))];
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
        deleteDrive(selected.id).then(() => {
          setPicked(null);
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

  const map = (
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
                firstPoint: fitTo[0],
                lastPoint: fitTo.at(-1),
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
        { icon: 'ios_share', label: 'Share', onPress: () => comingSoon('Sharing') },
        { icon: 'more_vert', label: 'More options', onPress: () => setMenu('options') },
      ]}
    >
      <ActionSheet
        visible={menu === 'options'}
        actions={[
          { icon: 'edit', label: 'Edit name and notes', onPress: () => setMenu('edit') },
          {
            icon: 'download',
            label: 'Export',
            badge: premium ? null : 'Premium',
            onPress: () => {
              setMenu(null);
              if (premium) comingSoon('GPX export');
              else openPremium();
            },
          },
          // The picked drive (or a lone one) can move to another trip, e.g. "Continue" was missed.
          ...(selected
            ? [
                {
                  icon: 'drive_file_move',
                  label: single ? 'Add to another trip' : 'Move this drive to another trip',
                  onPress: () => setMenu('move'),
                },
              ]
            : []),
          ...(selected && !single
            ? [
                {
                  icon: 'delete',
                  label: 'Delete this drive',
                  style: 'destructive',
                  onPress: confirmDeleteDrive,
                },
              ]
            : []),
          { icon: 'delete', label: 'Delete trip', style: 'destructive', onPress: confirmDelete },
        ]}
        onClose={() => setMenu(null)}
      />
      <EditTripSheet
        visible={menu === 'edit'}
        trip={trip}
        onSave={save}
        onClose={() => setMenu(null)}
      />
      {selected ? (
        <MoveDriveSheet
          visible={menu === 'move'}
          drive={selected}
          allowNewTrip={!single}
          // Follow the drive to its new trip.
          onMoved={(tripId) => router.replace(`/trips/${tripId}?drive=${selected.id}`)}
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
      {single ? null : (
        // One page per trip: All, or one drive at a time.
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pillScroll}
          contentContainerStyle={styles.pills}
          role="radiogroup"
        >
          <FilterChip label="All" selected={!selected} onPress={() => pick(null)} />
          {trip.drives.map((d, i) => (
            <FilterChip
              key={d.id}
              label={`Drive ${i + 1}`}
              dot={driveColors.get(d.id)}
              selected={d.id === selectedId}
              onPress={() => pick(d.id)}
            />
          ))}
        </ScrollView>
      )}
      {selected && !single ? (
        <View style={styles.picked}>
          <Text style={[type.section, styles.text]} numberOfLines={1}>
            {routeLabel(selected.places) ?? `Drive ${trip.drives.indexOf(selected) + 1}`}
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
        <IconicRoadsSection completions={viewRoads} dayOf={dayOf} />
      )}
      <Timeline
        items={selected ? driveTimeline : timeline}
        color={selected ? driveColors.get(selected.id) : c.accent}
        colorOfDay={selected || days.length === 1 ? undefined : dayColorOf}
        units={units}
        onStopPress={selected ? showDriveStop : showTripStop}
        roads={viewRoads.map((r) => ({
          name: getRoad(r.roadId)?.name,
          completedAt: r.completedAt,
        }))}
        hideTimes={selected ? hideTimes : hiddenCount > 0}
        photos={viewPhotos}
      />
      <TripPhotos
        photos={viewPhotos}
        access={photoAccess}
        allow={allowPhotos}
        hideTimes={selected ? hideTimes : hiddenCount > 0}
      />
      <CountriesSection rows={viewCountries} units={units} scope={selected ? 'drive' : 'trip'} />
      <ChartsCard
        tracks={
          selected
            ? [
                {
                  key: 'route',
                  color: driveColors.get(selected.id),
                  points: withoutCrossings(
                    pointsByDrive.get(selected.id) ?? [],
                    driveGaps(selected)
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
        subtitle={selected ? 'This drive' : 'Whole trip'}
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
  pillScroll: { marginHorizontal: -16, marginTop: 16, flexGrow: 0 },
  pills: { gap: 8, paddingHorizontal: 16 },
  picked: { marginTop: 16, marginHorizontal: 4 },
  text: { color: c.text },
  muted: { color: c.textMuted },
});

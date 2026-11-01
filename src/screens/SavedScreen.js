import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { routeMarkers } from '../components/detail/mapMarkers';
import IconicRoadsSection from '../components/roads/IconicRoadsSection';
import RouteMap from '../components/RouteMap';
import Button from '../components/ui/Button';
import FadeUp from '../components/ui/FadeUp';
import IconButton from '../components/ui/IconButton';
import StatRow from '../components/ui/StatRow';
import { useSettings } from '../context/SettingsContext';
import { useStyles, useTheme } from '../hooks/useTheme';
import { ensureDrivePlaces } from '../services/placeService';
import { getDrive, getDrivePoints } from '../storage/driveStorage';
import { getDriveCompletions, getRoadTotals } from '../storage/roadStorage';
import { getTrip } from '../storage/tripStorage';
import { spacing, type } from '../theme';
import { driveGaps, routeSegments } from '../utils/crossings';
import { distanceParts, elevationParts, formatDate, formatDurationShort } from '../utils/format';
import { comingSoon } from '../utils/comingSoon';
import { downsample } from '../utils/geoMath';
import { dayNumberFor, groupIntoDays, routeLabel, tripTitle } from '../utils/tripSummary';

/** Shown after Stop: the drive just saved, with Share and View. */
export default function SavedScreen() {
  const { id } = useLocalSearchParams();
  const { units, showIconicRoads } = useSettings();
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const [drive, setDrive] = useState(null);
  const [points, setPoints] = useState(null);
  const [trip, setTrip] = useState(null);
  const [roads, setRoads] = useState({ completions: [], totals: new Map() });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const d = await getDrive(Number(id));
      if (cancelled || !d) return;
      const [p, t, completions, totals] = await Promise.all([
        getDrivePoints(d.id),
        getTrip(d.tripId),
        getDriveCompletions(d.id),
        getRoadTotals(),
      ]);
      if (cancelled) return;
      setDrive(d);
      setPoints(p);
      setTrip(t);
      setRoads({ completions, totals });
      const places = await ensureDrivePlaces(d, { includeStops: true });
      if (!cancelled) setDrive((prev) => ({ ...prev, places }));
    })().catch((err) => console.warn('[saved] load failed', err));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const route = useMemo(
    () =>
      points
        ? downsample(points).map(({ latitude, longitude, timestamp }) => ({
            latitude,
            longitude,
            timestamp,
          }))
        : [],
    [points]
  );

  if (!drive || !trip) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  const multiDay = groupIntoDays(trip.drives).length > 1;
  const dayNumber = dayNumberFor(
    trip.drives.filter((d) => d.startedAt < drive.startedAt),
    drive.startedAt
  );
  const name = tripTitle(trip);
  const kicker = (
    multiDay ? `Day ${dayNumber} saved${name ? ` · ${name}` : ''}` : 'Drive saved'
  ).toUpperCase();
  const distance = distanceParts(drive.stats.distanceM, units);
  const highest = elevationParts(drive.stats.maxAltitudeM, units);
  const climb = elevationParts(drive.stats.elevationGainM, units);
  // The cross goes Home. View goes Home too, then opens the trip on top with
  // this drive picked, so Back from the trip lands on Home, not Record.
  const close = () => router.navigate('/');
  const view = () => {
    router.navigate('/');
    router.push(`/trips/${trip.id}?drive=${drive.id}`);
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.map, { height: 300 + insets.top }]}>
        <RouteMap
          flat
          segments={routeSegments(
            'route',
            route,
            driveGaps(drive),
            c.accent
          )}
          markers={routeMarkers({
            firstPoint: route[0],
            lastPoint: route.at(-1),
            startName: drive.places.start,
            endName: drive.places.end,
            drives: [],
            c,
          })}
        />
        <IconButton
          icon="close"
          variant="floating"
          accessibilityLabel="Close"
          onPress={close}
          style={[styles.close, { top: insets.top + 12 }]}
        />
      </View>
      <ScrollView style={styles.flex} contentContainerStyle={styles.body}>
        <Text style={[type.kicker, styles.kicker]} numberOfLines={1}>
          {kicker}
        </Text>
        <Text style={[type.title, styles.title]} numberOfLines={1}>
          {routeLabel(drive.places) ?? formatDate(drive.startedAt)}
        </Text>
        <FadeUp delay={300} style={styles.stats}>
          {/* Same card as an Iconic Road's. Highest point is never hidden; when
              times are, Climb takes Driving time's place so there are still three. */}
          <StatRow
            stats={[
              { icon: 'straighten', ...distance, label: 'Distance' },
              drive.stats.timesHidden
                ? { icon: 'trending_up', ...climb, label: 'Climb' }
                : {
                    icon: 'directions_car',
                    value: formatDurationShort(drive.stats.movingTimeMs),
                    label: 'Driving time',
                  },
              { icon: 'landscape', ...highest, label: 'Highest' },
            ]}
          />
        </FadeUp>
        {showIconicRoads ? (
          // The Trip page's rows, so any number of roads list the same way.
          <FadeUp delay={500}>
            <IconicRoadsSection
              completions={roads.completions}
              totals={roads.totals}
              today
              header={false}
              style={styles.roads}
            />
          </FadeUp>
        ) : null}
      </ScrollView>
      <View style={[styles.buttons, { paddingBottom: insets.bottom + 24 }]}>
        <Button
          variant="tonal"
          icon="ios_share"
          label="Share"
          style={styles.flex}
          onPress={() => comingSoon('Sharing')}
        />
        <Button label="View" style={styles.flex} onPress={view} />
      </View>
    </View>
  );
}

const makeStyles = (c) => ({
  screen: { flex: 1, backgroundColor: c.screen },
  center: { alignItems: 'center', justifyContent: 'center' },
  map: { borderBottomWidth: 1, borderBottomColor: c.outline, backgroundColor: c.surface },
  close: { position: 'absolute', left: 12 },
  body: { paddingHorizontal: spacing.md, paddingTop: 20, paddingBottom: 24 },
  kicker: { color: c.accent, marginHorizontal: 4 },
  title: { color: c.text, marginTop: 4, marginHorizontal: 4 },
  stats: { marginTop: 18 },
  roads: { marginTop: 16 },
  flex: { flex: 1 },
  buttons: { flexDirection: 'row', gap: 10, paddingHorizontal: spacing.md, paddingTop: 12 },
});

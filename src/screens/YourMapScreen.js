import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import FlagStack from '../components/countries/FlagStack';
import IconButton from '../components/ui/IconButton';
import { useSettings } from '../context/SettingsContext';
import { useStyles, useTheme } from '../hooks/useTheme';
import { getLocationAccess } from '../services/locationService';
import { getDriveRoutePreview } from '../storage/driveStorage';
import { listTrips } from '../storage/tripStorage';
import { type } from '../theme';
import { summarizeCountries } from '../utils/countries';
import { driveGaps, routeSegments } from '../utils/crossings';
import { distanceParts } from '../utils/format';
import { computeTotals, firstDriveMonth } from '../utils/tripSummary';

const MAX_MAP_POINTS = 6000; // across every drive, so a long history stays quick to draw
const SHEET_HEIGHT = 110; // the totals panel (above the nav inset), kept clear when fitting
const POSITION_DELTA = 0.05;

/** Every drive's route (all trips), thinned: [{ drive, points }]. Null while loading. */
function useEveryRoute() {
  const [data, setData] = useState(null); // { trips, routes }
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const trips = await listTrips();
      const drives = trips.flatMap((t) => t.drives);
      const perDrive = Math.max(60, Math.floor(MAX_MAP_POINTS / Math.max(1, drives.length)));
      const routes = await Promise.all(
        drives.map(async (drive) => ({
          drive,
          points: await getDriveRoutePreview(drive.id, perDrive),
        }))
      );
      if (!cancelled) setData({ trips, routes });
    })().catch((err) => console.warn('[your map] load failed', err));
    return () => {
      cancelled = true;
    };
  }, []);
  return data;
}

/**
 * Full-screen "Your map": every road you've driven, all time, in one style on a
 * real map you can pan and zoom. A sheet at the bottom has the all-time totals.
 */
export default function YourMapScreen() {
  const { units } = useSettings();
  const { c, scheme } = useTheme();
  const dark = scheme === 'dark';
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const data = useEveryRoute();

  const segments = useMemo(
    () =>
      (data?.routes ?? []).flatMap(({ drive, points }) =>
        routeSegments(`drive-${drive.id}`, points, driveGaps(drive), c.accent)
      ),
    [data, c]
  );

  const fit = () => {
    const all = segments.flatMap((s) => s.coordinates);
    if (all.length < 2) return;
    mapRef.current?.fitToCoordinates(all, {
      edgePadding: {
        top: insets.top + 72,
        right: 32,
        bottom: SHEET_HEIGHT + insets.bottom + 24,
        left: 32,
      },
      animated: false,
    });
  };
  // Fit once the routes arrive (the map may be ready first).
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || segments.length === 0) return;
    fitted.current = true;
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments]);

  // Without location (never prompted for here), it re-fits to every route instead.
  const centreOnMe = async () => {
    const pos = (await getLocationAccess()).granted
      ? await Location.getLastKnownPositionAsync()
      : null;
    if (!pos) return fit();
    mapRef.current?.animateToRegion(
      {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        latitudeDelta: POSITION_DELTA,
        longitudeDelta: POSITION_DELTA,
      },
      500
    );
  };

  const trips = data?.trips ?? [];
  const distance = distanceParts(computeTotals(trips).distanceM, units, { whole: true });
  // Most distance first, for the flags.
  const countries = summarizeCountries(
    trips.flatMap((t) => t.drives).flatMap((d) => d.countries ?? [])
  ).sort((a, b) => b.distanceM - a.distanceM);

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        userInterfaceStyle={scheme}
        onMapReady={() => {
          if (segments.length > 0) fit();
        }}
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
      >
        {segments.map((s) => (
          <Polyline
            key={s.key}
            coordinates={s.coordinates}
            strokeColor={s.color}
            strokeWidth={3.5}
            {...(s.dotted ? { lineDashPattern: [1, 8], lineCap: 'round' } : null)}
          />
        ))}
      </MapView>

      <IconButton
        icon="arrow_back"
        variant="floating"
        accessibilityLabel="Back"
        onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))}
        style={[styles.button, styles.left, { top: insets.top + 12 }]}
      />
      <IconButton
        icon="my_location"
        variant="floating"
        accessibilityLabel="Centre on my position"
        onPress={() => centreOnMe().catch(() => fit())}
        style={[styles.button, styles.right, { top: insets.top + 12 }]}
      />

      <View
        style={[styles.sheet, dark && styles.sheetDark, { paddingBottom: insets.bottom + 24 }]}
        accessibilityLabel="All time totals"
      >
        <View>
          <Text style={styles.total}>
            {distance.value}
            <Text style={styles.totalUnit}> {distance.unit}</Text>
          </Text>
          {trips.length > 0 ? (
            <Text style={styles.since}>driven since {firstDriveMonth(trips)}</Text>
          ) : null}
        </View>
        <FlagStack countries={countries} />
      </View>
    </View>
  );
}

const makeStyles = (c) => ({
  screen: { flex: 1, backgroundColor: c.mapLand },
  button: { position: 'absolute' },
  left: { left: 12 },
  right: { right: 12 },
  // A fixed panel, not a draggable sheet: square corners, no handle. Totals on
  // the left, flags on the right.
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 20,
    paddingHorizontal: 16,
    backgroundColor: c.card,
    shadowColor: c.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 12,
  },
  sheetDark: { shadowOpacity: 0.5 },
  total: { ...type.total, color: c.accent },
  totalUnit: { ...type.totalUnit, color: c.textMuted },
  since: { ...type.bodySmall, color: c.textMuted, marginTop: 6 },
});

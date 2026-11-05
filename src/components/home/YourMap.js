import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { useStyles } from '../../hooks/useTheme';
import { getDriveRoutePreview } from '../../storage/driveStorage';
import { pressedOpacity, spacing, type } from '../../theme';
import { driveGaps, splitAtCrossings } from '../../utils/crossings';
import { distanceParts } from '../../utils/format';
import { fitInBox } from '../../utils/routeOutline';
import { computeTotals, firstDriveMonth, groupIntoDays } from '../../utils/tripSummary';
import AppLogo from '../AppLogo';
import DrawnLand, { MAP_BLUE, MAP_PALE, useLandPath } from '../DrawnLand';
import Icon from '../ui/Icon';

// Laid out on a 358 x 400 grid, like the share card's, and scaled to the screen.
const WIDTH = 358;
const HEIGHT = 400;
const TEXT_TOP = 308;
const ROUTE_MARGIN = 30;
const POINTS_PER_DRIVE = 80;

// The last routes drawn, so coming back to Home doesn't reload every drive.
// Replaced when a drive is saved or deleted (the key changes).
let cached = { key: null, parts: [] };

/**
 * Every drive's route, thinned and split at its crossings and pauses:
 * [{ coordinates, crossing, day }], where `day` is the latest trip's day number
 * for its drives and null for everything else. Reloads when the drives (or
 * their gaps) change.
 */
function useAllRoutes(trips) {
  const drives = useMemo(() => trips.flatMap((t) => t.drives), [trips]);
  const key = drives.map((d) => `${d.id}:${driveGaps(d).length}`).join(',');
  const [loaded, setLoaded] = useState(cached);
  useEffect(() => {
    if (cached.key === key) return;
    let cancelled = false;
    const latestDay = new Map(
      groupIntoDays(trips[0]?.drives ?? []).flatMap((day) =>
        day.drives.map((d) => [d.id, day.number])
      )
    );
    Promise.all(drives.map((d) => getDriveRoutePreview(d.id, POINTS_PER_DRIVE)))
      .then((all) => {
        if (cancelled) return;
        const next = all.flatMap((r, i) =>
          splitAtCrossings(r, driveGaps(drives[i])).map((p) => ({
            ...p,
            day: latestDay.get(drives[i].id) ?? null,
          }))
        );
        cached = { key, parts: next };
        setLoaded(cached);
      })
      .catch((err) => console.warn('[your map] load failed', err));
    return () => {
      cancelled = true;
    };
    // Only re-run when the drives change, not on every new array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // The cache when it matches (another visit loaded it), else the last load.
  return (cached.key === key ? cached : loaded).parts;
}

/**
 * The top of Home: every road you've driven on a drawn map (nothing to load),
 * the all-time distance and since when. The latest trip is bold, everything else
 * faint; ferries, tunnels and pauses are dotted. Opens the full map. `trips` newest first.
 */
export default function YourMap({ trips, units }) {
  const styles = useStyles(makeStyles);
  const { width: screenWidth } = useWindowDimensions();
  const parts = useAllRoutes(trips);
  const width = screenWidth - 2 * spacing.md;
  const distance = distanceParts(computeTotals(trips).distanceM, units, { whole: true });

  const routes = useMemo(() => parts.map((p) => p.coordinates), [parts]);
  const fit = useMemo(() => fitInBox(routes, WIDTH, TEXT_TOP, ROUTE_MARGIN), [routes]);
  const land = useLandPath(fit, WIDTH, HEIGHT);
  // Older routes first, so the latest trip is drawn on top.
  const lines = useMemo(
    () => [...parts.filter((p) => p.day === null), ...parts.filter((p) => p.day !== null)],
    [parts]
  );

  return (
    <Pressable
      onPress={() => router.push('/your-map')}
      accessibilityRole="button"
      accessibilityLabel={`Open your map. ${distance.value} ${distance.unit} driven since ${firstDriveMonth(trips)}.`}
      style={({ pressed }) => [
        styles.card,
        { width, height: width * (HEIGHT / WIDTH) },
        pressed && styles.pressed,
      ]}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        style={StyleSheet.absoluteFill}
        accessible={false}
      >
        <DrawnLand path={land} width={WIDTH} height={HEIGHT} fadeEnd={305} />
        {fit
          ? lines.map((p, i) => (
              <Polyline
                key={i}
                points={fit.points(p.coordinates)}
                fill="none"
                stroke="#FFFFFF"
                strokeOpacity={p.day === null ? 0.55 : 1}
                strokeWidth={p.day === null ? 2.5 : 4}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={p.crossing !== null ? '0.1 7' : undefined}
              />
            ))
          : null}
      </Svg>
      <View style={styles.expand}>
        <Icon name="open_in_full" size={20} color="#202124" />
      </View>
      <View style={styles.footer}>
        <View style={styles.flex}>
          <Text style={styles.total}>
            {distance.value}
            <Text style={styles.totalUnit}> {distance.unit}</Text>
          </Text>
          <Text style={[type.bodyLarge, styles.since]}>driven since {firstDriveMonth(trips)}</Text>
        </View>
        <View style={styles.logo}>
          <AppLogo size={36} />
        </View>
      </View>
    </Pressable>
  );
}

const makeStyles = (c) => ({
  card: { borderRadius: 16, overflow: 'hidden', backgroundColor: MAP_BLUE, marginBottom: 8 },
  pressed: { opacity: pressedOpacity },
  expand: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: c.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  footer: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  flex: { flex: 1, minWidth: 0 },
  total: { ...type.total, color: '#FFFFFF' },
  totalUnit: { ...type.totalUnit, color: MAP_PALE },
  since: { color: MAP_PALE, marginTop: 2 },
  logo: { borderRadius: 18, borderWidth: 1, borderColor: '#FFFFFF' },
});

import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, G, LinearGradient, Path, Polyline, Rect, Stop } from 'react-native-svg';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { getDriveRoutePreview } from '../../storage/driveStorage';
import { pressedOpacity, spacing, type } from '../../theme';
import { driveGaps, splitAtCrossings } from '../../utils/crossings';
import { distanceParts } from '../../utils/format';
import { fitInBox } from '../../utils/routeOutline';
import { computeTotals, firstDriveMonth, groupIntoDays } from '../../utils/tripSummary';
import AppLogo from '../AppLogo';
import { useLandPath } from '../DrawnLand';
import Icon from '../ui/Icon';

// Laid out on a 358 x 400 grid, like the share card's, and scaled to the screen;
// the status bar's height is added above it.
const WIDTH = 358;
const HEIGHT = 400;
const TEXT_TOP = 308;
const ROUTE_MARGIN = 30;
const FADE_TOP = 200; // from here the map fades into the page
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
 * The top of Home, edge to edge and fading into the page: every road you've
 * driven on a drawn map (nothing to load), the all-time distance and since when.
 * The latest trip is bold, everything else faint; ferries, tunnels and pauses are
 * dotted. Its expand button opens the full map. `trips` newest first.
 */
export default function YourMap({ trips, units }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const parts = useAllRoutes(trips);
  const top = insets.top * (WIDTH / width); // the status bar, in grid units
  const distance = distanceParts(computeTotals(trips).distanceM, units, { whole: true });

  const routes = useMemo(() => parts.map((p) => p.coordinates), [parts]);
  const fit = useMemo(() => fitInBox(routes, WIDTH, TEXT_TOP, ROUTE_MARGIN), [routes]);
  // Land reaches up behind the status bar, so it's drawn from the top of the banner.
  const landFit = useMemo(
    () =>
      fit && {
        project: (p) => {
          const [x, y] = fit.project(p);
          return [x, y + top];
        },
      },
    [fit, top]
  );
  const land = useLandPath(landFit, WIDTH, HEIGHT + top);
  // Older routes first, so the latest trip is drawn on top.
  const lines = useMemo(
    () => [...parts.filter((p) => p.day === null), ...parts.filter((p) => p.day !== null)],
    [parts]
  );

  return (
    <View style={[styles.banner, { height: width * (HEIGHT / WIDTH) + insets.top }]}>
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${WIDTH} ${HEIGHT + top}`}
        style={StyleSheet.absoluteFill}
        accessible={false}
      >
        <Defs>
          <LinearGradient id="yourMapFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={c.background} stopOpacity={0} />
            <Stop offset="0.25" stopColor={c.background} stopOpacity={0.15} />
            <Stop offset="0.5" stopColor={c.background} stopOpacity={0.45} />
            <Stop offset="0.75" stopColor={c.background} stopOpacity={0.8} />
            <Stop offset="1" stopColor={c.background} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        {/* The stroke closes hairline gaps where neighbouring countries meet. */}
        {land ? <Path d={land} fill={c.track} stroke={c.track} strokeWidth={1.2} /> : null}
        <Rect
          y={FADE_TOP + top}
          width={WIDTH}
          height={HEIGHT - FADE_TOP}
          fill="url(#yourMapFade)"
        />
        {fit ? (
          <G transform={`translate(0 ${top})`}>
            {lines.map((p, i) => (
              <Polyline
                key={i}
                points={fit.points(p.coordinates)}
                fill="none"
                stroke={c.accent}
                strokeOpacity={p.day === null ? 0.55 : 1}
                strokeWidth={p.day === null ? 2.5 : 4}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={p.crossing !== null ? '0.1 7' : undefined}
              />
            ))}
          </G>
        ) : null}
      </Svg>
      <Pressable
        onPress={() => router.push('/your-map')}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel="Open your map"
        style={({ pressed }) => [
          styles.expand,
          { top: insets.top + spacing.md },
          pressed && styles.pressed,
        ]}
      >
        <Icon name="open_in_full" size={20} color={c.text} />
      </Pressable>
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
    </View>
  );
}

const makeStyles = (c) => ({
  banner: { marginHorizontal: -spacing.md, overflow: 'hidden', backgroundColor: c.card },
  pressed: { opacity: pressedOpacity },
  expand: {
    position: 'absolute',
    right: spacing.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.floating,
    shadowColor: c.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  footer: {
    position: 'absolute',
    // In line with the section titles below.
    left: 20,
    right: 20,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  flex: { flex: 1, minWidth: 0 },
  total: { ...type.total, color: c.text },
  totalUnit: { ...type.totalUnit, color: c.textMuted },
  since: { color: c.textMuted, marginTop: 2 },
  logo: { borderRadius: 18, borderWidth: 1, borderColor: '#FFFFFF' },
});

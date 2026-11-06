import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, G, LinearGradient, Path, Polyline, Rect, Stop } from 'react-native-svg';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { getDriveRoutePreview } from '../../storage/driveStorage';
import { pressedOpacity, spacing, type } from '../../theme';
import { countryFrame } from '../../utils/countries';
import { driveGaps, splitAtCrossings } from '../../utils/crossings';
import { distanceParts } from '../../utils/format';
import { fitInBox, pinPoint } from '../../utils/routeOutline';
import { computeTotals, firstDriveMonth, groupIntoDays } from '../../utils/tripSummary';
import AppLogo from '../AppLogo';
import { useLandPath } from '../DrawnLand';
import Icon from '../ui/Icon';

// Laid out on a 358 x 372 grid, like the share card's, and scaled to the screen;
// the status bar's height is added above it.
const WIDTH = 358;
const HEIGHT = 372;
const ROUTE_BOTTOM = 280; // above the text, and where the fade is still light
const ROUTE_MARGIN = 20;
const PIN_BELOW = 10; // routes drawn smaller than this are a pin
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
 * dotted. The map always shows the whole of the countries driven in, with a pin
 * while the routes are too small to see on it. Its expand button opens the full map. `trips` newest first; `scrollY`
 * is the page's scroll position: the land and routes move at half speed (like the
 * Trip page's map, so they seem to stay behind) and the rest moves with the page.
 */
export default function YourMap({ trips, units, scrollY }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const parts = useAllRoutes(trips);
  const top = insets.top * (WIDTH / width); // the status bar, in grid units
  const mapShift = scrollY.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.5],
    extrapolateLeft: 'clamp',
  });
  const distance = distanceParts(computeTotals(trips).distanceM, units, { whole: true });

  const routes = useMemo(() => parts.map((p) => p.coordinates), [parts]);
  const fit = useMemo(
    () => fitInBox([...routes, countryFrame(routes)], WIDTH, ROUTE_BOTTOM, ROUTE_MARGIN),
    [routes]
  );
  const pin = useMemo(() => pinPoint(fit, routes, PIN_BELOW), [fit, routes]);
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
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: mapShift }] }]}>
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${WIDTH} ${HEIGHT + top}`}
          accessible={false}
        >
          {/* The stroke draws the coasts and borders, so a country inland still has a shape. */}
          {land ? (
            <Path d={land} fill={c.track} stroke={c.card} strokeWidth={1} strokeLinejoin="round" />
          ) : null}
          {fit && !pin ? (
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
      </Animated.View>
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
        <Rect
          y={FADE_TOP + top}
          width={WIDTH}
          height={HEIGHT - FADE_TOP}
          fill="url(#yourMapFade)"
        />
      </Svg>
      {/* Above the fade, so a pin on a south coast stays bold. */}
      {pin ? (
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: mapShift }] }]}>
          <Svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${WIDTH} ${HEIGHT + top}`}
            accessible={false}
          >
            <Circle cx={pin[0]} cy={pin[1] + top} r={15} fill={c.accent} fillOpacity={0.18} />
            <Circle cx={pin[0]} cy={pin[1] + top} r={6} fill={c.accent} stroke={c.card} strokeWidth={2} />
          </Svg>
        </Animated.View>
      ) : null}
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
    // In line with the section titles below. What comes next sets the gap under it,
    // the same 28 with or without the Distance card.
    left: 20,
    right: 20,
    bottom: 0,
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

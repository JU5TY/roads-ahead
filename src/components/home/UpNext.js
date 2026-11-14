import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useHere } from '../../hooks/useHere';
import { useSavedLines } from '../../hooks/usePlanRoutes';
import { useStyles, useTheme } from '../../hooks/useTheme';
import { pressedOpacity, radius, type } from '../../theme';
import { dateKey, dateOf, driveRoute, groupPlans, mapPlanOf, planKicker, planRouteName, stopCounts } from '../../utils/plans';
import { getReadyRoute } from '../../utils/readyRoutes';
import RoadBadge from '../RoadBadge';
import RoutePreview from '../RoutePreview';
import SectionHeader from '../ui/SectionHeader';

const MAP_HEIGHT = 132;

/** The day after a dated plan's last day, as 'YYYY-MM-DD'. */
function dayAfter(plan) {
  const end = dateOf(plan.startDate);
  end.setDate(end.getDate() + plan.drives.length);
  return dateKey(end);
}

/**
 * The plan Home shows under Up next: the soonest dated plan not yet driven
 * whose last day isn't over (so a trip under way stays until it ends), or null.
 * `driven` is the set of plan drive ids already recorded.
 */
export function upNextPlan(plans, driven, now) {
  const today = dateKey(new Date(now));
  return groupPlans(plans, driven).comingUp.find((p) => dayAfter(p) > today) ?? null;
}

/**
 * The road lines to draw: a copied Iconic Trip's own, else each drive's saved
 * Google line (kept 30 days, so nothing is asked for here). Null when any
 * drive's line isn't saved: then there's no map rather than straight lines.
 */
function useLines(plan, here, color) {
  const mapPlan = useMemo(() => mapPlanOf(plan, here), [plan, here]);
  const saved = useSavedLines(mapPlan);
  return useMemo(() => {
    const route = plan.routeId ? getReadyRoute(plan.routeId) : null;
    if (route) {
      return route.drives.map((d, i) => ({
        key: `drive-${i}`,
        coordinates: d.line.map(([latitude, longitude]) => ({ latitude, longitude })),
        color,
      }));
    }
    const lines = [];
    for (let i = 0; i < mapPlan.drives.length; i++) {
      if (!driveRoute(mapPlan, i)) continue;
      if (!saved[i]) return null;
      lines.push({ key: `drive-${i}`, coordinates: saved[i], color });
    }
    return lines.length ? lines : null;
  }, [plan.routeId, mapPlan, saved, color]);
}

/**
 * Home's Up next card, the same card as Latest trip: the next planned trip's map
 * (its saved road lines) with the Iconic Road mark when it has any, then the lines
 * its Trips card shows: date line, name, where it goes. Tapping opens the plan.
 * `active` keeps the native map only while Home is showing.
 */
export default function UpNext({ plan, active }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const { here } = useHere();
  const lines = useLines(plan, here, c.accent);
  const { roads } = stopCounts(plan);
  const end = plan.drives.flatMap((d) => d.stops).at(-1);
  const route = end ? planRouteName(plan, here) : 'No stops yet';
  const kicker = planKicker(plan);
  const roadsLabel = roads > 0 ? `, includes ${roads} ${roads === 1 ? 'Iconic Road' : 'Iconic Roads'}` : '';

  return (
    <>
      <SectionHeader title="Up next" />
      <Pressable
        onPress={() => router.push(`/plans/${plan.id}`)}
        accessibilityRole="link"
        accessibilityLabel={`${plan.name}, ${kicker.toLowerCase()}, ${route}${roadsLabel}`}
        style={styles.card}
      >
        {({ pressed }) => (
          <>
            {lines ? <RoutePreview segments={lines} height={MAP_HEIGHT} active={active} /> : null}
            {/* As Latest trip, only the text fades: a faded map shows the card's shadow through it. */}
            <View style={[styles.body, pressed && styles.pressed]}>
              <Text style={[type.caps, styles.kicker]} numberOfLines={1}>
                {kicker}
              </Text>
              <Text style={[type.section, styles.text]} numberOfLines={1}>
                {plan.name}
              </Text>
              <Text style={[type.body, styles.muted, styles.route]} numberOfLines={1}>
                {route}
              </Text>
            </View>
            {lines && roads > 0 ? <RoadBadge ring={c.card} size={32} style={styles.mapEdge} /> : null}
          </>
        )}
      </Pressable>
    </>
  );
}

const makeStyles = (c) => ({
  card: { borderRadius: radius.card, overflow: 'hidden', backgroundColor: c.card, ...c.cardShadow },
  body: { paddingTop: 16, paddingHorizontal: 20, paddingBottom: 18, gap: 2 },
  route: { marginTop: 4 },
  // Half on the map, half on the card, at the map's bottom right.
  mapEdge: { position: 'absolute', right: 16, top: MAP_HEIGHT - 16 },
  kicker: { color: c.accent },
  text: { color: c.text },
  muted: { color: c.textMuted },
  pressed: { opacity: pressedOpacity },
});

import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useHere } from '../../hooks/useHere';
import { useSavedLines } from '../../hooks/usePlanRoutes';
import { useStyles, useTheme } from '../../hooks/useTheme';
import { dayColorFor, pressedOpacity, radius, spacing, type } from '../../theme';
import { dateKey, dateOf, driveRoute, driveRouteName, groupPlans, mapPlanOf, planKicker } from '../../utils/plans';
import { getReadyRoute } from '../../utils/readyRoutes';
import RoutePreview from '../RoutePreview';
import Button from '../ui/Button';
import SectionHeader from '../ui/SectionHeader';

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
 * Home's Up next card: the next planned trip's map (its saved road lines),
 * date line and name, then the next day to drive with Open plan, or on the
 * trip's days a filled Start Day N that opens the plan's Start drive sheet.
 * `active` keeps the native map only while Home is showing.
 */
export default function UpNext({ plan, driven, now, active }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const { here } = useHere();
  const lines = useLines(plan, here, c.accent);
  const next = Math.max(
    0,
    plan.drives.findIndex((d) => !driven.has(d.id))
  );
  const route = driveRouteName(plan, next, here) ?? 'No stops yet';
  const today = plan.startDate <= dateKey(new Date(now));
  const open = () => router.push(`/plans/${plan.id}`);
  const start = () => router.push({ pathname: `/plans/${plan.id}`, params: { start: '1' } });

  return (
    <>
      <SectionHeader title="Up next" />
      <View style={styles.card}>
        <Pressable
          onPress={open}
          accessibilityRole="link"
          accessibilityLabel={`${plan.name}, ${planKicker(plan).toLowerCase()}`}
          style={({ pressed }) => pressed && styles.pressed}
        >
          {lines ? <RoutePreview segments={lines} height={132} active={active} /> : null}
          <View style={styles.body}>
            <Text style={[type.caps, styles.kicker]} numberOfLines={1}>
              {planKicker(plan)}
            </Text>
            <Text style={[type.section, styles.text]} numberOfLines={1}>
              {plan.name}
            </Text>
          </View>
        </Pressable>
        <View style={styles.divider} />
        <View style={styles.day}>
          <View style={styles.dayText}>
            <View style={styles.dayLabel}>
              <View style={[styles.dot, { backgroundColor: dayColorFor(c, next + 1) }]} />
              <Text style={[type.label, styles.text]}>Day {next + 1}</Text>
            </View>
            <Text style={[type.small, styles.muted]} numberOfLines={1}>
              {route}
            </Text>
          </View>
          {today ? (
            <Button label={`Start Day ${next + 1}`} size="small" onPress={start} />
          ) : (
            <Button label="Open plan" variant="tonal" size="small" onPress={open} />
          )}
        </View>
      </View>
    </>
  );
}

const makeStyles = (c) => ({
  card: { borderRadius: radius.card, overflow: 'hidden', backgroundColor: c.card, ...c.cardShadow },
  body: { paddingTop: 14, paddingBottom: 14, paddingHorizontal: 20, gap: 2 },
  kicker: { color: c.accent },
  text: { color: c.text },
  muted: { color: c.textMuted },
  divider: { height: 1, marginHorizontal: 20, backgroundColor: c.divider },
  day: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingLeft: 20, paddingRight: spacing.md },
  dayText: { flex: 1, minWidth: 0, gap: 2 },
  dayLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  pressed: { opacity: pressedOpacity },
});

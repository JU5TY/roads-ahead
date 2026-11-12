import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { pressedOpacity, radius, type } from '../../theme';
import { formatDateRange } from '../../utils/format';
import { planKicker, planOutline, stopCounts, stopName, withWayBack } from '../../utils/plans';
import RouteThumb from '../RouteThumb';
import Icon from '../ui/Icon';

/**
 * A plan on the Planned tab, like a Trips card: blue date line (grey with no
 * date), name, "23 stops" (or "Straight to Inverness"), an Iconic Roads chip, and the planned outline dotted
 * in the round thumbnail. `done` adds a "Driven 11–12 Oct 2026" chip, its
 * dates from `drivenDates` ({ from, to }). Tapping opens the plan.
 */
export default function PlanCard({ plan, done = false, drivenDates = null }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const { stops, roads } = stopCounts(plan);
  const end = plan.drives.flatMap((d) => d.stops).at(-1);
  const segments = useMemo(
    () =>
      planOutline(withWayBack(plan, null)).map(({ index, coordinates }) => ({
        key: `drive-${index}`,
        coordinates,
        color: c.accent,
        dotted: true,
      })),
    [plan, c.accent]
  );

  return (
    <Pressable
      onPress={() => router.push(`/plans/${plan.id}`)}
      accessibilityRole="link"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.text}>
        <Text style={[type.caps, plan.startDate ? styles.kicker : styles.muted]} numberOfLines={1}>
          {planKicker(plan)}
        </Text>
        <Text style={[type.bodyStrong, styles.title]} numberOfLines={1}>
          {plan.name}
        </Text>
        <Text style={[type.body, styles.muted]} numberOfLines={1}>
          {stops > 0
            ? `${stops} ${stops === 1 ? 'stop' : 'stops'}`
            : !end
              ? 'No stops yet'
              : `${end.roadId ? 'Along' : 'Straight to'} ${stopName(end)}`}
        </Text>
        {roads > 0 || done ? (
          <View style={styles.chips}>
            {roads > 0 ? (
              <View style={[styles.chip, styles.roadChip]}>
                <Icon name="verified" size={14} color={c.onRoadContainer} />
                <Text style={[type.nav, styles.roadChipText]}>
                  {roads} {roads === 1 ? 'Iconic Road' : 'Iconic Roads'}
                </Text>
              </View>
            ) : null}
            {done ? (
              <View style={[styles.chip, styles.outlinedChip]}>
                <Icon name="check" size={14} color={c.textMuted} />
                <Text style={[type.nav, styles.muted]}>
                  {drivenDates ? `Driven ${formatDateRange(drivenDates.from, drivenDates.to)}` : 'Driven'}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      <RouteThumb segments={segments} />
    </Pressable>
  );
}

const makeStyles = (c) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.card,
    backgroundColor: c.card,
    ...c.cardShadow,
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  kicker: { color: c.accent },
  title: { color: c.text },
  muted: { color: c.textMuted },
  chips: { flexDirection: 'row', gap: 6, marginTop: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6 },
  roadChip: { paddingVertical: 2, paddingLeft: 6, paddingRight: 8, backgroundColor: c.roadContainer },
  roadChipText: { color: c.onRoadContainer },
  outlinedChip: {
    paddingVertical: 1,
    paddingLeft: 5,
    paddingRight: 7,
    borderWidth: 1,
    borderColor: c.outline,
  },
  pressed: { opacity: pressedOpacity },
});

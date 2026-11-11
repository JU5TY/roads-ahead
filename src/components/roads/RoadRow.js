import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { pressedOpacity, radius, type } from '../../theme';
import RouteThumb from '../RouteThumb';
import Icon from '../ui/Icon';

const THUMB = 48;

/**
 * One Iconic Road (or ready-made route), a card like a Trips card: green once
 * completed, blue when it's `planned` (a ready-made route in your plans),
 * white otherwise, with its
 * shape on the right like a Trips card (a tick on it once completed, a
 * bookmark once planned). `line` is its [latitude, longitude] points.
 * `subtitle` is e.g. "Completed 2 times · Day 3" or "Peak District · 21 km".
 */
export default function RoadRow({ name, subtitle, line, completed, planned = false, onPress }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const blue = planned && !completed;
  const fg = completed ? c.onRoadContainer : blue ? c.onAccentContainer : c.text;
  const muted = completed ? c.roadContainerMuted : blue ? c.accentContainerMuted : c.textMuted;
  const segments = useMemo(
    () => [
      {
        key: 'road',
        coordinates: (line ?? []).map(([latitude, longitude]) => ({ latitude, longitude })),
        color: c.accent,
      },
    ],
    [line, c.accent]
  );
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [
        styles.row,
        completed ? styles.completed : blue ? styles.planned : styles.notYet,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.text}>
        <Text style={[type.bodyStrong, { color: fg }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[type.small, { color: muted }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <View>
        <RouteThumb segments={segments} size={THUMB} />
        {completed ? (
          <View style={styles.badge}>
            <Icon name="check" size={13} color={c.onRoadBadge} />
          </View>
        ) : blue ? (
          <View style={[styles.badge, styles.plannedBadge]}>
            <Icon name="bookmark" filled size={13} color={c.onAccent} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const makeStyles = (c) => ({
  // As a Trips or plan card: same padding and shadow, whatever its colour.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.card,
    ...c.cardShadow,
  },
  completed: { backgroundColor: c.roadContainer },
  planned: { backgroundColor: c.accentContainer },
  notYet: { backgroundColor: c.card },
  text: { flex: 1, minWidth: 0 },
  // Sits on the thumbnail's corner, ringed in the row colour so it reads as cut out.
  badge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: c.roadContainer,
    backgroundColor: c.roadBadge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plannedBadge: { borderColor: c.accentContainer, backgroundColor: c.accent },
  pressed: { opacity: pressedOpacity },
});

import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { pressedOpacity, radius, type } from '../../theme';
import RouteThumb from '../RouteThumb';
import Icon from '../ui/Icon';

const THUMB = 48;

/**
 * One Iconic Road: green once completed, outlined when not yet, with the road's
 * shape on the right like a Trips card (a tick on it once completed).
 * `line` is the road's [latitude, longitude] points.
 * `subtitle` is e.g. "Completed 2 times · Day 3" or "Peak District · 21 km".
 */
export default function RoadRow({ name, subtitle, line, completed, onPress }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const fg = completed ? c.onRoadContainer : c.text;
  const muted = completed ? c.roadContainerMuted : c.textMuted;
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
        completed ? styles.completed : styles.notYet,
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
        ) : null}
      </View>
    </Pressable>
  );
}

const makeStyles = (c) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: radius.card },
  completed: { backgroundColor: c.roadContainer, paddingVertical: 12, paddingHorizontal: 16 },
  notYet: {
    backgroundColor: c.outlinedRow,
    borderWidth: 1,
    borderColor: c.outline,
    paddingVertical: 11,
    paddingHorizontal: 15,
  },
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
  pressed: { opacity: pressedOpacity },
});

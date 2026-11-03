import { Pressable, Text, View } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { pressedOpacity, radius, type } from '../../theme';
import Icon from '../ui/Icon';

/**
 * One Iconic Road: green with a tick once completed, outlined when not yet.
 * `subtitle` is e.g. "Completed 2 times · Day 3" or "Peak District · 21 km".
 */
export default function RoadRow({ name, subtitle, completed, onPress, chevron = false }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const fg = completed ? c.onRoadContainer : c.text;
  const muted = completed ? c.roadContainerMuted : c.textMuted;
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
      <Icon
        name={completed ? 'verified' : 'route'}
        size={24}
        color={completed ? c.onRoadContainer : c.textMuted}
      />
      <View style={styles.text}>
        <Text style={[type.bodyStrong, { color: fg }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[type.small, { color: muted }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {chevron ? <Icon name="chevron_right" size={24} color={muted} /> : null}
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
  pressed: { opacity: pressedOpacity },
});

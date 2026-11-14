import { Pressable, Text } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { pressedOpacity, radius, type } from '../../theme';
import { formatDurationShort } from '../../utils/format';
import Icon from '../ui/Icon';

/**
 * Amber line under a plan's (or an Iconic Trip's) headline: "Day 2 is 7h 40m of
 * driving", for a day over LONG_DAY_S. With `onPress` it opens that day (a chevron).
 */
export default function LongDayNote({ day, seconds, onPress }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.note, pressed && styles.pressed]}
    >
      <Icon name="warning" filled size={22} color={c.onWarningContainer} />
      <Text style={[type.bodyStrong, styles.text]}>
        Day {day} is {formatDurationShort(seconds * 1000)} of driving
      </Text>
      {onPress ? <Icon name="chevron_right" size={22} color={c.onWarningContainer} /> : null}
    </Pressable>
  );
}

const makeStyles = (c) => ({
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.card,
    backgroundColor: c.warningContainer,
  },
  text: { flex: 1, color: c.onWarningContainer },
  pressed: { opacity: pressedOpacity },
});

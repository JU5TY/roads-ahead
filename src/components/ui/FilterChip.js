import { Pressable, Text, View } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { type } from '../../theme';
import Icon from './Icon';

/**
 * One option in a sideways row of filters (Iconic Roads' countries, a trip's
 * drives): a tick when selected, an optional colour `dot` (a drive's day colour).
 */
export default function FilterChip({ label, selected, dot, onPress }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      style={[styles.chip, selected ? styles.chipOn : styles.chipOff]}
    >
      {selected ? <Icon name="check" size={18} color={c.onAccentContainer} /> : null}
      {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
      <Text style={[type.label, selected ? styles.textOn : styles.textOff]}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (c) => ({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  chipOn: { gap: 4, paddingLeft: 10, backgroundColor: c.accentContainer },
  chipOff: { borderWidth: 1, borderColor: c.outline },
  dot: { width: 8, height: 8, borderRadius: 4 },
  textOn: { color: c.onAccentContainer },
  textOff: { color: c.textMuted, fontFamily: type.nav.fontFamily },
});

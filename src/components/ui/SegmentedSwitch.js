import { Pressable, Text, View } from 'react-native';

import { useStyles } from '../../hooks/useTheme';
import { type } from '../../theme';

/**
 * Two or three options side by side on a grey track, the chosen one filled
 * blue: the Trip page's Elevation | Speed, Trips' Driven | Planned.
 * options: [[value, label]]; `stretch` shares the full width out evenly.
 */
export default function SegmentedSwitch({ options, value, onChange, stretch = false, style }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={[styles.track, style]} role="radiogroup">
      {options.map(([option, label]) => {
        const on = option === value;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            style={[styles.option, stretch && styles.stretch, on && styles.optionOn]}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
          >
            <Text style={[type.label, on ? styles.textOn : styles.text]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (c) => ({
  track: { flexDirection: 'row', gap: 4, backgroundColor: c.track, borderRadius: 20, padding: 4 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  stretch: { flex: 1 },
  optionOn: { backgroundColor: c.accent },
  text: { color: c.textMuted },
  textOn: { color: c.onAccent },
});

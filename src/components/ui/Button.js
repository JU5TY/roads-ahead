import { Pressable, Text } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { pressedOpacity, radius, type } from '../../theme';
import Icon from './Icon';

const SIZES = {
  large: { height: 64, iconSize: 26, text: { ...type.button, fontSize: 18, lineHeight: 24 } },
  medium: { height: 56, iconSize: 22, text: { ...type.bodyStrong } },
  small: { height: 48, iconSize: 20, text: type.button },
};

/**
 * Pill button. variant: 'filled' (green) | 'tonal' (light green) | 'outlined' |
 * 'text'. The label shrinks with "…" when space runs out; `trailing` (e.g.
 * "· Day 4") always stays visible.
 */
export default function Button({
  label,
  trailing,
  icon,
  iconFilled = false,
  variant = 'filled',
  size = 'medium',
  onPress,
  disabled = false,
  style,
  accessibilityLabel,
}) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const s = SIZES[size];
  const fg = {
    filled: c.onAccent,
    tonal: c.onAccentContainer,
    outlined: c.accent,
    text: c.accent,
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [label, trailing].filter(Boolean).join(' ')}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        { height: s.height, borderRadius: s.height / 2 },
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={s.iconSize} color={fg} filled={iconFilled} /> : null}
      <Text style={[s.text, styles.label, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
      {trailing ? <Text style={[s.text, styles.trailing, { color: fg }]}>{trailing}</Text> : null}
    </Pressable>
  );
}

const makeStyles = (c) => ({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
  },
  filled: { backgroundColor: c.accent },
  tonal: { backgroundColor: c.accentContainer },
  outlined: { borderWidth: 1, borderColor: c.outline },
  text: { paddingHorizontal: 12 },
  label: { flexShrink: 1 },
  // Pull "· Day 4" back from the 10px gap so the dot has a space's width on
  // both sides, as if it were one line of text.
  trailing: { flexShrink: 0, marginLeft: -6 },
  pressed: { opacity: pressedOpacity },
  disabled: { opacity: 0.4 },
});

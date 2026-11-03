import { Pressable, Text, View } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { type } from '../../theme';
import Icon from './Icon';

/**
 * Round icon button. variant: 'floating' (white with shadow, over the map) |
 * 'surface' (grey) | 'record' (Record's controls) | 'filled' (blue) | 'stop' (red) |
 * 'pause' (near-black, white in dark mode) | 'plain' (no fill). With `label`, the caption sits under the circle (Record's
 * Maps / Stop row); `labelStyle` sets its size.
 */
export default function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  variant = 'surface',
  size = 48,
  iconSize = 24,
  filled = false,
  label,
  labelStyle,
  style,
}) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const bg = {
    floating: c.floating,
    surface: c.track,
    record: c.recordControl,
    filled: c.accent,
    stop: c.stop,
    pause: c.textStrong,
    plain: 'transparent',
  }[variant];
  const fg =
    { filled: c.onAccent, stop: c.onStop, record: c.onRecordControl, pause: c.screen }[variant] ??
    c.text;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={size < 48 ? (48 - size) / 2 : 0}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed, style]}
    >
      <View
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
          variant === 'floating' && styles.shadow,
        ]}
      >
        <Icon name={icon} size={iconSize} color={fg} filled={filled} />
      </View>
      {label ? <Text style={[type.smallStrong, styles.label, labelStyle]}>{label}</Text> : null}
    </Pressable>
  );
}

const makeStyles = (c) => ({
  wrap: { alignItems: 'center', gap: 8 },
  circle: { alignItems: 'center', justifyContent: 'center' },
  shadow: {
    shadowColor: c.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  label: { color: c.text },
  pressed: { opacity: 0.8 },
});

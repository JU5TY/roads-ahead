import { Pressable, Text } from 'react-native';

import { useStyles } from '../../hooks/useTheme';
import { floating, pressedOpacity, type } from '../../theme';
import Icon from './Icon';

/**
 * The floating pill bottom right: Record (red dot), Plan (blue +), a
 * plan's Drive 1 (green play). One look for all of them, a white pill on a
 * shadow; the icon carries the colour. With no `label` it's a round button
 * (Record while a drive is recording). `trailing` follows the label (an
 * Iconic Trip's Premium tag). Place it with `style` (position,
 * bottom); `accessibilityLabel` says what it does when the label alone doesn't.
 */
export default function FloatingButton({
  icon,
  iconColor,
  filled = false,
  label,
  trailing,
  onPress,
  accessibilityLabel,
  style,
}) {
  const styles = useStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [styles.pill, !label && styles.round, style, pressed && styles.pressed]}
    >
      <Icon name={icon} filled={filled} size={26} color={iconColor} />
      {label ? <Text style={[type.button, styles.text]}>{label}</Text> : null}
      {trailing}
    </Pressable>
  );
}

const makeStyles = (c) => ({
  pill: {
    position: 'absolute',
    right: 16,
    height: floating.recordPill.height,
    borderRadius: floating.recordPill.height / 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 16,
    paddingRight: 22,
    backgroundColor: c.floating,
    shadowColor: c.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  round: { width: floating.recordPill.height, paddingLeft: 0, paddingRight: 0, justifyContent: 'center' },
  text: { color: c.text },
  pressed: { opacity: pressedOpacity },
});

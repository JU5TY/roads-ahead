import { Pressable, Text, View } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { pressedOpacity, radius, type } from '../../theme';
import Icon from './Icon';

/**
 * A card that is one big button: icon in a blue well, title, a line under it and
 * a chevron. The Trip page's Photos and Print cards and the You page's Premium
 * card all use it, so they look the same. `filled` fills the icon; `style` sets
 * the card's margins.
 */
export default function BannerCard({
  icon,
  filled = false,
  title,
  subtitle,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  style,
}) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.card, style, pressed && styles.pressed]}
    >
      <View style={styles.well}>
        <Icon name={icon} filled={filled} size={26} color={c.onAccentContainer} />
      </View>
      <View style={styles.flex}>
        <Text style={[type.bodyStrong, styles.text]}>{title}</Text>
        <Text style={[type.bodySmall, styles.muted]}>{subtitle}</Text>
      </View>
      <Icon name="chevron_right" size={24} color={c.textMuted} />
    </Pressable>
  );
}

const makeStyles = (c) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    // Its text lines up with the Driving time card's.
    paddingVertical: 16,
    paddingLeft: 20,
    paddingRight: 12,
    borderRadius: radius.card,
    backgroundColor: c.card,
    ...c.cardShadow,
  },
  pressed: { opacity: pressedOpacity },
  well: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.accentContainer,
  },
  flex: { flex: 1, gap: 2 },
  text: { color: c.text },
  muted: { color: c.textMuted },
});

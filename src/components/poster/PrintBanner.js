import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { pressedOpacity, radius, type } from '../../theme';
import { SIZES } from '../../utils/posterLayout';
import Icon from '../ui/Icon';

/**
 * The Trip page's way in to printing the whole trip, or `drive` alone when one is
 * picked. Matches the Photos card above it. Opens the print page.
 */
export default function PrintBanner({ trip, drive }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const what = drive ? 'drive' : 'trip';

  return (
    <Pressable
      onPress={() =>
        router.push(drive ? `/poster?trip=${trip.id}&drive=${drive.id}` : `/poster?trip=${trip.id}`)
      }
      accessibilityRole="button"
      accessibilityLabel={`Print this ${what}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.well}>
        <Icon name="wall_art" size={26} color={c.onAccentContainer} />
      </View>
      <View style={styles.flex}>
        <Text style={[type.bodyStrong, styles.text]}>Print this {what}</Text>
        <Text style={[type.bodySmall, styles.muted]}>
          Turn your route into gallery art for your wall, from {SIZES.A3.price}
        </Text>
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
    marginTop: 28,
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

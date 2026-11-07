import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { useTripPreview } from '../../hooks/useTripPreview';
import { pressedOpacity, radius, type } from '../../theme';
import { posterSpec, posterText } from '../../utils/poster';
import { PAGE, SIZES } from '../../utils/posterLayout';
import Icon from '../ui/Icon';
import PosterCard from './PosterCard';

const THUMB_WIDTH = 48; // as wide as the icon wells above, so the text lines up
const THUMB_POINTS = 600; // plenty for a poster this small

/**
 * The Trip page's way in to printing: the poster of the whole trip, or of `drive`
 * alone when one is picked, shrunk beside a line about it. Opens the print page.
 */
export default function PrintBanner({ trip, drive, vehicles, units }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const previewOf = useMemo(() => ({ drives: drive ? [drive] : trip.drives }), [trip, drive]);
  const segments = useTripPreview(previewOf, { points: THUMB_POINTS });
  const spec = useMemo(
    () =>
      segments
        ? posterSpec({ text: posterText(trip, drive, vehicles, units), segments, size: 'A3' })
        : null,
    [segments, trip, drive, vehicles, units]
  );
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
      <View style={styles.thumb}>{spec ? <PosterCard spec={spec} width={THUMB_WIDTH} /> : null}</View>
      <View style={styles.flex}>
        <Text style={[type.bodyStrong, styles.text]}>Print this {what}</Text>
        <Text style={[type.bodySmall, styles.muted]}>
          An A3 or A2 poster of your route or photo, from {SIZES.A3.price}
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
  // Paper casts a shadow in dark mode too.
  thumb: {
    width: THUMB_WIDTH,
    height: (THUMB_WIDTH * PAGE.height) / PAGE.width,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  flex: { flex: 1, gap: 2 },
  text: { color: c.text },
  muted: { color: c.textMuted },
});

import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { useStyles } from '../../hooks/useTheme';
import { pressedOpacity, radius, spacing, type } from '../../theme';
import { ICONIC_ROADS } from '../../utils/iconicRoads';
import { READY_ROUTES } from '../../utils/readyRoutes';
import RoadsRing from '../roads/RoadsRing';
import SectionHeader from '../ui/SectionHeader';

/** One half of the Iconic card: a ring, its name and how far along you are; opens its list. */
function IconicHalf({ completed, total, title, onPress }) {
  const styles = useStyles(makeStyles);
  const line = completed ? `${completed} of ${total} completed` : 'Not completed yet';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`${title}: ${line}`}
      style={({ pressed }) => [styles.half, pressed && styles.pressed]}
    >
      <RoadsRing completed={completed} total={total} of={title} size="small" />
      <View style={styles.halfText}>
        <Text style={[type.bodyStrong, styles.text]}>{title}</Text>
        <Text style={[type.small, styles.muted]}>{line}</Text>
      </View>
    </Pressable>
  );
}

/**
 * Iconic Trips and Iconic Roads side by side, each half opening its list:
 * `roadsDone` and `tripsDone` of them completed (Home: all of them; a
 * vehicle's page: those driven in it).
 */
export default function IconicCard({ roadsDone, tripsDone }) {
  const styles = useStyles(makeStyles);
  return (
    <>
      <SectionHeader title="Iconic" />
      <View style={styles.iconic}>
        <IconicHalf
          completed={tripsDone}
          total={READY_ROUTES.length}
          title="Iconic Trips"
          onPress={() => router.push('/routes')}
        />
        <View style={styles.iconicDivider} />
        <IconicHalf
          completed={roadsDone}
          total={ICONIC_ROADS.length}
          title="Iconic Roads"
          onPress={() => router.push('/roads')}
        />
      </View>
    </>
  );
}

const makeStyles = (c) => ({
  text: { color: c.text },
  muted: { color: c.textMuted },
  // As Home's other cards; a hairline between the halves.
  iconic: { flexDirection: 'row', borderRadius: radius.card, backgroundColor: c.card, ...c.cardShadow },
  iconicDivider: { width: 1, marginVertical: spacing.md, backgroundColor: c.divider },
  half: { flex: 1, alignItems: 'center', gap: 10, paddingVertical: 18, paddingHorizontal: spacing.sm },
  halfText: { alignItems: 'center', gap: 2 },
  pressed: { opacity: pressedOpacity },
});

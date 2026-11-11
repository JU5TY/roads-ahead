import { Pressable, Text, View } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { pressedOpacity, spacing, type } from '../../theme';
import { stopName } from '../../utils/plans';
import Button from '../ui/Button';
import Icon from '../ui/Icon';

/**
 * Record's card on a planned drive, from planProgress: "Next: Fort Augustus ·
 * Then Eilean Donan" (tap to navigate there), or once you're at a stop
 * "You're at Fort Augustus" with Next leg when the sat nav needs the next one
 * handed over (`nextLeg`: Waze, or a drive too long for one Google link).
 * Nothing once the finish is behind you. No "stop" in its words: the red Stop
 * button is just below.
 */
export default function PlanCard({ progress, nextLeg, onNavigate, onNextLeg }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const { at, next, then, finished } = progress;
  if (finished && !at) return null;

  const well = (
    <View style={styles.well}>
      <Icon name="location_on" filled size={26} color={c.accent} />
    </View>
  );

  if (at) {
    return (
      <View style={styles.card}>
        <View style={styles.row}>
          {well}
          <View style={styles.flex}>
            <Text style={[type.bodyStrong, styles.text]} numberOfLines={1}>
              {`You’re at ${stopName(at)}`}
            </Text>
            {!next ? <Text style={[type.bodySmall, styles.muted]}>The finish</Text> : null}
            {next && !nextLeg ? (
              <Text style={[type.bodySmall, styles.muted]} numberOfLines={1}>
                {`Next: ${stopName(next)}`}
              </Text>
            ) : null}
          </View>
        </View>
        {next && nextLeg ? (
          <Button label={`Next leg: ${stopName(next)}`} icon="near_me" onPress={onNextLeg} style={styles.button} />
        ) : null}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onNavigate}
      accessibilityRole="button"
      accessibilityHint="Opens the sat nav"
      style={({ pressed }) => [styles.card, styles.row, pressed && styles.pressed]}
    >
      {well}
      <View style={styles.flex}>
        <Text style={[type.bodyStrong, styles.text]} numberOfLines={1}>
          {`Next: ${stopName(next)}`}
        </Text>
        <Text style={[type.bodySmall, styles.muted]} numberOfLines={1}>
          {then ? `Then ${stopName(then)}` : 'The finish'}
        </Text>
      </View>
      <Icon name="chevron_right" size={24} color={c.textMuted} />
    </Pressable>
  );
}

const makeStyles = (c) => ({
  card: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: c.card,
    ...c.cardShadow,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  well: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.accentContainer,
  },
  flex: { flex: 1, minWidth: 0 },
  button: { marginTop: 14 },
  text: { color: c.text },
  muted: { color: c.textMuted },
  pressed: { opacity: pressedOpacity },
});

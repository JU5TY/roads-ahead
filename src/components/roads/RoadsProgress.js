import { Text, View } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { radius, type } from '../../theme';

/** "2 of 11 completed" with a progress bar. `children` sit under the bar. */
export default function RoadsProgress({ completed, total, children, style }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const share = total > 0 ? completed / total : 0;
  return (
    <View
      style={[styles.card, { backgroundColor: c.card }, c.cardShadow, style]}
      accessible
      accessibilityLabel={`${completed} of ${total} Iconic Roads completed`}
    >
      <View style={styles.count}>
        <Text style={[type.stat, styles.number]}>{completed}</Text>
        <Text style={[type.bodyLarge, styles.muted]}>of {total} completed</Text>
      </View>
      <View style={styles.track}>
        {completed > 0 ? (
          <View style={[styles.fill, { width: `${Math.max(share * 100, 3)}%` }]} />
        ) : null}
      </View>
      {children}
    </View>
  );
}

const makeStyles = (c) => ({
  card: { borderRadius: radius.card, padding: 20 },
  count: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  number: { color: c.text },
  muted: { color: c.textMuted },
  track: { height: 8, borderRadius: 4, backgroundColor: c.progressTrack, marginTop: 14 },
  fill: { height: 8, borderRadius: 4, backgroundColor: c.accent },
});

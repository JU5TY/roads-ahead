import { Text, View } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { radius, type } from '../../theme';
import Icon from './Icon';

/**
 * One card, a column per stat: icon, number (unit in grey), label.
 * `stats` is [{ icon, value, unit?, label }], best kept to three.
 */
export default function StatRow({ stats, style }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View style={[styles.row, style]}>
      {stats.map(({ icon, value, unit, label }, i) => (
        <View
          key={label}
          style={[styles.stat, i > 0 && styles.divider]}
          accessible
          accessibilityLabel={`${label} ${value}${unit ? ` ${unit}` : ''}`}
        >
          <Icon name={icon} size={22} color={c.textMuted} />
          <Text style={[styles.centre, styles.number]} numberOfLines={1} adjustsFontSizeToFit>
            <Text style={[type.stat, styles.value]}>{value}</Text>
            {unit ? (
              <Text style={[type.body, styles.muted]}>{unit === '%' ? unit : ` ${unit}`}</Text>
            ) : null}
          </Text>
          <Text style={[type.small, styles.muted, styles.centre]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const makeStyles = (c) => ({
  row: {
    flexDirection: 'row',
    paddingTop: 16,
    paddingBottom: 14,
    borderRadius: radius.card,
    backgroundColor: c.card,
    ...c.cardShadow,
  },
  stat: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2, paddingHorizontal: 8 },
  divider: { borderLeftWidth: 1, borderLeftColor: c.divider },
  centre: { textAlign: 'center' },
  number: { marginTop: 4 },
  // Shrinks to fit when three long values sit side by side.
  value: { color: c.accent },
  muted: { color: c.textMuted },
});

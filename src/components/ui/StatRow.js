import { Fragment } from 'react';
import { Text, View } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { fonts, radius, type } from '../../theme';
import Icon from './Icon';

/**
 * Stats side by side in one card, split by a divider (as Home's Iconic card):
 * a small blue icon beside a grey label, the number under them (unit in grey).
 * `stats` is [{ icon, value, unit?, label, note?, caution? }], kept to two so
 * the numbers never squash; one fills the card. `note` ("Unavailable") stands
 * in for a value it can't show; `caution` (a plan's long day) turns the icon
 * and number amber and says so under the number.
 */
export default function StatRow({ stats, style }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View style={[styles.card, c.cardShadow, style]}>
      {stats.map(({ icon, value, unit, label, note = null, caution = false }, i) => {
        const fg = caution ? c.onWarningContainer : c.text;
        return (
          <Fragment key={label}>
            {i > 0 ? <View style={styles.divider} /> : null}
            <View
              style={styles.half}
              accessible
              accessibilityLabel={`${label}: ${note ?? `${value}${unit ? ` ${unit}` : ''}`}${caution ? ', a long day' : ''}`}
            >
              <View style={styles.labelRow}>
                <Icon name={icon} size={16} color={caution ? c.onWarningContainer : c.accent} />
                <Text style={[type.small, styles.muted]} numberOfLines={1}>
                  {label}
                </Text>
              </View>
              {note ? (
                <Text style={[type.bodyLarge, styles.note, { color: fg }]}>{note}</Text>
              ) : (
                <Text style={[type.stat, styles.value, { color: fg }]} numberOfLines={1} adjustsFontSizeToFit>
                  {value}
                  {unit ? <Text style={[type.statUnit, styles.muted]}> {unit}</Text> : null}
                </Text>
              )}
              {caution ? <Text style={[type.small, { color: fg }]}>A long day</Text> : null}
            </View>
          </Fragment>
        );
      })}
    </View>
  );
}

const makeStyles = (c) => ({
  card: {
    flexDirection: 'row',
    gap: 16,
    borderRadius: radius.card,
    backgroundColor: c.card,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  divider: { width: 1, backgroundColor: c.divider },
  half: { flex: 1, minWidth: 0 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  muted: { color: c.textMuted },
  value: { marginTop: 2 },
  // In place of a value: on the value's line, not as tall, but in its colour
  // and weight so it reads as the answer under the grey label.
  note: { marginTop: 6, fontFamily: fonts.medium },
});

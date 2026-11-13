import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { type } from '../../theme';

// [diameter, stroke]: the big ring heading a list, and Home's small one.
const SIZES = { large: [168, 12], small: [84, 8] };

/**
 * Teal progress ring: "2 of 11" Iconic Roads (or `of`, e.g. Iconic Trips)
 * completed. `size` 'small' (Home's Iconic card) reads "2/11" on one line.
 */
export default function RoadsRing({ completed, total, of = 'Iconic Roads', size = 'large' }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const [diameter, stroke] = SIZES[size];
  const r = (diameter - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const share = total > 0 ? completed / total : 0;
  const small = size === 'small';
  return (
    <View
      style={{ width: diameter, height: diameter }}
      accessible
      accessibilityLabel={`${completed} of ${total} ${of} completed`}
    >
      <Svg width={diameter} height={diameter} style={styles.svg}>
        <Circle cx={diameter / 2} cy={diameter / 2} r={r} fill="none" stroke={c.ringTrack} strokeWidth={stroke} />
        {completed > 0 ? (
          <Circle
            cx={diameter / 2}
            cy={diameter / 2}
            r={r}
            fill="none"
            stroke={c.ringFill}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circumference * share} ${circumference}`}
          />
        ) : null}
      </Svg>
      {small ? (
        <View style={[styles.centre, styles.row]}>
          <Text style={[type.bodyStrong, styles.smallNumber]}>{completed}</Text>
          <Text style={[type.small, styles.muted, styles.smallOf]}>/{total}</Text>
        </View>
      ) : (
        <View style={styles.centre}>
          <Text style={[type.display, styles.number]}>{completed}</Text>
          <Text style={[type.bodyLarge, styles.muted, styles.of]}>of {total}</Text>
        </View>
      )}
    </View>
  );
}

const makeStyles = (c) => ({
  svg: { transform: [{ rotate: '-90deg' }] },
  centre: {
    ...{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
    alignItems: 'center',
    justifyContent: 'center',
  },
  number: { fontSize: 52, lineHeight: 56, letterSpacing: 0, color: c.ringNumber },
  muted: { color: c.textMuted },
  of: { marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'baseline' },
  smallNumber: { fontSize: 20, lineHeight: 24, color: c.ringNumber },
  smallOf: { marginLeft: 1 },
});

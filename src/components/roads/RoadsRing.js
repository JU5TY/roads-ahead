import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { type } from '../../theme';

const SIZE = 168;
const STROKE = 12;
const R = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

/** Teal progress ring: "2 of 11" Iconic Roads (or `of`, e.g. Iconic Trips) completed. */
export default function RoadsRing({ completed, total, of = 'Iconic Roads' }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const share = total > 0 ? completed / total : 0;
  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityLabel={`${completed} of ${total} ${of} completed`}
    >
      <Svg width={SIZE} height={SIZE} style={styles.svg}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={c.ringTrack}
          strokeWidth={STROKE}
        />
        {completed > 0 ? (
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke={c.ringFill}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${CIRCUMFERENCE * share} ${CIRCUMFERENCE}`}
          />
        ) : null}
      </Svg>
      <View style={styles.centre}>
        <Text style={[type.display, styles.number]}>{completed}</Text>
        <Text style={[type.bodyLarge, styles.muted]}>of {total}</Text>
      </View>
    </View>
  );
}

const makeStyles = (c) => ({
  wrap: { width: SIZE, height: SIZE },
  svg: { transform: [{ rotate: '-90deg' }] },
  centre: {
    ...{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
    alignItems: 'center',
    justifyContent: 'center',
  },
  number: { fontSize: 52, lineHeight: 56, letterSpacing: 0, color: c.ringNumber },
  muted: { color: c.textMuted, marginTop: 4 },
});

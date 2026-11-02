import { View } from 'react-native';

import { useStyles } from '../hooks/useTheme';

/**
 * A map marker's look: a filled dot (start, finish) or, for a rest stop, a
 * ring in its route colour. The same marks as the Trips list outline and the
 * Timeline. Goes inside a react-native-maps <Marker> anchored at its centre.
 * `selected` sets it in a soft halo of its colour: the marker whose card is
 * showing. Colours are #RRGGBB. `size` is for the mark on a MapCard.
 */
export default function MapDot({ kind, color, selected = false, size = 10 }) {
  const styles = useStyles(makeStyles);
  const dims = { width: size, height: size, borderRadius: size / 2 };
  const dot = (
    <View
      style={[
        kind === 'stop'
          ? [styles.ring, { borderColor: color }]
          : [styles.dot, { backgroundColor: color }],
        dims,
      ]}
    />
  );
  return selected ? (
    <View style={[styles.halo, { backgroundColor: `${color}40` }]}>{dot}</View>
  ) : (
    dot
  );
}

const makeStyles = (c) => ({
  dot: {
    borderWidth: 2,
    borderColor: c.mapRoad,
  },
  ring: {
    borderWidth: 3,
    backgroundColor: c.mapRoad,
  },
  halo: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});

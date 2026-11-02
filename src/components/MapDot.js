import { View } from 'react-native';

import { useStyles } from '../hooks/useTheme';

/**
 * A map marker's look: a filled dot (start, finish) or, for a rest stop, a
 * ring in its route colour. The same marks as the Trips list outline and the
 * Timeline. Goes inside a react-native-maps <Marker> anchored at its centre.
 */
export default function MapDot({ kind, color }) {
  const styles = useStyles(makeStyles);
  return (
    <View
      style={
        kind === 'stop'
          ? [styles.ring, { borderColor: color }]
          : [styles.dot, { backgroundColor: color }]
      }
    />
  );
}

const makeStyles = (c) => ({
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: c.mapRoad,
  },
  ring: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 3,
    backgroundColor: c.mapRoad,
  },
});

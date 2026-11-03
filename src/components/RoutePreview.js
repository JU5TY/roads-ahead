import { StyleSheet, View } from 'react-native';
import MapView, { Polyline } from 'react-native-maps';

import { useStyles, useTheme } from '../hooks/useTheme';
import DotMarker from './DotMarker';
import MapDot from './MapDot';

/** Region that fits all coordinates with some padding (no imperative fitting needed). */
function regionFor(coordinates) {
  const lats = coordinates.map((c) => c.latitude);
  const lngs = coordinates.map((c) => c.longitude);
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)];
  const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)];
  const PADDING = 1.35; // leave room around the route
  const MIN_DELTA = 0.005; // ~500 m, so a short drive isn't zoomed to street level
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * PADDING, MIN_DELTA),
    longitudeDelta: Math.max((maxLng - minLng) * PADDING, MIN_DELTA),
  };
}

/**
 * Non-interactive map thumbnail of a route, for cards (Home's Latest trip).
 * Not Google Maps lite mode: that ignores dark mode on Android. Taps pass
 * through to the parent. Pass `active={false}` to swap the map for a placeholder (e.g. when its
 * screen is in the background) so no native map is kept alive off-screen.
 * A green dot marks the start and a red one the finish, as on the trip maps.
 * segments: [{ key, coordinates, color, dotted? }] (dotted: a ferry or tunnel)
 */
export default function RoutePreview({ segments, height = 160, active = true }) {
  const { c, scheme } = useTheme();
  const styles = useStyles(makeStyles);
  const all = segments.flatMap((s) => s.coordinates);
  const box = { height, overflow: 'hidden' };
  if (!active || all.length === 0) return <View style={[styles.placeholder, box]} />;

  return (
    <View style={box} pointerEvents="none">
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={regionFor(all)}
        userInterfaceStyle={scheme}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        showsPointsOfInterests={false}
      >
        {segments.map((s) => (
          <Polyline
            key={s.key}
            coordinates={s.coordinates}
            strokeColor={s.color}
            strokeWidth={3.5}
            {...(s.dotted ? { lineDashPattern: [1, 8], lineCap: 'round' } : null)}
          />
        ))}
        {[
          ['start', all[0], c.start],
          ['finish', all.at(-1), c.finish],
        ].map(([kind, coordinate, color]) => (
          <DotMarker key={kind} coordinate={coordinate}>
            <MapDot kind={kind} color={color} />
          </DotMarker>
        ))}
      </MapView>
    </View>
  );
}

const makeStyles = (c) => ({
  placeholder: { backgroundColor: c.card },
});

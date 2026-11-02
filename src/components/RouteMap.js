import { useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStyles, useTheme } from '../hooks/useTheme';
import { radius, spacing, type } from '../theme';
import DotMarker from './DotMarker';
import MapDot from './MapDot';

const MAP_PADDING = { top: 48, right: 48, bottom: 48, left: 48 };
const FOCUS_DELTA = 0.01; // ~1 km across when zooming to a single marker
// Round caps make each dash a dot (Google Maps on Android draws true dots).
const DOTS = { lineDashPattern: [1, 8], lineCap: 'round' };

/**
 * Map of one or more route segments.
 * segments: [{ key, coordinates: [{latitude, longitude}], color, dotted? }]
 *           (`dotted` for a ferry or tunnel crossing, see utils/crossings.js)
 * markers:  [{ key, kind: 'start' | 'finish' | 'stop', coordinate, title, description?, color }]
 *           start and finish are filled dots, a rest stop a ring in its route
 *           colour (the same marks as the Trips list outline and the Timeline)
 * `ref` exposes focusMarker(key): zoom to that marker and open its callout.
 * `fitTo` (coordinates) frames part of the map, e.g. one drive of a trip; the
 * map moves to it whenever a new array is passed.
 * `flat` fills its parent edge to edge, under the status bar (the Trip page).
 */
export default function RouteMap({
  segments,
  markers = [],
  height = 320,
  flat = false,
  fitTo,
  ref,
}) {
  const { scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useStyles(makeStyles);
  const mapRef = useRef(null);
  const markerRefs = useRef(new Map());
  const all = segments.flatMap((s) => s.coordinates);

  useImperativeHandle(ref, () => ({
    focusMarker(key) {
      const marker = markers.find((m) => m.key === key);
      if (!marker) return;
      mapRef.current?.animateToRegion(
        { ...marker.coordinate, latitudeDelta: FOCUS_DELTA, longitudeDelta: FOCUS_DELTA },
        600
      );
      markerRefs.current.get(key)?.showCallout();
    },
  }));

  const fit = (animated = false) => {
    const target = fitTo?.length > 1 ? fitTo : all;
    if (target.length > 1) {
      const edgePadding = flat
        ? { ...MAP_PADDING, top: MAP_PADDING.top + insets.top }
        : MAP_PADDING;
      mapRef.current?.fitToCoordinates(target, { edgePadding, animated });
    }
  };
  // Refit when asked to frame something else (the map's first fit is onMapReady).
  const firstFit = useRef(true);
  useEffect(() => {
    if (firstFit.current) {
      firstFit.current = false;
      return;
    }
    fit(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitTo]);

  return (
    <View style={flat ? styles.flat : [styles.wrap, { height }]}>
      {all.length > 0 ? (
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          onMapReady={() => fit()}
          userInterfaceStyle={scheme}
          initialRegion={{
            latitude: all[0].latitude,
            longitude: all[0].longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
        >
          {segments.map((s) => (
            <Polyline
              key={s.key}
              coordinates={s.coordinates}
              strokeColor={s.color}
              strokeWidth={4}
              {...(s.dotted ? DOTS : null)}
            />
          ))}
          {markers.map((m, i) => (
            <DotMarker
              key={m.key}
              ref={(r) => {
                if (r) markerRefs.current.set(m.key, r);
                else markerRefs.current.delete(m.key);
              }}
              coordinate={m.coordinate}
              title={m.title}
              description={m.description}
              zIndex={i}
              redrawKey={m.color}
            >
              <MapDot kind={m.kind} color={m.color} />
            </DotMarker>
          ))}
        </MapView>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No GPS points were recorded.</Text>
        </View>
      )}
    </View>
  );
}

const makeStyles = (c) => ({
  wrap: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: c.surface },
  flat: { flex: 1, backgroundColor: c.surface },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.md },
  emptyText: { ...type.small, color: c.textMuted },
});

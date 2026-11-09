import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMapView } from '../hooks/useMapView';
import { useStyles, useTheme } from '../hooks/useTheme';
import { radius, spacing, type } from '../theme';
import DotMarker from './DotMarker';
import MapCard, { MAP_CARD_ROOM } from './MapCard';
import MapDot from './MapDot';
import MapViewButton from './MapViewButton';

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
 *           colour (the same marks as the Trips list outline and the Timeline).
 *           Tapping one shows its card over the bottom of the map (MapCard);
 *           tapping the map, or the card's close button, hides it.
 * `ref` exposes focusMarker(key): zoom to that marker and show its card.
 * `onSelect(key | null)` hears when a card shows or hides.
 * `fitTo` (coordinates) frames part of the map, e.g. one drive of a trip; the
 * map moves to it whenever a new array is passed.
 * `flat` fills its parent edge to edge, under the status bar (the Trip page).
 * A layers button bottom right picks Map, Satellite or Terrain (MapViewButton).
 */
export default function RouteMap({
  segments,
  markers = [],
  height = 320,
  flat = false,
  fitTo,
  onSelect,
  ref,
}) {
  const { scheme } = useTheme();
  const { mapType, mapColor } = useMapView();
  const insets = useSafeAreaInsets();
  const styles = useStyles(makeStyles);
  const mapRef = useRef(null);
  const [selectedKey, setSelected] = useState(null);
  const setSelectedKey = (key) => {
    setSelected(key);
    onSelect?.(key);
  };
  const all = segments.flatMap((s) => s.coordinates);
  // A marker that's gone (another drive picked) takes its card with it.
  const selected = markers.find((m) => m.key === selectedKey) ?? null;

  useImperativeHandle(ref, () => ({
    focusMarker(key) {
      const marker = markers.find((m) => m.key === key);
      if (!marker) return;
      mapRef.current?.animateToRegion(
        { ...marker.coordinate, latitudeDelta: FOCUS_DELTA, longitudeDelta: FOCUS_DELTA },
        600
      );
      setSelectedKey(key);
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
          // iOS reports marker taps to the map too.
          onPress={(e) => e.nativeEvent.action !== 'marker-press' && setSelectedKey(null)}
          // Keeps the map's logo clear of the card.
          mapPadding={{ top: 0, right: 0, left: 0, bottom: selected ? MAP_CARD_ROOM : 0 }}
          // No Google Maps toolbar (Android) over the card when a marker is tapped.
          toolbarEnabled={false}
          userInterfaceStyle={scheme}
          mapType={mapType}
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
              strokeColor={mapColor(s.color)}
              strokeWidth={3.5}
              {...(s.dotted ? DOTS : null)}
            />
          ))}
          {markers.map((m, i) => (
            <DotMarker
              key={m.key}
              coordinate={m.coordinate}
              onPress={() => setSelectedKey(m.key)}
              // The selected marker draws on top.
              zIndex={m.key === selectedKey ? markers.length : i}
              redrawKey={`${mapColor(m.color)}:${m.key === selectedKey}`}
            >
              <MapDot kind={m.kind} color={mapColor(m.color)} selected={m.key === selectedKey} />
            </DotMarker>
          ))}
        </MapView>
      ) : null}
      {all.length > 0 ? (
        // Above the marker card while one shows.
        <MapViewButton
          style={[styles.layers, { bottom: spacing.md + (selected ? MAP_CARD_ROOM : 0) }]}
        />
      ) : null}
      {all.length > 0 ? <MapCard marker={selected} onClose={() => setSelectedKey(null)} /> : null}
      {all.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No GPS points were recorded.</Text>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (c) => ({
  wrap: { borderRadius: radius.card, overflow: 'hidden', backgroundColor: c.card },
  flat: { flex: 1, backgroundColor: c.card },
  layers: { position: 'absolute', right: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.md },
  emptyText: { ...type.small, color: c.textMuted },
});

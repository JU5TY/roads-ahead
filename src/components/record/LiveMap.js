import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Polyline } from 'react-native-maps';

import { useTheme } from '../../hooks/useTheme';

const POSITION_DELTA = 0.02; // ~2 km across when centring on the car

/**
 * Map for Record: the live route so far (`segments`, pauses dotted) and the
 * phone's position. Centres on the latest fix (or the route) when asked through
 * `centreKey`. With `follow`, it also tracks each new fix until the map is moved by hand.
 */
export default function LiveMap({ segments = [], position, centreKey, follow = false }) {
  const { scheme, c } = useTheme();
  const mapRef = useRef(null);
  const followingRef = useRef(true);

  useEffect(() => {
    if (!position) return;
    followingRef.current = true;
    mapRef.current?.animateToRegion(
      { ...position, latitudeDelta: POSITION_DELTA, longitudeDelta: POSITION_DELTA },
      500
    );
    // Zoom back in only when asked (or on the first fix), not on every new fix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centreKey, Boolean(position)]);

  // Keep the car in view as fixes arrive, at whatever zoom is set.
  const latitude = position?.latitude;
  const longitude = position?.longitude;
  useEffect(() => {
    if (!follow || latitude == null || !followingRef.current) return;
    mapRef.current?.animateCamera({ center: { latitude, longitude } }, { duration: 500 });
  }, [follow, latitude, longitude]);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      userInterfaceStyle={scheme}
      // Panning or zooming by hand pauses following until the centre button is tapped.
      // isGesture is only reported by Google Maps (Android); Apple Maps keeps following.
      onRegionChangeStart={(_, details) => {
        if (details?.isGesture) followingRef.current = false;
      }}
      showsUserLocation
      showsMyLocationButton={false}
      toolbarEnabled={false}
      initialRegion={
        position
          ? { ...position, latitudeDelta: POSITION_DELTA, longitudeDelta: POSITION_DELTA }
          : undefined
      }
    >
      {segments.map((s) => (
        <Polyline
          key={s.key}
          coordinates={s.coordinates}
          strokeColor={c.accent}
          strokeWidth={3.5}
          {...(s.dotted ? { lineDashPattern: [1, 8], lineCap: 'round' } : null)}
        />
      ))}
    </MapView>
  );
}

import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import MapView from 'react-native-maps';

import { useTheme } from '../../hooks/useTheme';

const POSITION_DELTA = 0.02; // ~2 km across when centring on the car

/**
 * Map for Record's Ready view: the phone's position, centred on it when asked
 * through `centreKey`.
 */
export default function LiveMap({ position, centreKey }) {
  const { scheme } = useTheme();
  const mapRef = useRef(null);

  useEffect(() => {
    if (!position) return;
    mapRef.current?.animateToRegion(
      { ...position, latitudeDelta: POSITION_DELTA, longitudeDelta: POSITION_DELTA },
      500
    );
    // Zoom back in only when asked (or on the first fix), not on every new fix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centreKey, Boolean(position)]);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      userInterfaceStyle={scheme}
      showsUserLocation
      showsMyLocationButton={false}
      toolbarEnabled={false}
      initialRegion={
        position
          ? { ...position, latitudeDelta: POSITION_DELTA, longitudeDelta: POSITION_DELTA }
          : undefined
      }
    />
  );
}

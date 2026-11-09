import { Platform } from 'react-native';

import { useSettings } from '../context/SettingsContext';
import { palettes } from '../theme';

// Satellite is Google's labelled one ('hybrid'), so road and place names stay.
const MAP_TYPES = { map: 'standard', satellite: 'hybrid', terrain: 'terrain' };

// Apple Maps has no terrain view, so iPhones offer Map and Satellite only.
export const HAS_TERRAIN = Platform.OS === 'android';

// Each light-theme route and marker colour and its dark-theme partner, which
// was made for dark backgrounds and so reads on satellite imagery too.
const { light, dark } = palettes;
const PARTNERS = new Map(
  [
    ...light.dayColors.map((color, i) => [color, dark.dayColors[i]]),
    [light.accent, dark.accent],
    [light.start, dark.start],
    [light.finish, dark.finish],
  ].map(([from, to]) => [from.toUpperCase(), to])
);

/** A colour's bright partner, keeping any alpha suffix ("#F2990040" gives "#FDD66340"). */
const brighten = (color) => {
  const partner = color && PARTNERS.get(color.slice(0, 7).toUpperCase());
  return partner ? partner + color.slice(7) : color;
};
const same = (color) => color;

/**
 * How the full maps are drawn, chosen with MapViewButton and remembered for all
 * of them: { mapView, setMapView, mapType (MapView's prop), mapColor(color) }.
 * mapColor gives a route or marker its colour on this view: on satellite the
 * bright (dark-theme) set, so day colours still tell the days apart.
 */
export function useMapView() {
  const { mapView, setMapView } = useSettings();
  // Terrain picked on Android, then restored from a backup on an iPhone.
  const view = mapView === 'terrain' && !HAS_TERRAIN ? 'map' : mapView;
  return {
    mapView: view,
    setMapView,
    mapType: MAP_TYPES[view],
    mapColor: view === 'satellite' ? brighten : same,
  };
}

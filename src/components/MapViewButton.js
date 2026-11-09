import { useState } from 'react';

import { HAS_TERRAIN, useMapView } from '../hooks/useMapView';
import { usePremium } from '../hooks/usePremium';
import ActionSheet from './ActionSheet';
import IconButton from './ui/IconButton';

const VIEWS = [
  ['map', 'map', 'Map'],
  ['satellite', 'satellite_alt', 'Satellite'],
  ...(HAS_TERRAIN ? [['terrain', 'landscape', 'Terrain']] : []),
];

/**
 * The round layers button over a full map, and its menu of map views (Map,
 * Satellite, Terrain). The choice is remembered for every full map.
 */
export default function MapViewButton({ style }) {
  const { mapView, setMapView } = useMapView();
  const premium = usePremium();
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
        icon="layers"
        variant="floating"
        accessibilityLabel="Map view"
        onPress={() => setOpen(true)}
        style={style}
      />
      <ActionSheet
        visible={open}
        onClose={() => setOpen(false)}
        actions={VIEWS.map(([view, icon, label]) => ({
          key: view,
          icon,
          label,
          selected: view === mapView,
          // Free for everyone for now, though still badged: they go behind Premium later.
          badge: view !== 'map' && view !== mapView && !premium ? 'Premium' : undefined,
          onPress: () => {
            setOpen(false);
            setMapView(view);
          },
        }))}
      />
    </>
  );
}

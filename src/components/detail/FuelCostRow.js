import { useRef, useState } from 'react';
import { Text } from 'react-native';

import { useSettings } from '../../context/SettingsContext';
import { useStyles } from '../../hooks/useTheme';
import { addVehicle, updateVehicle } from '../../storage/vehicleStorage';
import { type } from '../../theme';
import { formatPounds } from '../../utils/fuel';
import PriceSheet from '../PriceSheet';
import VehicleSheet from '../VehicleSheet';
import ListRow from '../ui/ListRow';

const hasFigure = (v) => (v.electric ? v.milesPerKwh : v.mpg) != null;

/**
 * A Details card's "Fuel cost" row ("Charging cost" for an electric car):
 * `pounds` once the car's own figure and its price are both set. Until then
 * the row says Add, and a tap asks for what's missing: `vehicle`'s figure
 * (adding a car when it's null), then the price. `vehicles` is the Garage,
 * and `onVehiclesChanged` reloads it once a car is saved.
 */
export default function FuelCostRow({ pounds, vehicle, vehicles, onVehiclesChanged, divider = false }) {
  const styles = useStyles(makeStyles);
  const { prices, ukFuelWeeks, setPrice } = useSettings();
  const [sheet, setSheet] = useState(null); // null | 'vehicle' | 'price'
  const priceNext = useRef(false); // the price sheet opens once the vehicle sheet has gone
  const electric = !!vehicle?.electric;
  const priceKind = electric ? 'charge' : 'fuel';

  const save = async (fields) => {
    try {
      if (vehicle) await updateVehicle(vehicle.id, fields);
      else await addVehicle(fields);
    } catch (err) {
      console.warn('[garage] save failed', err);
    }
    // Reloaded first, so the price sheet opens for the car's fuel as saved.
    await onVehiclesChanged?.();
    // Then the price, if that's still missing (fuel has the UK's weekly price
    // once it's in), once the vehicle sheet has gone.
    const hasPrice = fields.electric ? prices.charge : prices.fuel || ukFuelWeeks;
    priceNext.current = hasFigure(fields) && !hasPrice;
    setSheet(null);
  };

  return (
    <>
      <ListRow
        icon={electric ? 'ev_station' : 'local_gas_station'}
        title={electric ? 'Charging cost' : 'Fuel cost'}
        dense
        divider={divider}
        {...(pounds != null
          ? { value: formatPounds(pounds), strongValue: true }
          : {
              // The car's figure first (adding the car if there's none), then the price.
              onPress: () => setSheet(vehicle && hasFigure(vehicle) ? 'price' : 'vehicle'),
              accessibilityRole: 'button',
              chevron: false,
              right: <Text style={[type.bodyStrong, styles.add]}>Add</Text>,
            })}
      />
      <VehicleSheet
        visible={sheet === 'vehicle'}
        vehicle={vehicle}
        others={(vehicles ?? []).filter((v) => v !== vehicle)}
        focusEfficiency
        onSave={save}
        onClose={() => setSheet(null)}
        onClosed={() => {
          if (!priceNext.current) return;
          priceNext.current = false;
          setSheet('price');
        }}
      />
      <PriceSheet
        visible={sheet === 'price'}
        kind={priceKind}
        price={prices[priceKind]?.price}
        onSave={(price) => {
          setPrice(priceKind, price);
          setSheet(null);
        }}
        onClose={() => setSheet(null)}
      />
    </>
  );
}

const makeStyles = (c) => ({
  add: { color: c.accent },
});

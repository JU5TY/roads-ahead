import { Pressable, Text, View } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { radius, type } from '../../theme';
import { vehicleLabel } from '../../utils/vehicles';
import Icon from '../ui/Icon';
import SectionHeader from '../ui/SectionHeader';

/**
 * The Trip page's "Vehicle" section: the vehicle's name (nickname, else make
 * and model) with its registration under it, and Change when `onChange` is
 * given (a drive). For a whole trip driven in `count` vehicles it says
 * "2 vehicles". Without a vehicle it offers Choose, or shows nothing when
 * there's nothing to choose from. The vehicle's totals live in the Garage.
 */
export default function VehicleSection({ vehicle, count = 1, onChange }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const several = count > 1;
  if (!vehicle && !several && !onChange) return null;
  return (
    <>
      <SectionHeader title="Vehicle" />
      <View style={styles.card}>
        <View style={styles.well}>
          <Icon name="directions_car" size={26} color={c.accent} />
        </View>
        <View style={styles.text}>
          <Text style={[type.bodyStrong, styles.name]} numberOfLines={1}>
            {several ? `${count} vehicles` : vehicle ? vehicleLabel(vehicle) : 'No vehicle'}
          </Text>
          {!several && vehicle?.registration ? (
            <Text style={[type.small, styles.registration]} numberOfLines={1}>
              {vehicle.registration}
            </Text>
          ) : null}
        </View>
        {onChange ? (
          <Pressable
            onPress={onChange}
            accessibilityRole="button"
            accessibilityLabel={vehicle ? 'Change vehicle for this drive' : 'Choose a vehicle'}
            style={({ pressed }) => [styles.change, pressed && styles.pressed]}
          >
            <Text style={[type.button, styles.changeText]}>{vehicle ? 'Change' : 'Choose'}</Text>
          </Pressable>
        ) : null}
      </View>
    </>
  );
}

const makeStyles = (c) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 8,
    borderRadius: radius.card,
    backgroundColor: c.card,
    ...c.cardShadow,
  },
  well: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.accentContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, minWidth: 0 },
  name: { color: c.text },
  registration: { color: c.textMuted, marginTop: 2 },
  change: { height: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 22 },
  changeText: { color: c.accent },
  pressed: { opacity: 0.6 },
});

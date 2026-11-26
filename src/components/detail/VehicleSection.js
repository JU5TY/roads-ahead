import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { pressedOpacity, radius, type } from '../../theme';
import { hasTwin, vehicleLabel, vehicleSubtitle } from '../../utils/vehicles';
import Icon from '../ui/Icon';
import SectionHeader from '../ui/SectionHeader';

/**
 * The Trip page's "Vehicle" section: the vehicle's make and model, opening
 * its page, and Change vehicle beside the heading when `onChange` is given (a
 * drive). Under the name, what a lookup found ("2011 · 3.0 litre petrol"),
 * and the registration only to tell it from another of `vehicles` with the
 * same make and model. For a whole trip driven in
 * `count` vehicles it says "2 vehicles". Without a vehicle it offers Choose,
 * or shows nothing when there's nothing to choose from.
 */
export default function VehicleSection({ vehicle, vehicles = [], count = 1, onChange }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const several = count > 1;
  if (!vehicle && !several && !onChange) return null;
  const opens = !several && !!vehicle;
  const registration =
    opens && vehicle.registration && hasTwin(vehicle, vehicles) ? vehicle.registration : null;
  const line = opens ? [vehicleSubtitle(vehicle), registration].filter(Boolean).join(' · ') : '';
  const content = (
    <>
      <View style={styles.well}>
        <Icon name="directions_car" size={26} color={c.accent} />
      </View>
      <View style={styles.text}>
        <Text style={[type.bodyStrong, styles.name]} numberOfLines={1}>
          {several ? `${count} vehicles` : vehicle ? vehicleLabel(vehicle) : 'No vehicle'}
        </Text>
        {line ? (
          <Text style={[type.small, styles.line]} numberOfLines={1}>
            {line}
          </Text>
        ) : null}
      </View>
      {opens ? <Icon name="chevron_right" size={24} color={c.textMuted} /> : null}
    </>
  );
  return (
    <>
      <SectionHeader
        title="Vehicle"
        actionLabel={onChange ? (vehicle ? 'Change vehicle' : 'Choose') : undefined}
        onAction={onChange ?? undefined}
      />
      {opens ? (
        <Pressable
          onPress={() => router.push(`/vehicles/${vehicle.id}`)}
          accessibilityRole="link"
          style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        >
          {content}
        </Pressable>
      ) : (
        <View style={styles.card}>{content}</View>
      )}
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
  line: { color: c.textMuted, marginTop: 2 },
  pressed: { opacity: pressedOpacity },
});

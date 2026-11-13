import { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { showDialog } from './ui/DialogHost';
import { useStyles, useTheme } from '../hooks/useTheme';
import { pressedOpacity, radius, spacing, type } from '../theme';
import { parseMilesPerKwh, parseMpg } from '../utils/fuel';
import { registrationProblem, vehicleLabel } from '../utils/vehicles';
import BottomSheet, { SheetScrollView } from './ui/BottomSheet';
import Button from './ui/Button';
import Icon from './ui/Icon';
import SegmentedSwitch from './ui/SegmentedSwitch';

/**
 * A labelled text input, with an `error` under it when there is one. `ref` is
 * the input's; `suffix` sits inside the box after it ("mpg").
 */
function Field({ label, error, suffix, ...input }) {
  const styles = useStyles(makeStyles);
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.input, styles.box]}>
        <TextInput
          style={styles.text}
          accessibilityLabel={label}
          maxLength={40}
          {...input}
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

// Mounted only while the sheet is open, so it starts from the saved vehicle each time.
function VehicleForm({ vehicle, others: othersNow, focusEfficiency, onSave, onDelete }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const [fields, setFields] = useState({
    make: vehicle?.make ?? '',
    model: vehicle?.model ?? '',
    registration: vehicle?.registration ?? '',
    electric: vehicle?.electric ?? false,
    mpg: vehicle?.mpg != null ? String(vehicle.mpg) : '',
    milesPerKwh: vehicle?.milesPerKwh != null ? String(vehicle.milesPerKwh) : '',
  });
  const set = (key) => (text) => setFields((prev) => ({ ...prev, [key]: text }));
  // The Garage as it was when the sheet opened: once saved, the list reloads
  // with this vehicle in it while the sheet slides away, and it would look
  // like its own twin ("add the registration" flashing up).
  const [others] = useState(othersNow);
  const problem = registrationProblem(fields, others);
  // Save is always there to tap; tapped with something missing, it says what
  // under that field and puts the cursor in the first one to fix.
  const [tried, setTried] = useState(false);
  const makeRef = useRef(null);
  const modelRef = useRef(null);
  const registrationRef = useRef(null);
  const efficiencyRef = useRef(null);
  // Only the figure for the chosen fuel is checked; the other keeps what was saved.
  const efficiency = fields.electric ? parseMilesPerKwh(fields.milesPerKwh) : parseMpg(fields.mpg);
  const missingMake = tried && !fields.make.trim() ? 'Enter a make' : null;
  const missingModel = tried && !fields.model.trim() ? 'Enter a model' : null;
  const save = () => {
    const fix = !fields.make.trim()
      ? makeRef
      : !fields.model.trim()
        ? modelRef
        : problem
          ? registrationRef
          : efficiency.error
            ? efficiencyRef
            : null;
    if (!fix) {
      return onSave({
        ...fields,
        mpg: fields.electric ? (vehicle?.mpg ?? null) : efficiency.mpg,
        milesPerKwh: fields.electric ? efficiency.milesPerKwh : (vehicle?.milesPerKwh ?? null),
      });
    }
    setTried(true);
    fix.current?.focus();
  };

  const confirmDelete = () =>
    showDialog({
      title: `Remove ${vehicleLabel(vehicle)}?`,
      message: 'Your trips stay; they just won’t name a vehicle.',
      confirmLabel: 'Remove',
      destructive: true,
      onConfirm: onDelete,
    });

  return (
    <View style={styles.sheet}>
      <SheetScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Field
          ref={makeRef}
          label="Make"
          error={missingMake}
          value={fields.make}
          onChangeText={set('make')}
          autoCapitalize="words"
          autoFocus={!vehicle && !focusEfficiency}
          returnKeyType="next"
        />
        <Field
          ref={modelRef}
          label="Model"
          error={missingModel}
          value={fields.model}
          onChangeText={set('model')}
          returnKeyType="next"
        />
        <Field
          ref={registrationRef}
          label="Registration"
          error={problem}
          value={fields.registration}
          onChangeText={set('registration')}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={12}
          returnKeyType="next"
          onSubmitEditing={() => efficiencyRef.current?.focus()}
        />
        {/* For plans' fuel or charging cost, with the price on You. Optional. */}
        <Text style={styles.label}>Fuel</Text>
        <SegmentedSwitch
          options={[
            ['fuel', 'Petrol or diesel'],
            ['electric', 'Electric'],
          ]}
          value={fields.electric ? 'electric' : 'fuel'}
          onChange={(v) => setFields((prev) => ({ ...prev, electric: v === 'electric' }))}
          stretch
        />
        <Field
          // A new input for the other fuel, so its own text and keyboard come up.
          key={fields.electric ? 'kwh' : 'mpg'}
          ref={efficiencyRef}
          label={fields.electric ? 'Average miles per kWh' : 'Average mpg'}
          error={tried ? efficiency.error : null}
          suffix={fields.electric ? 'mi/kWh' : 'mpg'}
          value={fields.electric ? fields.milesPerKwh : fields.mpg}
          onChangeText={set(fields.electric ? 'milesPerKwh' : 'mpg')}
          keyboardType="decimal-pad"
          maxLength={5}
          autoFocus={!!vehicle && focusEfficiency}
          returnKeyType="done"
          onSubmitEditing={save}
        />
        {/* Editing, a round red bin sits beside Save (Delete trip's mark in menus). */}
        <View style={styles.actions}>
          <Button label="Save" onPress={save} style={styles.save} />
          {vehicle && onDelete ? (
            <Pressable
              onPress={confirmDelete}
              style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Remove vehicle"
            >
              <Icon name="delete" size={24} color={c.danger} />
            </Pressable>
          ) : null}
        </View>
      </SheetScrollView>
    </View>
  );
}

/**
 * Add a vehicle (no `vehicle`) or edit / remove one. `others` are the Garage's
 * other vehicles, to tell when a registration is needed. onSave gets
 * { make, model, registration } as typed, `electric`, and mpg and
 * milesPerKwh as numbers or null. Without onDelete there's no Remove;
 * `focusEfficiency` starts a saved vehicle's sheet in its mpg (or miles per
 * kWh) field, for Add fuel cost on a plan.
 */
export default function VehicleSheet({
  visible,
  vehicle,
  others,
  focusEfficiency,
  onSave,
  onDelete,
  onClose,
  onClosed,
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} onClosed={onClosed}>
      <VehicleForm
        vehicle={vehicle}
        others={others}
        focusEfficiency={focusEfficiency}
        onSave={onSave}
        onDelete={onDelete}
      />
    </BottomSheet>
  );
}

const makeStyles = (c) => ({
  sheet: { flexShrink: 1 },
  content: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  label: { ...type.label, color: c.textMuted, marginTop: spacing.sm, marginBottom: 6 },
  input: {
    ...type.bodyLarge,
    backgroundColor: c.card,
    color: c.text,
    borderRadius: radius.card,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  // The box is the input's look; the text field inside it fills the row.
  box: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  text: { ...type.bodyLarge, flex: 1, minWidth: 0, padding: 0, color: c.text },
  suffix: { ...type.bodyLarge, color: c.textMuted },
  error: { ...type.small, color: c.stop, marginTop: 6 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  save: { flex: 1 },
  // Save's height, round.
  remove: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.dangerContainer,
  },
  pressed: { opacity: pressedOpacity },
});

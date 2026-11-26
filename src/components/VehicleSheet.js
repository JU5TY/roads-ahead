import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { showDialog } from './ui/DialogHost';
import { useStyles, useTheme } from '../hooks/useTheme';
import { lookUpRegistration, lookupOffered } from '../services/vehicleLookupService';
import { pressedOpacity, radius, spacing, type } from '../theme';
import { parseMilesPerKwh, parseMpg } from '../utils/fuel';
import {
  detailsFor,
  formFromLookup,
  lookupDetails,
  registrationProblem,
  vehicleLabel,
  vehicleSubtitle,
} from '../utils/vehicles';
import BottomSheet, { SheetScrollView } from './ui/BottomSheet';
import Button from './ui/Button';
import Icon from './ui/Icon';
import SegmentedSwitch from './ui/SegmentedSwitch';

/**
 * A labelled text input, with an `error` under it when there is one. `ref` is the input's; `suffix` sits inside the box after it
 * ("mpg"); `action` is a text button there instead ({ label, onPress, busy }).
 */
function Field({ label, error, suffix, action, ...input }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.input, styles.box, action && styles.withAction]}>
        <TextInput
          style={styles.text}
          accessibilityLabel={label}
          maxLength={40}
          {...input}
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
        {action ? (
          <Pressable
            onPress={action.onPress}
            disabled={action.busy}
            accessibilityRole="button"
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            {action.busy ? (
              <ActivityIndicator color={c.accent} />
            ) : (
              <Text style={[type.label, styles.actionText]}>{action.label}</Text>
            )}
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

// Mounted only while the sheet is open, so it starts from the saved vehicle each time.
function VehicleForm({ vehicle, initial, others: othersNow, focusEfficiency, onSave, onDelete }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const start = vehicle ?? initial;
  const [fields, setFields] = useState({
    make: start?.make ?? '',
    model: start?.model ?? '',
    registration: start?.registration ?? '',
    electric: start?.electric ?? false,
    mpg: start?.mpg != null ? String(start.mpg) : '',
    milesPerKwh: start?.milesPerKwh != null ? String(start.milesPerKwh) : '',
  });
  // What a lookup found (the vehicle's own, until Look up finds anew); saved
  // only while it's for the registration in the box.
  const [details, setDetails] = useState(start?.details ?? null);
  const [lookup, setLookup] = useState(null); // null | 'busy' | { error }
  const set = (key) => (text) => setFields((prev) => ({ ...prev, [key]: text }));
  const makeRef = useRef(null);
  const modelRef = useRef(null);
  const registrationRef = useRef(null);
  const efficiencyRef = useRef(null);
  const lookUp = async () => {
    const reg = fields.registration.trim();
    if (!reg) return registrationRef.current?.focus();
    setLookup('busy');
    const result = await lookUpRegistration(reg);
    if (result.vehicle) {
      const found = formFromLookup(result.vehicle);
      setFields((prev) => ({
        ...prev,
        make: found.make || prev.make,
        model: found.model || prev.model,
        electric: found.electric,
        mpg: found.mpg != null ? String(found.mpg) : prev.mpg,
      }));
      setDetails(lookupDetails(result.vehicle));
      setLookup(null);
    } else if (result.notFound) {
      setLookup({ error: `No vehicle found for ${reg.toUpperCase()}. Check the registration, or enter the details yourself.` });
    } else {
      setLookup({ error: result.error });
    }
  };
  // The Garage as it was when the sheet opened: once saved, the list reloads
  // with this vehicle in it while the sheet slides away, and it would look
  // like its own twin ("add the registration" flashing up).
  const [others] = useState(othersNow);
  const problem = registrationProblem(fields, others);
  // Save is always there to tap; tapped with something missing, it says what
  // under that field and puts the cursor in the first one to fix.
  const [tried, setTried] = useState(false);
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
        details: detailsFor(details, fields.registration),
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
          ref={registrationRef}
          label="Registration"
          error={problem ?? lookup?.error}
          value={fields.registration}
          onChangeText={(text) => {
            set('registration')(text);
            if (lookup?.error) setLookup(null);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={12}
          returnKeyType="next"
          onSubmitEditing={() => (lookupOffered ? lookUp() : makeRef.current?.focus())}
          action={lookupOffered ? { label: 'Look up', onPress: lookUp, busy: lookup === 'busy' } : undefined}
        />
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
 * Adding on a UK phone: just the registration. Look up shows what it found and
 * Add vehicle saves it; "Enter details manually" (or a lookup that finds
 * nothing, or no model) goes on to the full form, filled in with what's known.
 */
function RegistrationStep({ onAdd, onManual }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const [registration, setRegistration] = useState('');
  const [state, setState] = useState(null); // null | 'busy' | { found } | { notFound } | { error }
  const lookUp = async () => {
    const reg = registration.trim();
    if (!reg) return;
    setState('busy');
    const result = await lookUpRegistration(reg);
    if (result.vehicle) {
      const fields = {
        ...formFromLookup(result.vehicle),
        registration: reg,
        milesPerKwh: null,
        details: lookupDetails(result.vehicle),
      };
      // Without a model (DVSA didn't answer) it's finished by hand.
      if (!fields.model) return onManual(fields);
      setState({ found: fields });
    } else {
      setState(result.notFound ? { notFound: reg.toUpperCase() } : { error: result.error });
    }
  };
  const found = state?.found;
  const stuck = state?.notFound || state?.error;
  return (
    <View style={styles.sheet}>
      <SheetScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field
          label="Registration"
          value={registration}
          onChangeText={(text) => {
            setRegistration(text);
            if (state && state !== 'busy') setState(null);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus
          maxLength={12}
          returnKeyType="search"
          onSubmitEditing={lookUp}
          action={{ label: 'Look up', onPress: lookUp, busy: state === 'busy' }}
        />
        {found ? (
          <View style={styles.found}>
            <View style={styles.foundWell}>
              <Icon name="directions_car" size={22} color={c.accent} />
            </View>
            <View style={styles.foundText}>
              <Text style={[type.bodyStrong, styles.foundName]} numberOfLines={1}>
                {vehicleLabel(found)}
              </Text>
              {vehicleSubtitle(found) ? (
                <Text style={[type.small, styles.foundLine]} numberOfLines={1}>
                  {vehicleSubtitle(found)}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}
        {stuck ? (
          <Text style={styles.status} accessibilityLiveRegion="polite">
            {state.notFound
              ? `No vehicle found for ${state.notFound}. Check the registration, or enter the details yourself.`
              : state.error}
          </Text>
        ) : null}
        <View style={styles.actions}>
          {stuck ? (
            <Button label="Enter details manually" onPress={() => onManual({ registration })} style={styles.save} />
          ) : (
            <Button
              label="Add vehicle"
              onPress={found ? () => onAdd(found) : lookUp}
              disabled={state === 'busy'}
              style={styles.save}
            />
          )}
        </View>
        {stuck ? null : (
          <Button
            label="Enter details manually"
            variant="text"
            onPress={() => onManual({ registration })}
          />
        )}
      </SheetScrollView>
    </View>
  );
}

/** Adding: the registration first on a UK phone (RegistrationStep), then the form if wanted. */
function AddVehicle({ others, onSave }) {
  const [manual, setManual] = useState(lookupOffered ? null : {});
  if (!manual) return <RegistrationStep onAdd={onSave} onManual={setManual} />;
  return <VehicleForm initial={manual} others={others} onSave={onSave} />;
}

/**
 * Add a vehicle (no `vehicle`; on a UK phone it starts with the registration)
 * or edit / remove one. `others` are the Garage's other
 * vehicles, to tell when a registration is needed. On UK phones the
 * registration has Look up, which fills in the rest. onSave gets
 * { make, model, registration } as typed, `electric`, mpg and milesPerKwh as
 * numbers or null, and `details` (what a lookup found, or null). Without
 * onDelete there's no Remove; `focusEfficiency` starts a saved vehicle's sheet
 * in its mpg (or miles per kWh) field, for a Details card's Fuel cost row.
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
      {vehicle ? (
        <VehicleForm
          vehicle={vehicle}
          others={others}
          focusEfficiency={focusEfficiency}
          onSave={onSave}
          onDelete={onDelete}
        />
      ) : (
        <AddVehicle others={others} onSave={onSave} />
      )}
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
  // Look up inside the box: the box keeps its height, the button its 48.
  withAction: { paddingVertical: 4, paddingRight: 4 },
  action: { minWidth: 48, height: 48, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: c.accent },
  error: { ...type.small, color: c.stop, marginTop: 6 },
  // What a lookup found, as a card (the trip's Vehicle card, smaller).
  found: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: radius.card,
    backgroundColor: c.card,
    ...c.cardShadow,
  },
  foundWell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.accentContainer,
  },
  foundText: { flex: 1, minWidth: 0 },
  foundName: { color: c.text },
  foundLine: { color: c.textMuted, marginTop: 2 },
  status: { ...type.body, color: c.textMuted, marginTop: spacing.sm, marginHorizontal: 4 },
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

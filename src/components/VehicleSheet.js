import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { showDialog } from './ui/DialogHost';
import { useStyles, useTheme } from '../hooks/useTheme';
import { radius, spacing, type } from '../theme';
import { registrationProblem, vehicleLabel } from '../utils/vehicles';
import BottomSheet from './ui/BottomSheet';
import Button from './ui/Button';

/** A labelled text input, with an `error` under it when there is one. */
function Field({ label, error, ...input }) {
  const styles = useStyles(makeStyles);
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        accessibilityLabel={label}
        maxLength={40}
        {...input}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

// Mounted only while the sheet is open, so it starts from the saved vehicle each time.
function VehicleForm({ vehicle, others, onSave, onDelete, onClose }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const [fields, setFields] = useState({
    make: vehicle?.make ?? '',
    model: vehicle?.model ?? '',
    nickname: vehicle?.nickname ?? '',
    registration: vehicle?.registration ?? '',
  });
  const set = (key) => (text) => setFields((prev) => ({ ...prev, [key]: text }));
  const problem = registrationProblem(fields, others);
  const valid = fields.make.trim() && fields.model.trim() && !problem;
  const save = () => valid && onSave(fields);

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
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{vehicle ? 'Edit vehicle' : 'Add vehicle'}</Text>
        <Field
          label="Make"
          value={fields.make}
          onChangeText={set('make')}
          autoCapitalize="words"
          autoFocus={!vehicle}
          returnKeyType="next"
        />
        <Field
          label="Model"
          value={fields.model}
          onChangeText={set('model')}
          returnKeyType="next"
        />
        <Field
          label="Nickname"
          value={fields.nickname}
          onChangeText={set('nickname')}
          autoCapitalize="sentences"
          returnKeyType="next"
        />
        <Field
          label="Registration"
          error={problem}
          value={fields.registration}
          onChangeText={set('registration')}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={12}
          returnKeyType="done"
          onSubmitEditing={save}
        />
        <Button label="Save" onPress={save} disabled={!valid} style={styles.save} />
        {vehicle ? (
          <Pressable onPress={confirmDelete} style={styles.link} accessibilityRole="button">
            <Text style={[styles.linkText, { color: c.stop }]}>Remove vehicle</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={onClose} style={styles.link} accessibilityRole="button">
          <Text style={styles.linkText}>Cancel</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/**
 * Add a vehicle (no `vehicle`) or edit / remove one. `others` are the Garage's
 * other vehicles, to tell when a registration is needed. onSave gets
 * { make, model, nickname, registration } as typed.
 */
export default function VehicleSheet({ visible, vehicle, others, onSave, onDelete, onClose }) {
  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight="90%">
      <VehicleForm
        vehicle={vehicle}
        others={others}
        onSave={onSave}
        onDelete={onDelete}
        onClose={onClose}
      />
    </BottomSheet>
  );
}

const makeStyles = (c) => ({
  sheet: { flexShrink: 1 },
  content: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  title: { ...type.title, color: c.text, marginBottom: spacing.xs },
  label: { ...type.label, color: c.textMuted, marginTop: spacing.sm, marginBottom: 6 },
  input: {
    ...type.bodyLarge,
    backgroundColor: c.surface,
    color: c.text,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  error: { ...type.small, color: c.stop, marginTop: 6 },
  save: { marginTop: spacing.md },
  link: { height: 48, alignItems: 'center', justifyContent: 'center' },
  linkText: { ...type.button, color: c.accent },
});

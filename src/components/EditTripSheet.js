import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { useStyles } from '../hooks/useTheme';
import { radius, spacing, type } from '../theme';
import BottomSheet from './ui/BottomSheet';
import Button from './ui/Button';

// Mounted only while the sheet is open, so it starts from the saved values each time.
function EditTripForm({ trip, onSave, onClose }) {
  const styles = useStyles(makeStyles);
  const [name, setName] = useState(trip?.name ?? '');
  const [notes, setNotes] = useState(trip?.notes ?? '');

  return (
    <View style={styles.sheet}>
      <Text style={styles.title}>Edit trip</Text>

      <Text style={styles.label}>Name</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        style={styles.input}
        returnKeyType="done"
        maxLength={80}
      />

      <Text style={styles.label}>Notes</Text>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        style={[styles.input, styles.notes]}
        multiline
        textAlignVertical="top"
        maxLength={2000}
      />

      <Button label="Save" onPress={() => onSave({ name, notes })} style={styles.save} />
      <Pressable onPress={onClose} style={styles.cancel} accessibilityRole="button">
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

/** Edit a trip's name and notes; an empty name goes back to the automatic title. */
export default function EditTripSheet({ visible, trip, onSave, onClose }) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <EditTripForm trip={trip} onSave={onSave} onClose={onClose} />
    </BottomSheet>
  );
}

const makeStyles = (c) => ({
  sheet: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  title: { ...type.title, color: c.text, marginBottom: spacing.xs },
  label: { ...type.label, color: c.textMuted, marginTop: spacing.sm },
  input: {
    ...type.bodyLarge,
    backgroundColor: c.surface,
    color: c.text,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  notes: { minHeight: 100, maxHeight: 200 },
  save: { marginTop: spacing.md },
  cancel: { height: 48, alignItems: 'center', justifyContent: 'center' },
  cancelText: { ...type.button, color: c.accent },
});

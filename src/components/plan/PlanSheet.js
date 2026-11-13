import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { pressedOpacity, radius, spacing, type } from '../../theme';
import { dateKey, dateOf } from '../../utils/plans';
import BottomSheet from '../ui/BottomSheet';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import MonthCalendar from '../ui/MonthCalendar';
import SegmentedSwitch from '../ui/SegmentedSwitch';

// Mounted only while open, so it starts from the saved values each time.
function PlanForm({ plan, onSave }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const [name, setName] = useState(plan?.name ?? '');
  const [date, setDate] = useState(plan?.startDate ? dateOf(plan.startDate) : null);
  const [picking, setPicking] = useState(false);
  const [roundTrip, setRoundTrip] = useState(plan?.roundTrip ?? false);
  // A copied Iconic Trip stays as it came.
  const locked = !!plan?.routeId;
  const trimmed = name.trim();

  return (
    <View style={styles.sheet}>
      <Text style={styles.label}>Name</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        style={styles.input}
        autoFocus={!plan}
        autoCapitalize="sentences"
        returnKeyType="done"
        maxLength={80}
      />

      <Text style={styles.label}>Start date</Text>
      <View style={styles.dateRow}>
        <Pressable
          onPress={() => setPicking((p) => !p)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.input, styles.dateField, pressed && styles.pressed]}
        >
          <Text style={[type.bodyLarge, { color: date ? c.text : c.textMuted }]}>
            {date ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'No date'}
          </Text>
          <Icon name="calendar_month" size={22} color={c.textMuted} />
        </Pressable>
        {date ? (
          <Button
            label="Clear"
            variant="text"
            size="small"
            onPress={() => {
              setDate(null);
              setPicking(false);
            }}
          />
        ) : null}
      </View>
      {picking ? (
        <MonthCalendar
          value={date}
          onChange={(d) => {
            setDate(d);
            setPicking(false);
          }}
        />
      ) : null}

      {locked ? null : (
        <>
          <Text style={styles.label}>Route</Text>
          <SegmentedSwitch
            options={[
              ['oneWay', 'One way'],
              ['roundTrip', 'Round trip'],
            ]}
            value={roundTrip ? 'roundTrip' : 'oneWay'}
            onChange={(v) => setRoundTrip(v === 'roundTrip')}
            stretch
          />
        </>
      )}

      <Button
        label={plan ? 'Save' : 'Plan it'}
        disabled={!trimmed}
        onPress={() => onSave({ name: trimmed, startDate: date ? dateKey(date) : null, roundTrip })}
        style={styles.save}
      />
    </View>
  );
}

/**
 * Name a plan and, if you like, its start date, and whether it's one way or a
 * round trip: a new plan (Plan), or editing one from its menu. With
 * no date it waits under Someday.
 */
export default function PlanSheet({ visible, plan, onSave, onClose }) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <PlanForm plan={plan} onSave={onSave} />
    </BottomSheet>
  );
}

const makeStyles = (c) => ({
  sheet: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  label: { ...type.label, color: c.textMuted, marginTop: spacing.sm },
  input: {
    ...type.bodyLarge,
    backgroundColor: c.card,
    color: c.text,
    borderRadius: radius.card,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dateField: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  save: { marginTop: spacing.md },
  pressed: { opacity: pressedOpacity },
});

import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { pressedOpacity, type } from '../../theme';
import IconButton from './IconButton';

const sameDay = (a, b) =>
  a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Monday first, the phone's own short day names ("M", "T", …). */
const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
  new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'narrow' })
);

/**
 * A month of days to pick one from, with arrows to the months either side.
 * Drawn here rather than with a native date picker, so it adds nothing to the app.
 * `value` and onChange's argument are local Dates; today is ringed.
 */
export default function MonthCalendar({ value, onChange }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const today = new Date();
  const [month, setMonth] = useState(() => {
    const d = value ?? today;
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  // Blanks before the 1st so it sits under its weekday (Monday first).
  const lead = (month.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
  ];
  const shift = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <View>
      <View style={styles.header}>
        <IconButton icon="chevron_left" variant="plain" onPress={() => shift(-1)} accessibilityLabel="Previous month" />
        <Text style={[type.bodyStrong, styles.month]}>
          {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </Text>
        <IconButton icon="chevron_right" variant="plain" onPress={() => shift(1)} accessibilityLabel="Next month" />
      </View>
      <View style={styles.grid}>
        {WEEKDAYS.map((d, i) => (
          <Text key={`w${i}`} style={[type.small, styles.weekday]}>
            {d}
          </Text>
        ))}
        {cells.map((d, i) =>
          d ? (
            <Pressable
              key={i}
              onPress={() => onChange(d)}
              accessibilityRole="button"
              accessibilityState={{ selected: sameDay(d, value) }}
              accessibilityLabel={d.toLocaleDateString(undefined, { dateStyle: 'full' })}
              style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
            >
              <View
                style={[
                  styles.day,
                  sameDay(d, today) && styles.today,
                  sameDay(d, value) && styles.selected,
                ]}
              >
                <Text style={[type.body, { color: sameDay(d, value) ? c.onAccent : c.text }]}>
                  {d.getDate()}
                </Text>
              </View>
            </Pressable>
          ) : (
            <View key={i} style={styles.cell} />
          )
        )}
      </View>
    </View>
  );
}

const makeStyles = (c) => ({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  month: { color: c.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', color: c.textMuted, paddingVertical: 6 },
  cell: { width: `${100 / 7}%`, height: 44, alignItems: 'center', justifyContent: 'center' },
  day: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  today: { borderWidth: 1, borderColor: c.accent },
  selected: { backgroundColor: c.accent, borderWidth: 0 },
  pressed: { opacity: pressedOpacity },
});

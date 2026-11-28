import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { useSettings } from '../context/SettingsContext';
import { useStyles, useTheme } from '../hooks/useTheme';
import { radius, spacing, type } from '../theme';
import { currencySymbol, formatFuelPrice, parseChargePrice, parseFuelPrice } from '../utils/fuel';
import BottomSheet from './ui/BottomSheet';
import Button from './ui/Button';
import Icon from './ui/Icon';

// Fuel is priced as the pump shows it, £1.46 a litre; charging as UK tariffs
// are, 24.5p a kWh. In euros both are as the pump shows them: €1.79, €0.35.
const KINDS = {
  fuel: (units) => ({
    label: 'Price per litre',
    prefix: currencySymbol(units),
    shown: (price) => price.toFixed(2),
    parse: (text) => parseFuelPrice(text, units),
  }),
  charge: (units) =>
    units === 'metric'
      ? {
          label: 'Price per kWh',
          prefix: '€',
          shown: (price) => price.toFixed(2),
          parse: (text) => parseChargePrice(text, units),
        }
      : {
          label: 'Price per kWh',
          suffix: 'p',
          shown: (price) => String(Number((price * 100).toFixed(1))),
          parse: (text) => parseChargePrice(text, units),
        },
};

/**
 * The line under fuel's field when there are UK averages (`uk`, from
 * ukFuelAverages): what they are, and whether the typed price is used instead.
 */
function ukHint(uk, own, units) {
  const kinds = Object.keys(uk);
  const one = kinds.length === 1;
  const figures = one
    ? formatFuelPrice(uk[kinds[0]], units)
    : kinds.map((k) => `${k} ${formatFuelPrice(uk[k], units)}`).join(', ');
  if (own) return one ? `Your price · UK average is ${figures}` : `Your price · UK average: ${figures}`;
  return one ? 'UK average, updates weekly' : `UK average: ${figures}, updates weekly`;
}

// Mounted only while open, so it starts from the saved price each time.
function PriceForm({ kind, price, uk, onSave }) {
  const styles = useStyles(makeStyles);
  const { c } = useTheme();
  const { units } = useSettings();
  const { label, prefix, suffix, shown, parse } = KINDS[kind](units);
  const [text, setText] = useState(price != null ? shown(price) : '');
  const [tried, setTried] = useState(false);
  // Fuel in the UK: the field can stay empty (the UK average is used), and
  // shows that average greyed out when the garage uses one fuel.
  const averages = kind === 'fuel' ? uk : null;
  const values = averages ? Object.values(averages) : [];
  const placeholder = values.length === 1 ? shown(values[0]) : undefined;
  const empty = text.trim() === '';
  const parsed = parse(text);
  const save = () => {
    if (averages && empty) onSave(null);
    else if (parsed.error) setTried(true);
    else onSave(parsed.price);
  };

  return (
    <View style={styles.sheet}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.input}>
        {prefix ? <Text style={styles.affix}>{prefix}</Text> : null}
        <TextInput
          style={styles.text}
          accessibilityLabel={label}
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={c.textMuted}
          keyboardType="decimal-pad"
          maxLength={6}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={save}
        />
        {suffix ? <Text style={styles.affix}>{suffix}</Text> : null}
      </View>
      {averages ? (
        <View style={styles.hint}>
          <Icon name="autorenew" size={16} color={c.accent} />
          <Text style={styles.hintText}>{ukHint(averages, price != null, units)}</Text>
        </View>
      ) : null}
      {tried && parsed.error && !(averages && empty) ? <Text style={styles.error}>{parsed.error}</Text> : null}
      <Button label="Save" onPress={save} style={styles.save} />
      {averages && price != null ? (
        <Button label="Use the UK average" variant="text" onPress={() => onSave(null)} />
      ) : null}
    </View>
  );
}

/**
 * A price on You for plans' cost: `kind` 'fuel' (pounds a litre; "146.9" at
 * the pump reads as pence) or 'charge' (typed in pence a kWh). onSave gets
 * the price in pounds, or in euros (typed as euros) when the units are km.
 * `uk` (fuel only, from ukFuelAverages) is this week's UK average per fuel: the
 * field may then be left empty, and onSave(null) goes back to the average.
 */
export default function PriceSheet({ visible, kind, price, uk = null, onSave, onClose }) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <PriceForm kind={kind} price={price} uk={uk} onSave={onSave} />
    </BottomSheet>
  );
}

const makeStyles = (c) => ({
  sheet: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  label: { ...type.label, color: c.textMuted, marginTop: spacing.sm },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: c.card,
    borderRadius: radius.card,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  affix: { ...type.bodyLarge, color: c.textMuted },
  text: { ...type.bodyLarge, flex: 1, minWidth: 0, padding: 0, color: c.text },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 4 },
  hintText: { ...type.small, color: c.textMuted, flex: 1 },
  error: { ...type.small, color: c.stop },
  save: { marginTop: spacing.md },
});

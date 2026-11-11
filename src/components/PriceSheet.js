import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { useStyles } from '../hooks/useTheme';
import { radius, spacing, type } from '../theme';
import { parseChargePrice, parseFuelPrice } from '../utils/fuel';
import BottomSheet from './ui/BottomSheet';
import Button from './ui/Button';

// Fuel is priced as the pump shows it, £1.46 a litre; charging as tariffs are, 24.5p a kWh.
const KINDS = {
  fuel: {
    label: 'Price per litre',
    prefix: '£',
    shown: (price) => price.toFixed(2),
    parse: parseFuelPrice,
  },
  charge: {
    label: 'Price per kWh',
    suffix: 'p',
    shown: (price) => String(Number((price * 100).toFixed(1))),
    parse: parseChargePrice,
  },
};

// Mounted only while open, so it starts from the saved price each time.
function PriceForm({ kind, price, onSave }) {
  const styles = useStyles(makeStyles);
  const { label, prefix, suffix, shown, parse } = KINDS[kind];
  const [text, setText] = useState(price != null ? shown(price) : '');
  const [tried, setTried] = useState(false);
  const parsed = parse(text);
  const save = () => (parsed.error ? setTried(true) : onSave(parsed.price));

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
          keyboardType="decimal-pad"
          maxLength={6}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={save}
        />
        {suffix ? <Text style={styles.affix}>{suffix}</Text> : null}
      </View>
      {tried && parsed.error ? <Text style={styles.error}>{parsed.error}</Text> : null}
      <Button label="Save" onPress={save} style={styles.save} />
    </View>
  );
}

/**
 * A price on You for plans' cost: `kind` 'fuel' (pounds a litre; "146.9" at
 * the pump reads as pence) or 'charge' (typed in pence a kWh). onSave gets
 * the price in pounds.
 */
export default function PriceSheet({ visible, kind, price, onSave, onClose }) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <PriceForm kind={kind} price={price} onSave={onSave} />
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
  error: { ...type.small, color: c.stop },
  save: { marginTop: spacing.md },
});

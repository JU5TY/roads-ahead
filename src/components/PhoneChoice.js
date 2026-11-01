import { Text, View } from 'react-native';

import Icon from './ui/Icon';
import { useStyles, useTheme } from '../hooks/useTheme';
import { radius, type } from '../theme';

/**
 * The card showing exactly what to pick in the phone's own prompt or Settings:
 * a heading, an optional step, the options as pills and an optional line under
 * them. options: [[icon, label]], in the phone's own wording.
 */
export default function PhoneChoice({ title, step, options, caption, style }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View style={[styles.card, style]}>
      <Text style={[type.bodyStrong, styles.text]}>{title}</Text>
      {step ? <Text style={[type.label, styles.muted, styles.step]}>{step}</Text> : null}
      <View style={styles.options}>
        {options.map(([icon, label]) => (
          <View key={label} style={styles.option}>
            <Icon name={icon} filled size={20} color={c.onAccentContainer} />
            <Text style={[type.button, styles.optionText]}>{label}</Text>
          </View>
        ))}
      </View>
      {caption ? <Text style={[type.label, styles.muted, styles.caption]}>{caption}</Text> : null}
    </View>
  );
}

const makeStyles = (c) => ({
  card: { padding: 16, borderRadius: 16, backgroundColor: c.card, ...c.cardShadow },
  text: { color: c.text },
  muted: { color: c.textMuted, fontFamily: type.body.fontFamily },
  step: { marginTop: 2 },
  // Side by side when they fit, wrapping on narrow phones or long labels.
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: c.accentContainer,
  },
  optionText: { color: c.onAccentContainer },
  caption: { marginTop: 10 },
});

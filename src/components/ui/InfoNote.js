import { Text, View } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { type } from '../../theme';
import Icon from './Icon';

/** A grey ⓘ note under a page's content (a road page, a copied Iconic Trip), the icon centred on the text. */
export default function InfoNote({ text, style }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View style={[styles.note, style]}>
      <Icon name="info" size={20} color={c.textMuted} />
      <Text style={[type.label, styles.text]}>{text}</Text>
    </View>
  );
}

const makeStyles = (c) => ({
  note: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, marginHorizontal: 4 },
  text: { flex: 1, minWidth: 0, color: c.textMuted, fontFamily: type.body.fontFamily },
});

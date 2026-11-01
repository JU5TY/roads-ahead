import { Text, View } from 'react-native';

import FadeUp from './ui/FadeUp';
import Icon from './ui/Icon';
import { useStyles, useTheme } from '../hooks/useTheme';
import { type } from '../theme';

/**
 * Welcome's and Location's points: an icon tile, a title and one line under
 * it, fading up one after another. items: [[icon, title, body]].
 */
export default function FeatureList({ items, style }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View style={[styles.list, style]}>
      {items.map(([icon, title, body], i) => (
        <FadeUp key={title} delay={120 + i * 70} style={styles.item}>
          <View style={styles.tile}>
            <Icon name={icon} filled size={24} color={c.accent} />
          </View>
          <View style={styles.flex}>
            <Text style={[type.bodyStrong, styles.text]}>{title}</Text>
            <Text style={[type.label, styles.muted]}>{body}</Text>
          </View>
        </FadeUp>
      ))}
    </View>
  );
}

const makeStyles = (c) => ({
  list: { gap: 18 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  tile: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.accentContainer,
  },
  flex: { flex: 1 },
  text: { color: c.text },
  muted: { color: c.textMuted, fontFamily: type.body.fontFamily },
});

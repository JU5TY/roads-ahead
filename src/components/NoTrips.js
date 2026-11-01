import { Text, View } from 'react-native';

import { HaloIcon } from './ui/Halo';
import { useStyles } from '../hooks/useTheme';
import { type } from '../theme';

/**
 * No trips yet, on Home and Trips alike. No button: the floating Record pill
 * is on every tab. `style` sets where it sits on the page.
 */
export default function NoTrips({ style }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={[styles.wrap, style]}>
      <HaloIcon icon="route" />
      <Text style={[type.title, styles.title]}>No trips yet</Text>
      <Text style={[type.body, styles.body]}>
        Record a drive and your trips, map and stats will show here.
      </Text>
    </View>
  );
}

const makeStyles = (c) => ({
  wrap: { alignItems: 'center', paddingHorizontal: 24 },
  title: { color: c.text, fontFamily: type.section.fontFamily, fontSize: 22, marginTop: 24 },
  body: { color: c.textMuted, textAlign: 'center', marginTop: 8 },
});

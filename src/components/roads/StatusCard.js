import { Text, View } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { radius, type } from '../../theme';
import Icon from '../ui/Icon';

/**
 * Under an Iconic Road's or Iconic Trip's name: teal with a tick once
 * `done`, otherwise outlined with a grey `icon` ("Not completed yet").
 * `title` and `detail` are its two lines.
 */
export default function StatusCard({ done, icon, title, detail }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View style={[styles.status, done ? styles.done : styles.todo]}>
      <View style={[styles.well, { backgroundColor: done ? c.roadBadge : c.track }]}>
        {done ? (
          <Icon name="verified" filled size={26} color={c.onRoadBadge} />
        ) : (
          <Icon name={icon} size={24} color={c.outlineStrong} />
        )}
      </View>
      <View style={styles.flex}>
        <Text style={[type.bodyStrong, { color: done ? c.onRoadContainer : c.text }]}>{title}</Text>
        <Text style={[type.small, { color: done ? c.roadContainerMuted : c.textMuted }]}>{detail}</Text>
      </View>
    </View>
  );
}

const makeStyles = (c) => ({
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.card,
  },
  done: { backgroundColor: c.roadContainer },
  todo: {
    borderWidth: 1,
    borderColor: c.outline,
    paddingVertical: 13,
    paddingHorizontal: 15,
  },
  well: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1, minWidth: 0 },
});

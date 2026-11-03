import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { useSettings } from '../context/SettingsContext';
import { useActiveDrive } from '../hooks/useActiveDrive';
import { useStyles, useTheme } from '../hooks/useTheme';
import { pressedOpacity, radius, type } from '../theme';
import { formatDistance, formatDurationShort } from '../utils/format';
import { liveMetrics } from '../utils/geoMath';
import Icon from './ui/Icon';

/**
 * Blue "● Recording · 1h 12m" row shown at the top of Home and Trips while a
 * drive is live; tapping it goes back to the full-screen Record page.
 */
export default function RecordingBar({ style }) {
  const { units } = useSettings();
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const { drive, now } = useActiveDrive();
  if (!drive) return null;
  const live = liveMetrics(drive, now);

  return (
    <Pressable
      onPress={() => router.navigate('/record')}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, style]}
      accessibilityRole="button"
      accessibilityLabel="Recording in progress. Open Record."
    >
      <View style={styles.dot} />
      <View style={styles.text}>
        <Text style={[type.bodyStrong, styles.title]}>
          {live.isPaused ? 'Paused' : 'Recording'} · {formatDurationShort(live.drivingMs)}
        </Text>
        <Text style={[type.small, styles.sub]}>{formatDistance(live.distanceM, units)} so far</Text>
      </View>
      <Icon name="chevron_right" size={24} color={c.onAccentContainer} />
    </Pressable>
  );
}

const makeStyles = (c) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.card,
    backgroundColor: c.accentContainer,
  },
  pressed: { opacity: pressedOpacity },
  dot: { width: 10, height: 10, borderRadius: 5, marginHorizontal: 4, backgroundColor: c.stop },
  text: { flex: 1 },
  title: { color: c.onAccentContainer },
  sub: { color: c.accentContainerMuted },
});

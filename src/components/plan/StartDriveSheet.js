import { Pressable, Text, View } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { pressedOpacity, spacing, type } from '../../theme';
import { formatDistance } from '../../utils/format';
import BottomSheet from '../ui/BottomSheet';
import Button from '../ui/Button';
import Icon from '../ui/Icon';

/** A row with an icon in a round grey well: what the sat nav gets, and Navigate with. */
function Row({ icon, title, detail, onPress }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const content = (
    <>
      <View style={styles.well}>
        <Icon name={icon} size={24} color={c.text} />
      </View>
      <View style={styles.flex}>
        <Text style={[type.bodyStrong, styles.text]}>{title}</Text>
        <Text style={[type.bodySmall, styles.muted]}>{detail}</Text>
      </View>
      {onPress ? <Icon name="chevron_right" size={24} color={c.textMuted} /> : null}
    </>
  );
  return onPress ? (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={styles.row}>{content}</View>
  );
}

/**
 * Start a planned drive: what it is ("Drive 3 · Fort William → Applecross" and
 * `detail`, its miles, time and fuel), how far you are from its start when
 * you're away from it, what the sat nav gets, Navigate with, and Record and
 * navigate. `handover` is planHandover's answer (utils/plans.js).
 */
export default function StartDriveSheet({
  visible,
  number,
  route,
  detail,
  color,
  handover,
  units,
  onPickApp,
  onStart,
  onClose,
}) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  if (!handover) return <BottomSheet visible={false} onClose={onClose} />;
  const { start, awayM, summary, appName, wholeDrive } = handover;
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.head}>
          <View style={[styles.dotWell, { backgroundColor: `${color}26` }]}>
            <View style={[styles.dot, { backgroundColor: color }]} />
          </View>
          <View style={styles.flex}>
            <Text style={[type.section, styles.text]} numberOfLines={2}>
              {`Drive ${number} · ${route}`}
            </Text>
            {detail ? <Text style={[type.bodySmall, styles.muted]}>{detail}</Text> : null}
          </View>
        </View>
        <View style={styles.divider} />

        {awayM != null ? (
          <View style={styles.away}>
            <View style={styles.awayWell}>
              <Icon name="my_location" size={24} color={c.onAccentContainer} />
            </View>
            <View style={styles.flex}>
              <Text style={[type.bodyStrong, styles.onAccent]}>
                {`You’re ${formatDistance(awayM, units, 0)} from ${start.name ?? 'the start'}`}
              </Text>
              <Text style={[type.bodySmall, styles.accentMuted]}>{`${appName} takes you there first`}</Text>
            </View>
          </View>
        ) : null}

        <Row
          icon="near_me"
          title={wholeDrive ? `${appName} gets the whole drive` : `${appName} gets one stop at a time`}
          detail={summary}
        />
        <Row icon="map" title="Navigate with" detail={appName} onPress={onPickApp} />

        <Button label="Record and navigate" icon="radio_button_checked" onPress={onStart} style={styles.start} />
        <Text style={[type.small, styles.muted, styles.note]}>
          Recording starts now and keeps going in the background.
        </Text>
      </View>
    </BottomSheet>
  );
}

const makeStyles = (c) => ({
  sheet: { paddingHorizontal: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 4 },
  dotWell: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 14, height: 14, borderRadius: 7 },
  divider: { height: 1, backgroundColor: c.divider, marginTop: 18, marginBottom: 6 },
  away: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 8,
    padding: 12,
    borderRadius: 16,
    backgroundColor: c.accentContainer,
  },
  awayWell: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.halo,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, paddingHorizontal: 4 },
  well: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.track,
  },
  flex: { flex: 1, minWidth: 0 },
  start: { marginTop: spacing.md },
  note: { textAlign: 'center', marginTop: 12 },
  text: { color: c.text },
  muted: { color: c.textMuted },
  onAccent: { color: c.onAccentContainer },
  accentMuted: { color: c.accentContainerMuted },
  pressed: { opacity: pressedOpacity },
});

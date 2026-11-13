import { Pressable, Text, View } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { pressedOpacity, spacing, type } from '../../theme';
import { formatDistance } from '../../utils/format';
import BottomSheet from '../ui/BottomSheet';
import Button from '../ui/Button';
import Icon from '../ui/Icon';

/** A row as in a menu (ActionSheet): a blue icon well, title and detail. What the sat nav gets, and Navigate with. */
function Row({ icon, title, detail, onPress }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const content = (
    <>
      <View style={styles.well}>
        <Icon name={icon} size={22} color={c.accent} />
      </View>
      <View style={styles.flex}>
        <Text style={[type.bodyStrong, styles.text]}>{title}</Text>
        <Text style={[type.small, styles.muted, styles.detail]}>{detail}</Text>
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
 * Start a planned day: what it is ("Day 3 · Fort William → Applecross" and
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
            <Text style={[type.bodyStrong, styles.text]} numberOfLines={2}>
              {`Day ${number} · ${route}`}
            </Text>
            {detail ? <Text style={[type.small, styles.muted, styles.detail]}>{detail}</Text> : null}
          </View>
        </View>
        <View style={styles.divider} />

        {awayM != null ? (
          <View style={styles.away}>
            <View style={styles.awayWell}>
              <Icon name="my_location" size={22} color={c.onAccentContainer} />
            </View>
            <View style={styles.flex}>
              <Text style={[type.bodyStrong, styles.onAccent]}>
                {`You’re ${formatDistance(awayM, units, 0)} from ${start.name ?? 'the start'}`}
              </Text>
              <Text style={[type.small, styles.accentMuted, styles.detail]}>{`${appName} takes you there first`}</Text>
            </View>
          </View>
        ) : null}

        <Row
          icon="near_me"
          title={wholeDrive ? `${appName} gets the whole route` : `${appName} gets one stop at a time`}
          detail={summary}
        />
        <Row icon="map" title="Navigate with" detail={appName} onPress={onPickApp} />

        <View style={styles.footer}>
          <Button label="Record and navigate" icon="radio_button_checked" onPress={onStart} style={styles.start} />
          <Text style={[type.small, styles.muted, styles.note]}>
            Recording starts now and keeps going in the background.
          </Text>
        </View>
      </View>
    </BottomSheet>
  );
}

// As ActionSheet: rows inset 12, their content another 12, so everything sits 24 in.
const makeStyles = (c) => ({
  sheet: { paddingHorizontal: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingHorizontal: 12 },
  dotWell: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6 },
  divider: { height: 1, backgroundColor: c.divider, marginVertical: spacing.sm, marginHorizontal: 12 },
  away: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    marginBottom: 2,
    paddingVertical: spacing.sm,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: c.accentContainer,
  },
  awayWell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.halo,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingVertical: spacing.sm,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  well: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.accentContainer,
  },
  flex: { flex: 1, minWidth: 0 },
  detail: { marginTop: 2 },
  footer: { paddingHorizontal: 12 },
  start: { marginTop: spacing.md },
  note: { textAlign: 'center', marginTop: 12 },
  text: { color: c.text },
  muted: { color: c.textMuted },
  onAccent: { color: c.onAccentContainer },
  accentMuted: { color: c.accentContainerMuted },
  pressed: { opacity: pressedOpacity },
});

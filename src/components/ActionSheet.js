import { Pressable, ScrollView, Text, View } from 'react-native';

import { useStyles, useTheme } from '../hooks/useTheme';
import { spacing, type } from '../theme';
import BottomSheet from './ui/BottomSheet';
import Icon from './ui/Icon';

/**
 * The app's menu: a bottom sheet of actions (Android's Alert only allows three
 * buttons). No title: an optional grey `message` where a menu needs explaining
 * (e.g. the break reminder), then rows: an icon in a round tinted well, the label
 * and an optional grey `detail` under it, and a `badge` pill (e.g. "Premium").
 * Destructive rows come last, red, under a divider. For picking one option,
 * `selected` tints that row and adds a tick (rows without icons, e.g. the break
 * reminder). The handle, the scrim and Back close it (onClose).
 * actions: [{ label, key?, detail?, icon?, badge?, selected?, onPress, style?: 'destructive' }]
 */
export default function ActionSheet({ visible, message, actions, onClose }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const firstDestructive = actions.findIndex((a) => a.style === 'destructive');
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.sheet}>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {actions.map((a, i) => {
            const destructive = a.style === 'destructive';
            return (
              <View key={a.key ?? a.label}>
                {i > 0 && i === firstDestructive ? <View style={styles.divider} /> : null}
                <Pressable
                  onPress={a.onPress}
                  style={({ pressed }) => [
                    styles.action,
                    a.selected && styles.actionSelected,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={
                    a.selected !== undefined ? { selected: a.selected } : undefined
                  }
                >
                  {a.icon ? (
                    <View style={[styles.well, destructive && styles.wellDestructive]}>
                      <Icon name={a.icon} size={22} color={destructive ? c.danger : c.accent} />
                    </View>
                  ) : null}
                  <View style={styles.actionText}>
                    <Text
                      style={[
                        styles.actionLabel,
                        a.selected && styles.actionLabelSelected,
                        destructive && styles.actionLabelDestructive,
                      ]}
                      numberOfLines={1}
                    >
                      {a.label}
                    </Text>
                    {a.detail ? (
                      <Text style={styles.actionDetail} numberOfLines={1}>
                        {a.detail}
                      </Text>
                    ) : null}
                  </View>
                  {a.badge ? (
                    <View style={styles.badge}>
                      <Icon
                        name="workspace_premium"
                        filled
                        size={14}
                        color={c.onAccentContainer}
                      />
                      <Text style={styles.badgeText}>{a.badge}</Text>
                    </View>
                  ) : null}
                  {a.selected ? (
                    <Icon name="check" size={22} color={c.onAccentContainer} />
                  ) : null}
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </BottomSheet>
  );
}

const makeStyles = (c) => ({
  sheet: { flexShrink: 1 },
  // 24 in from the edge, in line with the icons.
  message: {
    ...type.body,
    color: c.textMuted,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm + spacing.xs,
  },
  list: { flexGrow: 0 },
  // Rows inset 12, their content another 12: icons line up with the title.
  listContent: { paddingHorizontal: 12, gap: 2 },
  action: {
    minHeight: 56,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  actionSelected: { backgroundColor: c.accentContainer },
  well: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.accentContainer,
  },
  wellDestructive: { backgroundColor: c.dangerContainer },
  actionText: { flex: 1, minWidth: 0 },
  actionLabel: { ...type.bodyStrong, color: c.text },
  actionLabelSelected: { color: c.onAccentContainer },
  actionLabelDestructive: { color: c.danger },
  actionDetail: { ...type.small, color: c.textMuted, marginTop: 2 },
  divider: {
    height: 1,
    marginVertical: spacing.sm,
    marginHorizontal: 12,
    backgroundColor: c.divider,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: spacing.sm,
    paddingRight: 10,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    // The Premium card's colours on You.
    backgroundColor: c.accentContainer,
  },
  badgeText: { ...type.caps, color: c.onAccentContainer },
  pressed: { opacity: 0.7 },
});

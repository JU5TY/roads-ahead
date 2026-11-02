import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStyles, useTheme } from '../hooks/useTheme';
import { spacing, type } from '../theme';
import BottomSheet from './ui/BottomSheet';
import Icon from './ui/Icon';

/**
 * Bottom sheet with a list of actions (Android's Alert only allows three buttons).
 * actions: [{ label, key?, detail?, icon?, selected?, onPress, style?: 'primary' | 'destructive' }]
 * `selected` shows a tick (for picking one option, e.g. the break reminder).
 * Pass `visible={false}` to hide. Tapping the backdrop or Cancel calls onClose.
 */
export default function ActionSheet({ visible, title, message, actions, onClose }) {
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight="80%">
      <View style={[styles.sheet, { paddingBottom: spacing.md + insets.bottom }]}>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {actions.map((a) => (
            <Pressable
              key={a.key ?? a.label}
              onPress={a.onPress}
              style={({ pressed }) => [
                styles.action,
                a.style === 'primary' && styles.actionPrimary,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityState={a.selected !== undefined ? { selected: a.selected } : undefined}
            >
              {a.icon ? (
                <Icon
                  name={a.icon}
                  size={22}
                  color={
                    a.style === 'primary'
                      ? c.onAccentContainer
                      : a.style === 'destructive'
                        ? c.finish
                        : c.accent
                  }
                />
              ) : null}
              <View style={styles.actionText}>
                <Text
                  style={[
                    styles.actionLabel,
                    a.style === 'primary' && styles.actionLabelPrimary,
                    a.style === 'destructive' && styles.actionLabelDestructive,
                  ]}
                  numberOfLines={1}
                >
                  {a.label}
                </Text>
                {a.detail ? (
                  <Text
                    style={[
                      styles.actionDetail,
                      a.style === 'primary' && styles.actionLabelPrimary,
                    ]}
                    numberOfLines={1}
                  >
                    {a.detail}
                  </Text>
                ) : null}
              </View>
              {a.selected ? <Icon name="check" size={22} color={c.accent} /> : null}
            </Pressable>
          ))}
        </ScrollView>
        <Pressable onPress={onClose} style={styles.cancel} accessibilityRole="button">
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const makeStyles = (c) => ({
  sheet: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    flexShrink: 1,
  },
  title: { ...type.title, color: c.text, marginHorizontal: spacing.xs },
  message: { ...type.body, color: c.textMuted, marginHorizontal: spacing.xs },
  list: { flexGrow: 0 },
  listContent: { gap: spacing.xs, paddingTop: spacing.xs },
  action: {
    minHeight: 56,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  actionText: { flex: 1, minWidth: 0 },
  actionPrimary: { backgroundColor: c.accentContainer },
  actionLabel: { ...type.bodyStrong, color: c.text },
  actionLabelPrimary: { color: c.onAccentContainer },
  actionLabelDestructive: { color: c.finish },
  actionDetail: { ...type.small, color: c.textMuted, marginTop: 2 },
  cancel: { height: 48, alignItems: 'center', justifyContent: 'center' },
  cancelText: { ...type.button, color: c.accent },
  pressed: { opacity: 0.7 },
});

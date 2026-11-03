import { Modal, Pressable, Text, View } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { pressedOpacity, type } from '../../theme';

/**
 * Centred dialog: a title, an optional bold `highlight` line (e.g. Record's
 * "48.7 mi · 1h 12m"), a message, and two equal buttons side by side: an
 * outlined Cancel and a filled action. `destructive` makes the action red;
 * `cancelLabel={null}` leaves just the action (an OK for messages).
 */
export default function ConfirmDialog({
  visible,
  title,
  highlight,
  message,
  cancelLabel = 'Cancel',
  confirmLabel,
  destructive = false,
  onCancel,
  onConfirm,
}) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.scrim}>
        <View style={styles.dialog} role="alertdialog" accessibilityLabel={title}>
          <Text style={[type.title, styles.title]}>{title}</Text>
          {highlight ? <Text style={[type.section, styles.highlight]}>{highlight}</Text> : null}
          {message ? (
            <Text style={[type.body, styles.message, highlight && styles.messageAfter]}>
              {message}
            </Text>
          ) : null}
          <View style={styles.buttons}>
            {cancelLabel !== null ? (
              <Pressable
                onPress={onCancel}
                style={({ pressed }) => [styles.button, styles.cancel, pressed && styles.pressed]}
                accessibilityRole="button"
              >
                <Text style={[type.button, { color: c.accent }]} numberOfLines={1}>
                  {cancelLabel}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: destructive ? c.danger : c.accent },
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Text
                style={[type.button, { color: destructive ? c.onDanger : c.onAccent }]}
                numberOfLines={1}
              >
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c) => ({
  scrim: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: c.scrim,
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    padding: 24,
    borderRadius: 28,
    backgroundColor: c.card,
  },
  title: { color: c.text, fontSize: 24, lineHeight: 32 },
  highlight: { color: c.text, fontSize: 20, lineHeight: 28, marginTop: 12 },
  message: { color: c.textMuted, marginTop: 8, lineHeight: 22 },
  messageAfter: { marginTop: 4 },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 24 },
  button: {
    flex: 1,
    height: 48,
    paddingHorizontal: 12,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancel: { borderWidth: 1, borderColor: c.outline },
  pressed: { opacity: pressedOpacity },
});

import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStyles } from '../hooks/useTheme';
import { spacing, type } from '../theme';
import { PROMPT_CHOICE, SETTINGS_ALLOW, SETTINGS_PRECISE } from '../utils/locationChoices';
import PhoneChoice from './PhoneChoice';
import Button from './ui/Button';
import { HaloIcon } from './ui/Halo';

// Matches the Location screen: the same title and card when asking.
const CONTENT = {
  // Not asked yet (Not now during setup): explain before the system prompt.
  ask: {
    icon: 'location_on',
    title: 'Allow location to map your drives',
    lead: 'Every drive is recorded with GPS.',
    choice: PROMPT_CHOICE,
    primary: 'Continue',
    secondary: 'Not now',
  },
  // Denied and the system won't ask again: only Settings can fix it.
  blocked: {
    icon: 'location_off',
    title: 'Location is turned off',
    lead: 'Turn it back on in Settings to record your drives.',
    choice: SETTINGS_ALLOW,
    primary: 'Open Settings',
    secondary: 'Cancel',
  },
  // Granted but approximate: accurate only to a few hundred metres.
  approximate: {
    icon: 'my_location',
    title: 'Turn on precise location',
    lead: 'Approximate location is too rough to map your route or measure distance.',
    choice: SETTINGS_PRECISE,
    primary: 'Open Settings',
    secondary: 'Start anyway',
  },
};

/**
 * Bottom sheet shown before or instead of the system location prompt.
 * `kind` is 'ask' | 'blocked' | 'approximate', or null to hide.
 */
export default function PermissionSheet({ kind, onPrimary, onSecondary }) {
  const insets = useSafeAreaInsets();
  const styles = useStyles(makeStyles);
  const content = kind ? CONTENT[kind] : null;

  return (
    <Modal
      visible={Boolean(content)}
      transparent
      animationType="slide"
      onRequestClose={onSecondary}
    >
      <View style={styles.backdrop}>
        {content ? (
          <ScrollView
            style={styles.sheet}
            contentContainerStyle={[styles.sheetContent, { paddingBottom: 28 + insets.bottom }]}
            bounces={false}
          >
            <View style={styles.handle} />
            <HaloIcon icon={content.icon} />
            <Text style={[type.title, styles.text, styles.title]} role="heading">
              {content.title}
            </Text>
            <Text style={[type.bodyLarge, styles.muted, styles.lead]}>{content.lead}</Text>
            <PhoneChoice {...content.choice} style={styles.choice} />
            <Button label={content.primary} onPress={onPrimary} style={styles.primary} />
            <Pressable onPress={onSecondary} style={styles.secondary} accessibilityRole="button">
              <Text style={[type.button, styles.link]}>{content.secondary}</Text>
            </Pressable>
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

const makeStyles = (c) => ({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: c.scrim },
  // Scrolls on short phones rather than running off the top.
  sheet: {
    flexGrow: 0,
    backgroundColor: c.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  sheetContent: { paddingTop: 12, paddingHorizontal: spacing.lg },
  handle: {
    alignSelf: 'center',
    width: 32,
    height: 4,
    borderRadius: 2,
    marginBottom: 16,
    backgroundColor: c.outline,
  },
  title: { marginTop: 20 },
  lead: { marginTop: 8, lineHeight: 24 },
  choice: { marginTop: 20 },
  primary: { marginTop: 24 },
  secondary: { height: 48, marginTop: 8, alignItems: 'center', justifyContent: 'center' },
  text: { color: c.text },
  muted: { color: c.textMuted },
  link: { color: c.accent },
});

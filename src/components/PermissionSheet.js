import { useState } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';

import { useStyles } from '../hooks/useTheme';
import { spacing, type } from '../theme';
import { PROMPT_CHOICE, SETTINGS_ALLOW, SETTINGS_PRECISE } from '../utils/locationChoices';
import PhoneChoice from './PhoneChoice';
import BottomSheet from './ui/BottomSheet';
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
  const styles = useStyles(makeStyles);
  // The last content stays while the sheet slides away.
  const [content, setContent] = useState(null);
  if (kind && CONTENT[kind] !== content) setContent(CONTENT[kind]);

  return (
    <BottomSheet visible={Boolean(kind)} onClose={onSecondary} scrimCloses={false}>
      {content ? (
        <ScrollView
          style={styles.sheet}
          contentContainerStyle={styles.sheetContent}
          bounces={false}
        >
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
    </BottomSheet>
  );
}

const makeStyles = (c) => ({
  // Scrolls on short phones rather than running off the top.
  sheet: { flexGrow: 0, flexShrink: 1 },
  sheetContent: { paddingHorizontal: spacing.lg },
  title: { marginTop: 20 },
  lead: { marginTop: 8, lineHeight: 24 },
  choice: { marginTop: 20 },
  primary: { marginTop: 24 },
  secondary: { height: 48, marginTop: 8, alignItems: 'center', justifyContent: 'center' },
  text: { color: c.text },
  muted: { color: c.textMuted },
  link: { color: c.accent },
});

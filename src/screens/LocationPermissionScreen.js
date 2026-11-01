import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import FeatureList from '../components/FeatureList';
import PhoneChoice from '../components/PhoneChoice';
import Button from '../components/ui/Button';
import FadeUp from '../components/ui/FadeUp';
import { HaloIcon } from '../components/ui/Halo';
import { useSettings } from '../context/SettingsContext';
import { useStyles } from '../hooks/useTheme';
import { getLocationAccess, requestLocationAccess } from '../services/locationService';
import { type } from '../theme';
import { PROMPT_CHOICE } from '../utils/locationChoices';

// One line each under the title, so the list reads evenly.
const REASONS = [
  ['route', 'Maps your route', 'With distance, time and climb'],
  ['notifications', 'Works with the screen off', 'A notification shows while recording'],
  ['lock', 'Stays on your phone', 'Your drives are never sent to us'],
];

/**
 * First launch, after Welcome: why location is needed, then the system prompt.
 * Either button finishes onboarding; Record asks again later if access is missing.
 */
export default function LocationPermissionScreen() {
  const { finishOnboarding } = useSettings();
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();

  const allow = async () => {
    try {
      const before = await getLocationAccess();
      // Once refused for good, only Settings can turn it on.
      if (!before.granted && !before.canAskAgain) Linking.openSettings();
      else if (!before.granted) await requestLocationAccess();
    } catch (err) {
      console.warn('[permission] request failed', err);
    }
    finishOnboarding();
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 28 },
      ]}
    >
      <HaloIcon icon="location_on" grow />
      <Text style={[type.title, styles.text, styles.title]} role="heading">
        Allow location to map your drives
      </Text>
      <Text style={[type.bodyLarge, styles.muted, styles.lead]}>
        Every drive is recorded with GPS.
      </Text>
      <FeatureList items={REASONS} style={styles.reasons} />
      <FadeUp delay={330} style={styles.next}>
        <PhoneChoice {...PROMPT_CHOICE} />
      </FadeUp>
      <View style={styles.flex} />
      <Button label="Continue" onPress={allow} style={styles.continue} />
      <Pressable onPress={finishOnboarding} style={styles.notNow} accessibilityRole="button">
        <Text style={[type.button, styles.link]}>Not now</Text>
      </Pressable>
    </ScrollView>
  );
}

const makeStyles = (c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  content: { flexGrow: 1, paddingHorizontal: 24 },
  title: { marginTop: 20 },
  lead: { marginTop: 8, lineHeight: 24 },
  reasons: { marginTop: 24 },
  next: { marginTop: 24 },
  flex: { flex: 1 },
  text: { color: c.text },
  muted: { color: c.textMuted },
  continue: { marginTop: 24 }, // never crowded against the card above
  notNow: { height: 48, marginTop: 8, alignItems: 'center', justifyContent: 'center' },
  link: { color: c.accent },
});

// The background location task is defined in index.js, before Expo Router, so
// it exists when Android starts the app headless to deliver a recording's fixes
// (this layout isn't loaded then). Importing it here too keeps the order safe.
import { endDriveIfLeftRunning, resumeActiveDrive } from '../services/locationService';

import { useFonts } from 'expo-font';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, View } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import DialogHost from '../components/ui/DialogHost';
import { SettingsProvider, useSettings } from '../context/SettingsContext';
import { useTheme } from '../hooks/useTheme';
import { clearShareCard } from '../services/shareService';
import { checkAllCountriesIfNeeded } from '../storage/countryStorage';
import { checkAllCrossingsIfNeeded } from '../storage/crossingStorage';
import { checkAllDrivesIfNeeded } from '../storage/roadStorage';
import { fontFiles } from '../theme';

function AppStack() {
  const { scheme, c } = useTheme();
  const { onboarded } = useSettings();
  const [fontsLoaded, fontError] = useFonts(fontFiles);
  const ready = (fontsLoaded || !!fontError) && onboarded !== null;

  useEffect(() => {
    if (fontError) console.warn('[app] fonts failed to load', fontError);
  }, [fontError]);

  useEffect(clearShareCard, []);

  // On launch: if a drive was left recording (app killed, phone rebooted), make
  // sure tracking is running again and open the Record tab instead of Home.
  // Waits until the navigator is mounted before navigating.
  useEffect(() => {
    if (!ready || !onboarded) return;
    resumeActiveDrive()
      .then((res) => {
        if (res) router.navigate('/record');
      })
      .catch((err) => console.warn('[app] resume failed', err));
    // Find ferry and tunnel crossings on past drives, then check them against the
    // Iconic Roads list (once per version of each). In turn: both rewrite drive stats.
    checkAllCrossingsIfNeeded()
      .catch((err) => console.warn('[app] crossings check failed', err))
      .then(() => checkAllDrivesIfNeeded())
      .catch((err) => console.warn('[app] Iconic Roads check failed', err));
    // And work out countries for drives recorded before Countries existed.
    checkAllCountriesIfNeeded().catch((err) => console.warn('[app] countries check failed', err));
  }, [ready, onboarded]);

  // A drive left running ends where it stopped. GPS barely reports while the
  // phone sits still, so check when the app comes back and each minute it's open.
  useEffect(() => {
    if (!ready || !onboarded) return;
    const check = () =>
      endDriveIfLeftRunning().catch((err) => console.warn('[app] auto-stop failed', err));
    const sub = AppState.addEventListener('change', (state) => state === 'active' && check());
    const id = setInterval(check, 60 * 1000);
    return () => {
      sub.remove();
      clearInterval(id);
    };
  }, [ready, onboarded]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: c.background }} />;

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {/* Every screen draws its own title or back button. Pages change instantly,
          like the tabs: Android's default part-slide-and-fade looked glitchy. */}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.background },
          animation: 'none',
        }}
      >
        {/* First launch only: Welcome, then the location explainer. */}
        <Stack.Protected guard={!onboarded}>
          <Stack.Screen name="welcome" />
          <Stack.Screen name="permission" />
        </Stack.Protected>
        <Stack.Protected guard={onboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="trips/[id]" />
          <Stack.Screen name="plans/[id]" />
          <Stack.Screen name="plans/add-stop" />
          <Stack.Screen name="saved/[id]" options={{ gestureEnabled: false }} />
          <Stack.Screen name="roads/index" />
          <Stack.Screen name="roads/[id]" />
          <Stack.Screen name="routes/index" />
          <Stack.Screen name="routes/[id]" />
          <Stack.Screen name="share" />
          <Stack.Screen name="poster/index" />
          <Stack.Screen name="poster/done" options={{ gestureEnabled: false }} />
          <Stack.Screen name="premium" />
          <Stack.Screen name="your-map" />
        </Stack.Protected>
      </Stack>
      <DialogHost />
    </>
  );
}

export default function RootLayout() {
  // KeyboardProvider: sheets with fields move in step with the keyboard (BottomSheet).
  return (
    <KeyboardProvider>
      <SettingsProvider>
        <AppStack />
      </SettingsProvider>
    </KeyboardProvider>
  );
}

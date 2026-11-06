// Importing locationService defines the background location task at module
// load. Must stay the first import so the task exists when the OS launches the
// app headless.
import { resumeActiveDrive } from '../services/locationService';

import { useFonts } from 'expo-font';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
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

  if (!ready) return <View style={{ flex: 1, backgroundColor: c.background }} />;

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {/* Every screen draws its own title or back button. */}
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }}
      >
        {/* First launch only: Welcome, then the location explainer. */}
        <Stack.Protected guard={!onboarded}>
          <Stack.Screen name="welcome" />
          <Stack.Screen name="permission" />
        </Stack.Protected>
        <Stack.Protected guard={onboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="trips/[id]" />
          <Stack.Screen name="saved/[id]" options={{ gestureEnabled: false }} />
          <Stack.Screen name="roads/index" />
          <Stack.Screen name="roads/[id]" />
          <Stack.Screen name="share" />
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

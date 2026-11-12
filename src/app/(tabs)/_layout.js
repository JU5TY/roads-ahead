import { Tabs, router, useGlobalSearchParams, usePathname } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import FloatingButton from '../../components/ui/FloatingButton';
import Icon from '../../components/ui/Icon';
import { useActiveDrive } from '../../hooks/useActiveDrive';
import { useStyles, useTheme } from '../../hooks/useTheme';
import { floating, type } from '../../theme';

const ICONS = { index: 'home', trips: 'route', settings: 'person' };
const NAV_HEIGHT = 64;

/**
 * Bottom navigation: Home, Trips, You. Record isn't a tab; it opens from the
 * floating pill (RecordPill) and runs full screen. Expo Router passes { state,
 * descriptors, emitter, navigateToTab, insets } (not a `navigation` object).
 */
function TabBar({ state, descriptors, emitter, navigateToTab, insets }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  if (state.routes[state.index].name === 'record') return null;

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
      <View style={styles.row} role="tablist">
        {state.routes.map((route, i) => {
          if (!ICONS[route.name]) return null;
          const focused = state.index === i;
          const { title } = descriptors[route.key].options;
          const color = focused ? c.onNavPill : c.textMuted;
          const onPress = () => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigateToTab(route.key);
          };
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={styles.tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={title}
            >
              <View style={styles.iconBox}>
                <Icon name={ICONS[route.name]} size={24} color={color} filled={focused} />
              </View>
              <Text style={[type.nav, { color }]}>{title}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Floating pill above the nav on Home and Trips: "Record", or just the
 * red dot while a drive is recording. Both open Record, whose Ready screen
 * offers to continue a recent trip or start a new one.
 */
function RecordPill() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { view } = useGlobalSearchParams();
  const { drive } = useActiveDrive();

  if (pathname !== '/' && pathname !== '/trips') return null;
  // Trips' Planned view has Plan trip in this spot.
  if (pathname === '/trips' && view === 'planned') return null;
  const label = drive ? null : 'Record';

  return (
    <FloatingButton
      icon="radio_button_checked"
      filled
      iconColor={c.stop}
      label={label}
      accessibilityLabel={label ?? 'Open recording'}
      onPress={() => router.navigate('/record')}
      style={{ bottom: NAV_HEIGHT + insets.bottom + floating.recordPill.lift }}
    />
  );
}

export default function TabsLayout() {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Tabs
        tabBar={(props) => <TabBar {...props} />}
        // Each tab draws its own large title.
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.background } }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="trips" options={{ title: 'Trips' }} />
        <Tabs.Screen name="settings" options={{ title: 'You' }} />
        <Tabs.Screen name="record" options={{ title: 'Record' }} />
      </Tabs>
      <RecordPill />
    </View>
  );
}

const makeStyles = (c) => ({
  bar: { backgroundColor: c.navBar, borderTopWidth: 1, borderTopColor: c.navBorder },
  row: { flexDirection: 'row', height: NAV_HEIGHT, alignItems: 'center' },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  iconBox: { width: 64, height: 28, alignItems: 'center', justifyContent: 'center' },
});

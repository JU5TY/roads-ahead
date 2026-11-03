import { Tabs, router, usePathname } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { drive } = useActiveDrive();

  if (pathname !== '/' && pathname !== '/trips') return null;
  const label = drive ? null : 'Record';

  return (
    <Pressable
      onPress={() => router.navigate('/record')}
      accessibilityRole="button"
      accessibilityLabel={label ?? 'Open recording'}
      style={({ pressed }) => [
        styles.pill,
        !label && styles.pillRound,
        { bottom: NAV_HEIGHT + insets.bottom + floating.recordPill.lift },
        pressed && styles.pressed,
      ]}
    >
      <Icon name="radio_button_checked" filled size={26} color={c.stop} />
      {label ? <Text style={[type.button, styles.pillText]}>{label}</Text> : null}
    </Pressable>
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
  pill: {
    position: 'absolute',
    right: 16,
    height: floating.recordPill.height,
    borderRadius: floating.recordPill.height / 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 16,
    paddingRight: 22,
    backgroundColor: c.floating,
    shadowColor: c.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  pillRound: { width: 56, paddingLeft: 0, paddingRight: 0, justifyContent: 'center' },
  pillText: { color: c.text },
  pressed: { opacity: 0.85 },
});

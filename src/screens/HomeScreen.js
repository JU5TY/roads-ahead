import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import WeekDistance from '../components/home/WeekDistance';
import YourMap from '../components/home/YourMap';
import NoTrips from '../components/NoTrips';
import RoadsRing from '../components/roads/RoadsRing';
import TripCard from '../components/TripCard';
import SectionHeader from '../components/ui/SectionHeader';
import CountriesCard from '../components/home/CountriesCard';
import { useSettings } from '../context/SettingsContext';
import { useRoadCounts } from '../hooks/useRoadCounts';
import { useRoadTotals } from '../hooks/useRoadTotals';
import { useRouteStatus } from '../hooks/useRouteStatus';
import { useStyles, useTheme } from '../hooks/useTheme';
import { listTrips } from '../storage/tripStorage';
import { bottomSpace, pressedOpacity, radius, spacing, type } from '../theme';
import { ICONIC_ROADS } from '../utils/iconicRoads';
import { READY_ROUTES } from '../utils/readyRoutes';

/** One half of the Iconic card: a ring, its name and how far along you are; opens its list. */
function IconicHalf({ completed, total, title, onPress }) {
  const styles = useStyles(makeStyles);
  const line = completed ? `${completed} of ${total} completed` : 'Not completed yet';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`${title}: ${line}`}
      style={({ pressed }) => [styles.half, pressed && styles.pressed]}
    >
      <RoadsRing completed={completed} total={total} of={title} size="small" />
      <View style={styles.halfText}>
        <Text style={[type.bodyStrong, styles.text]}>{title}</Text>
        <Text style={[type.small, styles.muted]}>{line}</Text>
      </View>
    </Pressable>
  );
}

/** Iconic Roads and Iconic Trips side by side, each half opening its list. */
function IconicCard() {
  const styles = useStyles(makeStyles);
  const totals = useRoadTotals();
  const routes = useRouteStatus();
  const roadsDone = totals ? ICONIC_ROADS.filter((r) => totals.has(r.id)).length : 0;
  const tripsDone = routes ? READY_ROUTES.filter((r) => routes.get(r.id)?.completed).length : 0;
  return (
    <>
      <SectionHeader title="Iconic" />
      <View style={styles.iconic}>
        <IconicHalf
          completed={roadsDone}
          total={ICONIC_ROADS.length}
          title="Iconic Roads"
          onPress={() => router.push('/roads')}
        />
        <View style={styles.iconicDivider} />
        <IconicHalf
          completed={tripsDone}
          total={READY_ROUTES.length}
          title="Iconic Trips"
          onPress={() => router.push('/routes')}
        />
      </View>
    </>
  );
}

export default function HomeScreen() {
  const { units } = useSettings();
  const roadCounts = useRoadCounts();
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const [scrollY] = useState(() => new Animated.Value(0));
  // Only keep the map preview alive while Home is showing, to save memory.
  const focused = useIsFocused();
  // Trips plus the time they were loaded, so "today" is stable while open.
  const [data, setData] = useState(null); // { trips, now }

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      listTrips()
        .then((trips) => !cancelled && setData({ trips, now: Date.now() }))
        .catch((err) => console.warn('[home] load failed', err));
      return () => {
        cancelled = true;
      };
    }, [])
  );

  if (!data) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  const { trips, now } = data;
  const latest = trips[0];

  if (!latest) {
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
      >
        <NoTrips style={styles.empty} />
      </ScrollView>
    );
  }

  return (
    <Animated.ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      scrollEventThrottle={16}
      onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
      })}
    >
      <YourMap trips={trips} units={units} scrollY={scrollY} />
      <WeekDistance trips={trips} units={units} now={now} />
      <SectionHeader title="Latest trip" />
      <TripCard
        trip={latest}
        units={units}
        variant="large"
        showMap={focused}
        roadCount={roadCounts.get(latest.id) ?? 0}
      />
      <IconicCard />
      <CountriesCard trips={trips} />
    </Animated.ScrollView>
  );
}

const makeStyles = (c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  // Bottom padding clears the floating Record pill above the nav bar.
  content: { paddingHorizontal: spacing.md, paddingBottom: bottomSpace.recordPill },
  text: { color: c.text },
  muted: { color: c.textMuted },
  // As Home's other cards; a hairline between the halves.
  iconic: { flexDirection: 'row', borderRadius: radius.card, backgroundColor: c.card, ...c.cardShadow },
  iconicDivider: { width: 1, marginVertical: spacing.md, backgroundColor: c.divider },
  half: { flex: 1, alignItems: 'center', gap: 10, paddingVertical: 18, paddingHorizontal: spacing.sm },
  halfText: { alignItems: 'center', gap: 2 },
  pressed: { opacity: pressedOpacity },
  empty: { paddingTop: 188 }, // the same height as on Trips, under its title
});

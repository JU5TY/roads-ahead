import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import WeekDistance from '../components/home/WeekDistance';
import YourMap from '../components/home/YourMap';
import NoTrips from '../components/NoTrips';
import RoadsProgress from '../components/roads/RoadsProgress';
import TripCard from '../components/TripCard';
import SectionHeader from '../components/ui/SectionHeader';
import CountriesCard from '../components/home/CountriesCard';
import { useSettings } from '../context/SettingsContext';
import { useRoadCounts } from '../hooks/useRoadCounts';
import { useRoadTotals } from '../hooks/useRoadTotals';
import { useStyles, useTheme } from '../hooks/useTheme';
import { listTrips } from '../storage/tripStorage';
import { bottomSpace, spacing, type } from '../theme';
import { ICONIC_ROADS, ROADS_INTRO } from '../utils/iconicRoads';

/** Iconic Roads progress, linking to the full list. */
function RoadsCard() {
  const styles = useStyles(makeStyles);
  const totals = useRoadTotals();
  const done = totals ? ICONIC_ROADS.filter((r) => totals.has(r.id)).length : 0;
  return (
    <>
      <SectionHeader
        title="Iconic Roads"
        actionLabel="All roads"
        onAction={() => router.push('/roads')}
      />
      <Pressable onPress={() => router.push('/roads')} accessibilityRole="link">
        <RoadsProgress completed={done} total={ICONIC_ROADS.length}>
          {done === 0 ? (
            <Text style={[type.bodySmall, styles.roadsHint]}>{ROADS_INTRO}</Text>
          ) : null}
        </RoadsProgress>
      </Pressable>
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
      <SectionHeader
        title="Latest trip"
        actionLabel="All trips"
        onAction={() => router.navigate('/trips')}
      />
      <TripCard
        trip={latest}
        units={units}
        variant="large"
        showMap={focused}
        roadCount={roadCounts.get(latest.id) ?? 0}
      />
      <RoadsCard />
      <CountriesCard trips={trips} />
    </Animated.ScrollView>
  );
}

const makeStyles = (c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  // Bottom padding clears the floating Record pill above the nav bar.
  content: { paddingHorizontal: spacing.md, paddingBottom: bottomSpace.recordPill },
  roadsHint: { color: c.textMuted, marginTop: 14 },
  empty: { paddingTop: 188 }, // the same height as on Trips, under its title
});

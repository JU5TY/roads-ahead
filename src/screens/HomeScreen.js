import { useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Animated, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import IconicCard from '../components/home/IconicCard';
import UpNext, { upNextPlan } from '../components/home/UpNext';
import WeekDistance from '../components/home/WeekDistance';
import YourMap from '../components/home/YourMap';
import NoTrips from '../components/NoTrips';
import TripCard from '../components/TripCard';
import SectionHeader from '../components/ui/SectionHeader';
import CountriesCard from '../components/home/CountriesCard';
import { useSettings } from '../context/SettingsContext';
import { useRoadCounts } from '../hooks/useRoadCounts';
import { useRoadTotals } from '../hooks/useRoadTotals';
import { useRouteStatus } from '../hooks/useRouteStatus';
import { useStyles, useTheme } from '../hooks/useTheme';
import { drivenPlanDriveIds, listPlans } from '../storage/planStorage';
import { listTrips } from '../storage/tripStorage';
import { bottomSpace, spacing } from '../theme';
import { ICONIC_ROADS } from '../utils/iconicRoads';
import { READY_ROUTES } from '../utils/readyRoutes';

/** Home's Iconic card: every Iconic Road and Iconic Trip completed. */
function HomeIconicCard() {
  const totals = useRoadTotals();
  const routes = useRouteStatus();
  const roadsDone = totals ? ICONIC_ROADS.filter((r) => totals.has(r.id)).length : 0;
  const tripsDone = routes ? READY_ROUTES.filter((r) => routes.get(r.id)?.completed).length : 0;
  return <IconicCard roadsDone={roadsDone} tripsDone={tripsDone} />;
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
  // Trips plus the time they were loaded, so "today" is stable while open;
  // and the next planned trip.
  const [data, setData] = useState(null); // { trips, now, plan }

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([listTrips(), listPlans(), drivenPlanDriveIds()])
        .then(([trips, plans, driven]) => {
          if (cancelled) return;
          const now = Date.now();
          setData({ trips, now, plan: upNextPlan(plans, driven, now) });
        })
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

  const { trips, now, plan } = data;
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
      {plan ? <UpNext plan={plan} active={focused} /> : null}
      <SectionHeader title="Latest trip" />
      <TripCard
        trip={latest}
        units={units}
        variant="large"
        showMap={focused}
        roadCount={roadCounts.get(latest.id) ?? 0}
      />
      <HomeIconicCard />
      <CountriesCard trips={trips} />
    </Animated.ScrollView>
  );
}

const makeStyles = (c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  // Bottom padding clears the floating Record pill above the nav bar.
  content: { paddingHorizontal: spacing.md, paddingBottom: bottomSpace.recordPill },
  empty: { paddingTop: 188 }, // the same height as on Trips, under its title
});

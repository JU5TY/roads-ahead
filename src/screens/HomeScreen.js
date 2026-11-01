import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
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
import { distanceParts } from '../utils/format';
import { ICONIC_ROADS, ROADS_INTRO } from '../utils/iconicRoads';
import { computeTotals, firstDriveMonth } from '../utils/tripSummary';

/** The top of Home: the round Your map, the all-time distance and since when. */
function MapHero({ trips, units, insetTop }) {
  const styles = useStyles(makeStyles);
  const distance = distanceParts(computeTotals(trips).distanceM, units, { whole: true });
  return (
    <View style={[styles.band, { paddingTop: insetTop + 40 }]}>
      <YourMap trips={trips} />
      <Text style={styles.total}>
        {distance.value}
        <Text style={styles.totalUnit}> {distance.unit}</Text>
      </Text>
      <Text style={[type.bodyLarge, styles.muted, styles.since]}>driven since {firstDriveMonth(trips)}</Text>
    </View>
  );
}

/** Iconic Roads progress, linking to the full list. */
function RoadsCard() {
  const styles = useStyles(makeStyles);
  const totals = useRoadTotals();
  const done = totals ? ICONIC_ROADS.filter((r) => totals.has(r.id)).length : 0;
  return (
    <>
      <SectionHeader
        variant="overline"
        title="Iconic Roads"
        actionLabel="All roads"
        onAction={() => router.push('/roads')}
      />
      <Pressable onPress={() => router.push('/roads')} accessibilityRole="link">
        <RoadsProgress completed={done} total={ICONIC_ROADS.length}>
          {done === 0 ? (
            <Text style={[type.body, styles.roadsHint]}>{ROADS_INTRO}</Text>
          ) : null}
        </RoadsProgress>
      </Pressable>
    </>
  );
}

export default function HomeScreen() {
  const { units, showIconicRoads } = useSettings();
  const roadCounts = useRoadCounts();
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
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
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <MapHero trips={trips} units={units} insetTop={insets.top} />
      <WeekDistance trips={trips} units={units} now={now} />
      <SectionHeader
        variant="overline"
        title="Latest trip"
        actionLabel="All trips"
        onAction={() => router.navigate('/trips')}
      />
      <TripCard
        trip={latest}
        units={units}
        variant="large"
        showMap={focused}
        roadCount={showIconicRoads ? (roadCounts.get(latest.id) ?? 0) : 0}
      />
      {showIconicRoads ? <RoadsCard /> : null}
      <CountriesCard trips={trips} />
    </ScrollView>
  );
}

const makeStyles = (c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  // Bottom padding clears the floating Record pill above the nav bar.
  content: { paddingHorizontal: spacing.md, paddingBottom: bottomSpace.recordPill },
  band: {
    paddingBottom: 8, // 32 to the Distance card, with its 24
    alignItems: 'center',
  },
  total: {
    fontFamily: type.stat.fontFamily,
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: -0.5,
    color: c.accent,
    marginTop: 16,
  },
  totalUnit: { fontSize: 20 },
  since: { marginTop: 4 }, // ~6 under the number's glyphs
  muted: { color: c.textMuted },
  roadsHint: { color: c.textMuted, fontSize: 14, lineHeight: 20, marginTop: 14 },
  empty: { paddingTop: 188 }, // the same height as on Trips, under its title
});

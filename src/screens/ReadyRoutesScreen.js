import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import RoadRow from '../components/roads/RoadRow';
import RoadsRing from '../components/roads/RoadsRing';
import FilterChip from '../components/ui/FilterChip';
import IconButton from '../components/ui/IconButton';
import SectionHeader from '../components/ui/SectionHeader';
import { useSettings } from '../context/SettingsContext';
import { useRouteStatus } from '../hooks/useRouteStatus';
import { useStyles } from '../hooks/useTheme';
import { spacing, type } from '../theme';
import { formatDateRange, formatDistance } from '../utils/format';
import { READY_ROUTES, tripsIntro } from '../utils/readyRoutes';

const COUNTRIES = ['All', ...new Set(READY_ROUTES.map((r) => r.country))];

/**
 * "Scotland · 489 mi · 5 days", "Scotland · in Scotland 2027" once it's in
 * your plans, or "Scotland · Completed 3–8 Aug 2026".
 */
function routeLine(route, state, units) {
  if (state?.completed) {
    const { from, to } = state.completed;
    return `${route.country} · Completed ${formatDateRange(from, to)}`;
  }
  if (state) return `${route.country} · in ${state.plan.name}`;
  const days = `${route.drives.length} ${route.drives.length === 1 ? 'day' : 'days'}`;
  return `${route.country} · ${formatDistance(route.metres, units, 0)} · ${days}`;
}

/**
 * Iconic Trips, laid out like Iconic Roads: progress, a country filter, then
 * completed (about 90% driven) and not yet. One in your plans (copied) is blue
 * among the not yet. A trip opens its page, where it's copied.
 */
export default function ReadyRoutesScreen() {
  const { units } = useSettings();
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const status = useRouteStatus();
  const [country, setCountry] = useState('All');

  const stateOf = (route) => status?.get(route.id) ?? null;
  const shown = READY_ROUTES.filter((r) => country === 'All' || r.country === country);
  const done = shown
    .filter((r) => stateOf(r)?.completed)
    .sort((a, b) => stateOf(b).completed.to - stateOf(a).completed.to);
  // Not yet: A to Z, as on Iconic Roads.
  const notYet = shown.filter((r) => !stateOf(r)?.completed).sort((a, b) => a.name.localeCompare(b.name));
  const completedCount = READY_ROUTES.filter((r) => stateOf(r)?.completed).length;
  const row = (route) => (
    <RoadRow
      key={route.id}
      name={route.name}
      subtitle={routeLine(route, stateOf(route), units)}
      line={route.drives.flatMap((d) => d.line)}
      completed={!!stateOf(route)?.completed}
      planned={!!stateOf(route)}
      onPress={() => router.push(`/routes/${route.id}`)}
    />
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.xl },
      ]}
    >
      <IconButton
        icon="arrow_back"
        variant="plain"
        accessibilityLabel="Back"
        onPress={() => router.back()}
        style={styles.back}
      />
      <View style={styles.collection}>
        <Text style={[type.headline, styles.h1]} role="heading">
          Iconic Trips
        </Text>
        <RoadsRing completed={completedCount} total={READY_ROUTES.length} of="Iconic Trips" />
        <Text style={[type.bodyLarge, styles.text, styles.summary]}>
          {completedCount} completed · {READY_ROUTES.length - completedCount} to go
        </Text>
        <Text style={[type.bodySmall, styles.intro]}>{tripsIntro()}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chips}
        role="radiogroup"
      >
        {COUNTRIES.map((name) => (
          <FilterChip key={name} label={name} selected={country === name} onPress={() => setCountry(name)} />
        ))}
      </ScrollView>

      {done.length > 0 ? (
        <>
          <SectionHeader variant="overline" title={`Completed · ${done.length}`} style={styles.firstGroup} />
          <View style={styles.list}>{done.map(row)}</View>
        </>
      ) : null}
      {notYet.length > 0 ? (
        <>
          <SectionHeader
            variant="overline"
            title={`Not yet · ${notYet.length}`}
            style={done.length > 0 ? null : styles.firstGroup}
          />
          <View style={styles.list}>{notYet.map(row)}</View>
        </>
      ) : null}
    </ScrollView>
  );
}

const makeStyles = (c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  content: { paddingHorizontal: spacing.md },
  back: { alignSelf: 'flex-start', marginLeft: -12 },
  collection: { paddingTop: 4, paddingBottom: 8, alignItems: 'center' },
  h1: { alignSelf: 'stretch', color: c.text, marginHorizontal: 4, marginBottom: 24 }, // 24 under a title, as on Trips
  text: { color: c.text },
  summary: { marginTop: 14 },
  intro: {
    color: c.textMuted,
    textAlign: 'center',
    marginTop: 6,
    marginHorizontal: 16,
  },
  chipScroll: { marginHorizontal: -spacing.md, marginTop: spacing.md, flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: spacing.md },
  firstGroup: { marginTop: 24 },
  list: { gap: 8 },
});

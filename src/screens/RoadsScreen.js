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
import { useRoadTotals } from '../hooks/useRoadTotals';
import { useStyles } from '../hooks/useTheme';
import { spacing, type } from '../theme';
import { distanceParts, formatShortDate } from '../utils/format';
import { ICONIC_ROADS, ROADS_INTRO, inBritain } from '../utils/iconicRoads';

const COUNTRIES = ['All', ...new Set(ICONIC_ROADS.map((r) => r.country))];

/** "Peak District", or "Provence, France" for a road outside Britain. */
const placeOf = (road) => (inBritain(road) ? road.region : `${road.region}, ${road.country}`);

/** "Last completed 5 Nov 2026" when done more than once, else "Completed 5 Nov 2026". */
export const completedOn = ({ count, last }) =>
  `${count > 1 ? 'Last completed' : 'Completed'} ${formatShortDate(last)}`;

/** Every Iconic Road: progress, a country filter, then completed and not yet. */
export default function RoadsScreen() {
  const { units } = useSettings();
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const totals = useRoadTotals();
  const [country, setCountry] = useState('All');

  const shown = ICONIC_ROADS.filter((r) => country === 'All' || r.country === country);
  const done = shown
    .filter((r) => totals?.has(r.id))
    .sort((a, b) => totals.get(b.id).last - totals.get(a.id).last);
  // Not yet: A to Z, so the list is easy to scan as roads are added.
  const notYet = shown
    .filter((r) => !totals?.has(r.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const open = (road) => router.push(`/roads/${road.id}`);
  const completedCount = ICONIC_ROADS.filter((r) => totals?.has(r.id)).length;
  const km = (road) => {
    const d = distanceParts(road.lengthM, units);
    return `${d.value} ${d.unit}`;
  };

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
          Iconic Roads
        </Text>
        <RoadsRing completed={completedCount} total={ICONIC_ROADS.length} />
        <Text style={[type.bodyLarge, styles.text, styles.summary]}>
          {completedCount} completed · {ICONIC_ROADS.length - completedCount} to go
        </Text>
        <Text style={[type.body, styles.intro]}>{ROADS_INTRO}</Text>
      </View>
      {/* One row that scrolls sideways, edge to edge, as more countries get roads. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chips}
        role="radiogroup"
      >
        {COUNTRIES.map((name) => (
          <FilterChip
            key={name}
            label={name}
            selected={country === name}
            onPress={() => setCountry(name)}
          />
        ))}
      </ScrollView>

      {done.length > 0 ? (
        <>
          <SectionHeader
            variant="overline"
            title={`Completed · ${done.length}`}
            style={styles.firstGroup}
          />
          <View style={styles.list}>
            {done.map((road) => (
              <RoadRow
                key={road.id}
                completed
                name={road.name}
                subtitle={`${placeOf(road)} · ${completedOn(totals.get(road.id))}`}
                onPress={() => open(road)}
              />
            ))}
          </View>
        </>
      ) : null}
      {notYet.length > 0 ? (
        <>
          <SectionHeader
            variant="overline"
            title={`Not yet · ${notYet.length}`}
            style={done.length > 0 ? null : styles.firstGroup}
          />
          <View style={styles.list}>
            {notYet.map((road) => (
              <RoadRow
                key={road.id}
                name={road.name}
                subtitle={`${placeOf(road)} · ${km(road)}`}
                onPress={() => open(road)}
              />
            ))}
          </View>
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
  h1: { alignSelf: 'stretch', color: c.text, marginHorizontal: 4, marginBottom: 12 },
  text: { color: c.text },
  summary: { marginTop: 14 },
  intro: {
    color: c.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 6,
    marginHorizontal: 16,
  },
  chipScroll: { marginHorizontal: -spacing.md, marginTop: spacing.md, flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: spacing.md },
  firstGroup: { marginTop: 24 },
  list: { gap: 8 },
});

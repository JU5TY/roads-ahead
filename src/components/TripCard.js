import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { useTripPreview } from '../hooks/useTripPreview';
import { useStyles, useTheme } from '../hooks/useTheme';
import { pressedOpacity, radius, type } from '../theme';
import { formatDate, formatDistance, formatDurationShort, tripKicker } from '../utils/format';
import { groupIntoDays, summarizeDrives, tripTitle } from '../utils/tripSummary';
import RoutePreview from './RoutePreview';
import RouteThumb from './RouteThumb';
import Icon from './ui/Icon';

/**
 * Trip card: route map, green date line, name, "780 km · 11h 55m". Tapping it
 * opens the trip. variant 'large' (map on top, Home's Latest trip) or 'row'
 * (round 56px route outline on the right, Trips list). `showMap={false}` swaps
 * the large card's map for a placeholder while the screen is in the background. `roadCount` adds an
 * Iconic Roads chip. Drives whose times are hidden are left out of the time.
 */
export default function TripCard({ trip, units, variant = 'row', showMap = true, roadCount = 0 }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const segments = useTripPreview(trip);
  const first = trip.drives[0];
  const last = trip.drives.at(-1);
  const dayCount = groupIntoDays(trip.drives).length;
  const summary = summarizeDrives(trip.drives);
  const timed = trip.drives.filter((d) => !d.stats.timesHidden);
  const movingTimeMs = timed.reduce((sum, d) => sum + (d.stats.movingTimeMs ?? 0), 0);
  const large = variant === 'large';
  const countryCount = new Set(trip.drives.flatMap((d) => (d.countries ?? []).map((v) => v.code)))
    .size;
  const roadChip =
    roadCount > 0 ? (
      <View style={[styles.chip, styles.roadChip]}>
        <Icon name="verified" size={14} color={c.onRoadContainer} />
        <Text style={[type.nav, styles.roadChipText]}>
          {roadCount} {roadCount === 1 ? 'Iconic Road' : 'Iconic Roads'}
        </Text>
      </View>
    ) : null;
  // The Trips list also counts countries, from two up.
  const countryChip =
    !large && countryCount > 1 ? (
      <View style={[styles.chip, styles.countryChip]}>
        <Icon name="public" size={14} color={c.textMuted} />
        <Text style={[type.nav, styles.muted]}>{countryCount} countries</Text>
      </View>
    ) : null;

  return (
    // A plain Pressable, not <Link asChild>: Link drops function styles on
    // Android, which collapsed the card's row layout.
    <Pressable
      onPress={() => router.push(`/trips/${trip.id}`)}
      accessibilityRole="link"
      style={({ pressed }) => [
        large ? styles.large : styles.row,
        pressed && !large && styles.pressed,
      ]}
    >
      {({ pressed }) => (
        <>
          {large ? <RoutePreview segments={segments ?? []} height={180} active={showMap} /> : null}
          {/* The large card fades only its text: a faded map shows the card's shadow through it. */}
          <View style={large ? [styles.largeText, pressed && styles.pressed] : styles.rowText}>
            <Text style={[type.caps, styles.kicker]} numberOfLines={1}>
              {tripKicker(first.startedAt, last.endedAt, dayCount)}
            </Text>
            <Text style={[large ? type.section : styles.rowTitle, styles.title]} numberOfLines={1}>
              {tripTitle(trip) ?? formatDate(first.startedAt)}
            </Text>
            <View style={large ? styles.metaRow : null}>
              <Text style={[type.body, styles.muted]} numberOfLines={1}>
                {formatDistance(summary.distanceM, units, summary.distanceM < 100000 ? 1 : 0)}
                {timed.length > 0 ? ` · ${formatDurationShort(movingTimeMs)}` : ''}
                {/* One drive a day goes without saying; more shows it's a trip, not a drive. */}
                {trip.drives.length > dayCount ? ` · ${trip.drives.length} drives` : ''}
              </Text>
              {large ? roadChip : null}
            </View>
            {!large && (roadChip || countryChip) ? (
              <View style={styles.chipBelow}>
                {roadChip}
                {countryChip}
              </View>
            ) : null}
          </View>
          {large ? null : <RouteThumb segments={segments ?? []} />}
        </>
      )}
    </Pressable>
  );
}

const makeStyles = (c) => ({
  large: {
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: c.card,
    ...c.cardShadow,
  },
  largeText: { paddingTop: 16, paddingHorizontal: 20, paddingBottom: 18, gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.card,
    backgroundColor: c.card,
    ...c.cardShadow,
  },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { ...type.bodyStrong },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  chipBelow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6 },
  roadChip: {
    paddingVertical: 2,
    paddingLeft: 6,
    paddingRight: 8,
    backgroundColor: c.roadContainer,
  },
  roadChipText: { color: c.onRoadContainer },
  countryChip: {
    paddingVertical: 1,
    paddingLeft: 5,
    paddingRight: 7,
    borderWidth: 1,
    borderColor: c.outline,
  },
  kicker: { color: c.accent },
  title: { color: c.text },
  muted: { color: c.textMuted },
  pressed: { opacity: pressedOpacity },
});

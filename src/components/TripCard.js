import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { useTripPreview } from '../hooks/useTripPreview';
import { useStyles, useTheme } from '../hooks/useTheme';
import { pressedOpacity, radius, type } from '../theme';
import { formatDate, formatDistance, formatDurationShort, tripKicker } from '../utils/format';
import { groupIntoDays, summarizeDrives, tripTitle } from '../utils/tripSummary';
import RoadBadge from './RoadBadge';
import RoutePreview from './RoutePreview';
import RouteThumb from './RouteThumb';

const MAP_HEIGHT = 132;

/**
 * Trip card: route map, green date line, name, "780 km · 11h 55m". Tapping it
 * opens the trip. variant 'large' (map on top, Home's Latest trip) or 'row'
 * (round 56px route outline on the right, Trips list). `showMap={false}` swaps
 * the large card's map for a placeholder while the screen is in the background. `roadCount`
 * puts the Iconic Road mark on the map or outline (the count is only spoken).
 * Drives whose times are hidden are left out of the time.
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
  const kicker = tripKicker(first.startedAt, last.endedAt, dayCount);
  const title = tripTitle(trip) ?? formatDate(first.startedAt);
  const meta =
    formatDistance(summary.distanceM, units) +
    (timed.length > 0 ? ` · ${formatDurationShort(movingTimeMs)}` : '');
  const roads = roadCount > 0 ? `includes ${roadCount} ${roadCount === 1 ? 'Iconic Road' : 'Iconic Roads'}` : null;

  return (
    // A plain Pressable, not <Link asChild>: Link drops function styles on
    // Android, which collapsed the card's row layout.
    <Pressable
      onPress={() => router.push(`/trips/${trip.id}`)}
      accessibilityRole="link"
      accessibilityLabel={roads ? `${title}, ${kicker.toLowerCase()}, ${meta}, ${roads}` : undefined}
      style={({ pressed }) => [
        large ? styles.large : styles.row,
        pressed && !large && styles.pressed,
      ]}
    >
      {({ pressed }) => (
        <>
          {large ? <RoutePreview segments={segments ?? []} height={MAP_HEIGHT} active={showMap} /> : null}
          {/* The large card fades only its text: a faded map shows the card's shadow through it. */}
          <View style={large ? [styles.largeText, pressed && styles.pressed] : styles.rowText}>
            <Text style={[type.caps, styles.kicker]} numberOfLines={1}>
              {kicker}
            </Text>
            <Text style={[type.bodyStrong, styles.title]} numberOfLines={1}>
              {title}
            </Text>
            <Text style={[type.body, styles.muted]} numberOfLines={1}>
              {meta}
            </Text>
          </View>
          {large ? (
            roads ? <RoadBadge ring={c.card} size={30} style={styles.mapEdge} /> : null
          ) : (
            <View>
              <RouteThumb segments={segments ?? []} />
              {roads ? <RoadBadge ring={c.card} style={styles.corner} /> : null}
            </View>
          )}
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
  // The same text, size and spacing as a row card.
  largeText: { paddingVertical: 14, paddingHorizontal: 16, gap: 2 },
  // Half on the map, half on the card, at the map's bottom right.
  mapEdge: { position: 'absolute', right: 16, top: MAP_HEIGHT - 15 },
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
  corner: { position: 'absolute', right: -3, bottom: -3 },
  kicker: { color: c.accent },
  title: { color: c.text },
  muted: { color: c.textMuted },
  pressed: { opacity: pressedOpacity },
});

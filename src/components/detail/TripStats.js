import { Pressable, ScrollView, Text, View } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { type } from '../../theme';
import {
  distanceParts,
  formatDurationShort,
  formatElevation,
  formatSpeed,
} from '../../utils/format';
import { averageMovingSpeed } from '../../utils/geoMath';
import Icon from '../ui/Icon';
import ListRow from '../ui/ListRow';
import SectionHeader from '../ui/SectionHeader';
import StatCard from '../ui/StatCard';

/** Green caps line, title, grey subtitle and optional notes. Tapping it calls onPress (edit). */
export function TitleBlock({ kicker, title, subtitle, notes, onPress }) {
  const styles = useStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <Text style={[type.kicker, styles.kicker]}>{kicker}</Text>
      <Text style={[type.title, styles.title]}>{title}</Text>
      {subtitle ? <Text style={[type.body, styles.subtitle]}>{subtitle}</Text> : null}
      {notes ? <Text style={[type.body, styles.notes]}>{notes}</Text> : null}
    </Pressable>
  );
}

/**
 * The headline: distance, with Iconic Roads, rest-stops and countries chips,
 * and Driving time; the rest is in DetailsRows. `stats` is a drive's stats or
 * a summarizeDrives() result. `timesHidden` swaps Driving time for a note (a
 * drive that starts and ends at an Iconic Road); `roadCount` and
 * `countryCount` (shown from 2) add chips.
 */
export function HeroStats({ stats, units, timesHidden = false, roadCount = 0, countryCount = 0 }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const distance = distanceParts(stats.distanceM, units);
  const stopChip = stats.stopCount > 0;

  return (
    <>
      <View
        style={styles.hero}
        accessible
        accessibilityLabel={`Distance ${distance.value} ${distance.unit}`}
      >
        <Text style={styles.heroValue}>{distance.value}</Text>
        <Text style={styles.heroUnit}>{distance.unit}</Text>
      </View>
      {stopChip || roadCount > 0 || countryCount > 1 ? (
        // Scrolls sideways when the chips don't fit, edge to edge like the Drive pills.
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={styles.chips}
        >
          {roadCount > 0 ? (
            <View style={[styles.chip, styles.chipRoads]}>
              <Icon name="verified" size={18} color={c.onRoadContainer} />
              <Text style={[type.label, styles.chipRoadsText]}>
                {roadCount} {roadCount === 1 ? 'Iconic Road' : 'Iconic Roads'}
              </Text>
            </View>
          ) : null}
          {stopChip ? (
            <View style={styles.chip}>
              <Icon name="local_cafe" size={18} color={c.textMuted} />
              <Text style={[type.label, styles.chipText]}>
                {stats.stopCount} {stats.stopCount === 1 ? 'stop' : 'stops'}
              </Text>
            </View>
          ) : null}
          {countryCount > 1 ? (
            <View style={styles.chip}>
              <Icon name="public" size={18} color={c.textMuted} />
              <Text style={[type.label, styles.chipText]}>{countryCount} countries</Text>
            </View>
          ) : null}
        </ScrollView>
      ) : null}
      <View style={styles.grid}>
        {timesHidden ? (
          <TimesHiddenCard />
        ) : (
          <StatCard
            layout="wide"
            tone="accent"
            icon="timer"
            label="Driving time"
            value={formatDurationShort(stats.movingTimeMs)}
          />
        )}
      </View>
    </>
  );
}

/** Stands in for Driving time on a drive that starts and ends at an Iconic Road. */
function TimesHiddenCard() {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.hidden}>
      <View style={styles.hiddenWell}>
        <Icon name="visibility_off" size={26} color={c.onAccentContainer} />
      </View>
      <View style={styles.flex}>
        <Text style={[type.bodyStrong, styles.hiddenTitle]}>Times hidden for safety</Text>
        <Text style={[type.body, styles.subtitleText, styles.hiddenText]}>
          {"This drive starts and ends at an Iconic Road, so its times and speeds aren't shown."}
        </Text>
      </View>
    </View>
  );
}

/**
 * "Details" rows, in three groups: time (Elapsed, Longest stretch, Rest stops),
 * height (Highest point, Elevation gain) and speed (Avg, then Max, low-key last).
 * With `timesHidden` only rest stops and height are left. Rest stops is left
 * out when there are none, Longest stretch when it's just the moving time
 * again (or unknown), and the section when no rows are left.
 * `hiddenNote` explains that some drives' times were left out of a trip's totals.
 */
export function DetailsRows({
  stats,
  elapsedMs,
  units,
  timesHidden = false,
  hiddenNote,
  subtitle,
}) {
  const styles = useStyles(makeStyles);
  const hasStops = stats.stopCount > 0;
  // Drives recorded before this stat existed don't have it.
  const longest = stats.longestStintMs == null ? null : formatDurationShort(stats.longestStintMs);
  const showLongest = longest != null && longest !== formatDurationShort(stats.movingTimeMs);
  const height = [
    ['landscape', 'Highest point', formatElevation(stats.maxAltitudeM, units)],
    ['trending_up', 'Elevation gain', formatElevation(stats.elevationGainM, units)],
  ];
  const rows = timesHidden
    ? [...(hasStops ? [['local_cafe', 'Rest stops', String(stats.stopCount)]] : []), ...height]
    : [
        ['schedule', 'Elapsed time', formatDurationShort(elapsedMs)],
        ...(showLongest ? [['hourglass_top', 'Longest stretch', longest]] : []),
        ...(hasStops
          ? [
              [
                'local_cafe',
                'Rest stops',
                `${stats.stopCount} · ${formatDurationShort(stats.totalStopMs)}`,
              ],
            ]
          : []),
        ...height,
        ['speed', 'Avg speed', formatSpeed(averageMovingSpeed(stats), units)],
        ['bolt', 'Max speed', formatSpeed(stats.topSpeedMps, units)],
      ];
  if (rows.length === 0) return null;
  return (
    <>
      <SectionHeader title="Details" subtitle={subtitle} />
      <View style={styles.group}>
        {rows.map(([icon, title, value], i) => (
          <ListRow
            key={title}
            icon={icon}
            title={title}
            value={value}
            strongValue
            dense
            divider={i < rows.length - 1}
          />
        ))}
      </View>
      {hiddenNote ? (
        <Text style={[type.small, styles.subtitleText, styles.hiddenNote]}>{hiddenNote}</Text>
      ) : null}
    </>
  );
}

const makeStyles = (c) => ({
  kicker: { color: c.accent, marginHorizontal: 4 },
  title: { color: c.text, marginTop: 4, marginHorizontal: 4 },
  subtitle: { color: c.textMuted, marginTop: 2, marginHorizontal: 4 },
  notes: { color: c.text, marginTop: 10, marginHorizontal: 4 },
  hero: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 18,
    marginHorizontal: 4,
  },
  heroValue: { ...type.display, color: c.accent },
  heroUnit: {
    ...type.title,
    fontFamily: type.bodyLarge.fontFamily,
    fontSize: 22,
    color: c.textMuted,
  },
  chipScroll: { marginHorizontal: -16, marginTop: 16, flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: 16 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: c.outline,
  },
  chipText: { color: c.textMuted, fontFamily: type.nav.fontFamily },
  grid: { gap: 10, marginTop: 20 },
  group: {
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: c.card,
    ...c.cardShadow,
  },
  chipRoads: { borderWidth: 0, backgroundColor: c.roadContainer },
  chipRoadsText: { color: c.onRoadContainer },
  hidden: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: 12,
    ...c.cardShadow,
    paddingVertical: 18,
    paddingHorizontal: 20,
    backgroundColor: c.card,
  },
  hiddenWell: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.accentContainer,
  },
  hiddenTitle: { color: c.text },
  hiddenText: { fontSize: 14, lineHeight: 20 },
  subtitleText: { color: c.textMuted, marginTop: 2 },
  hiddenNote: { marginTop: 8, marginHorizontal: 4 },
  flex: { flex: 1 },
});

import { Text, View } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { radius, type } from '../../theme';
import {
  distanceParts,
  elevationParts,
  formatDurationShort,
  formatElevation,
  formatSpeed,
} from '../../utils/format';
import { averageMovingSpeed } from '../../utils/geoMath';
import Icon from '../ui/Icon';
import ListRow from '../ui/ListRow';
import SectionHeader from '../ui/SectionHeader';
import StatRow from '../ui/StatRow';

/** Green caps line, title, grey subtitle and optional notes. Edited from the menu, not by tapping. */
export function TitleBlock({ kicker, title, subtitle, notes }) {
  const styles = useStyles(makeStyles);
  return (
    <View>
      <Text style={[type.kicker, styles.kicker]}>{kicker}</Text>
      <Text style={[type.title, styles.title]}>{title}</Text>
      {subtitle ? <Text style={[type.body, styles.subtitle]}>{subtitle}</Text> : null}
      {notes ? <Text style={[type.body, styles.notes]}>{notes}</Text> : null}
    </View>
  );
}

/**
 * The headline: Distance and Driving time in one split card; the rest is in
 * DetailsRows. `stats` is a drive's stats or a summarizeDrives() result.
 * `timesHidden` (a drive that starts and ends at an Iconic Road) puts Highest
 * point in Driving time's place, as on an Iconic Road, with a note under the
 * card. `longDay` marks a plan's day with more driving than most people
 * manage (amber Driving time). `showTime={false}` leaves Driving time out
 * while it's still being worked out (an Iconic Trip); `timeNote` takes the
 * time's place when it can't be had ("—").
 */
export function HeroStats({
  stats,
  units,
  timesHidden = false,
  longDay = false,
  showTime = true,
  timeNote = null,
}) {
  const styles = useStyles(makeStyles);
  const distance = distanceParts(stats.distanceM, units);

  return (
    <>
      <StatRow
        style={styles.stats}
        stats={[
          { icon: 'conversion_path', ...distance, label: 'Distance' },
          ...(timesHidden
            ? [{ icon: 'altitude', ...elevationParts(stats.maxAltitudeM, units), label: 'Highest point' }]
            : []),
          ...(showTime && !timesHidden
            ? [
                {
                  icon: 'timer',
                  value: timeNote ?? formatDurationShort(stats.movingTimeMs),
                  label: 'Driving time',
                  caution: longDay,
                },
              ]
            : []),
        ]}
      />
      {timesHidden ? <TimesHiddenCard /> : null}
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
        <Text style={[type.bodySmall, styles.subtitleText]}>
          {"This drive starts and ends at an Iconic Road, so its times and speeds aren't shown."}
        </Text>
      </View>
    </View>
  );
}

/**
 * "Details" rows, in three groups: time (Elapsed, Longest stretch, Rest stops),
 * height (Highest point, Climb) and speed (Avg, then Max, low-key last).
 * With `timesHidden` only rest stops and Climb are left (Highest point is in
 * the card). Rest stops is left out when there are none, Longest stretch
 * when it's just the moving time again (or unknown), and the section when no
 * rows are left.
 * `hiddenNote` explains that some drives' times were left out of a trip's totals.
 * `fuel` (a FuelCostRow, without its divider) ends the card.
 */
export function DetailsRows({
  stats,
  elapsedMs,
  units,
  timesHidden = false,
  hiddenNote,
  subtitle,
  fuel,
}) {
  const styles = useStyles(makeStyles);
  const hasStops = stats.stopCount > 0;
  // Drives recorded before this stat existed don't have it.
  const longest = stats.longestStintMs == null ? null : formatDurationShort(stats.longestStintMs);
  const showLongest = longest != null && longest !== formatDurationShort(stats.movingTimeMs);
  const height = [
    ['altitude', 'Highest point', formatElevation(stats.maxAltitudeM, units)],
    ['trending_up', 'Climb', formatElevation(stats.elevationGainM, units)],
  ];
  const rows = timesHidden
    ? [...(hasStops ? [['local_cafe', 'Rest stops', String(stats.stopCount)]] : []), height[1]]
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
        ['speed', 'Average speed', formatSpeed(averageMovingSpeed(stats), units)],
        ['bolt', 'Max speed', formatSpeed(stats.topSpeedMps, units)],
      ];
  if (rows.length === 0 && !fuel) return null;
  return (
    <>
      <DetailsCard subtitle={subtitle}>
        {rows.map(([icon, title, value], i) => (
          <ListRow
            key={title}
            icon={icon}
            title={title}
            value={value}
            strongValue
            dense
            divider={i < rows.length - 1 || !!fuel}
          />
        ))}
        {fuel}
      </DetailsCard>
      {hiddenNote ? (
        <Text style={[type.small, styles.subtitleText, styles.hiddenNote]}>{hiddenNote}</Text>
      ) : null}
    </>
  );
}

/** The "Details" heading ("Whole trip" under it) and the card its rows sit in. */
export function DetailsCard({ subtitle, children }) {
  const styles = useStyles(makeStyles);
  return (
    <>
      <SectionHeader title="Details" subtitle={subtitle} />
      <View style={styles.group}>{children}</View>
    </>
  );
}

const makeStyles = (c) => ({
  kicker: { color: c.accent, marginHorizontal: 4 },
  title: { color: c.text, marginTop: 4, marginHorizontal: 4 },
  subtitle: { color: c.textMuted, marginTop: 2, marginHorizontal: 4 },
  notes: { color: c.text, marginTop: 10, marginHorizontal: 4 },
  stats: { marginTop: 18 },
  group: {
    paddingHorizontal: 12,
    borderRadius: radius.card,
    backgroundColor: c.card,
    ...c.cardShadow,
  },
  hidden: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: radius.card,
    ...c.cardShadow,
    padding: 20,
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
  subtitleText: { color: c.textMuted, marginTop: 2 },
  hiddenNote: { marginTop: 8, marginHorizontal: 4 },
  flex: { flex: 1 },
});

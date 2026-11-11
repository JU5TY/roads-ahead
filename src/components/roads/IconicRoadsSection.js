import { router } from 'expo-router';
import { View } from 'react-native';

import { useStyles } from '../../hooks/useTheme';
import { completedLabel, dayLabel, getRoad } from '../../utils/iconicRoads';
import SectionHeader from '../ui/SectionHeader';
import RoadRow from './RoadRow';

/** One drive's wording: "Completed twice today · 3 times in all", "Completed · 1st time". */
function dayPageLabel(count, total, today) {
  const times =
    count === 1 ? 'Completed' : count === 2 ? 'Completed twice' : `Completed ${count} times`;
  const all = total <= 1 ? '1st time' : `${total} times in all`;
  return `${times}${today ? ' today' : ''} · ${all}`;
}

/**
 * "Iconic Roads" on the Trip page (all of it, or one drive): one row per road.
 * All: pass `dayOf(driveId)`, for "Completed 2 times · Day 3".
 * One drive: pass `totals` (getRoadTotals) and `today` (the drive was today),
 * for "Completed twice today · 3 times in all".
 * `header={false}` leaves out the title and All roads link (Drive saved, where
 * the rows speak for themselves); `style` then spaces the list.
 * Renders nothing when there are no completions.
 */
export default function IconicRoadsSection({
  completions,
  dayOf,
  totals,
  today = false,
  header = true,
  style,
}) {
  const styles = useStyles(makeStyles);
  const groups = new Map();
  for (const c of completions) {
    if (!getRoad(c.roadId)) continue;
    const g = groups.get(c.roadId) ?? { road: getRoad(c.roadId), count: 0, days: [] };
    g.count += 1;
    if (dayOf) g.days.push(dayOf(c.driveId));
    groups.set(c.roadId, g);
  }
  if (groups.size === 0) return null;
  return (
    <>
      {header ? (
        <SectionHeader
          title="Iconic Roads"
          actionLabel="All roads"
          onAction={() => router.push('/roads')}
          style={styles.header}
        />
      ) : null}
      <View style={[styles.list, style]}>
        {[...groups.values()].map(({ road, count, days }) => (
          <RoadRow
            key={road.id}
            completed
            name={road.name}
            line={road.line}
            subtitle={
              dayOf
                ? `${completedLabel(count)} · ${dayLabel(days)}`
                : totals
                  ? dayPageLabel(count, totals.get(road.id)?.count ?? count, today)
                  : completedLabel(count)
            }
            onPress={() => router.push(`/roads/${road.id}`)}
          />
        ))}
      </View>
    </>
  );
}

const makeStyles = () => ({
  header: { marginBottom: 14 },
  list: { gap: 8 },
});

import { Text, View } from 'react-native';

import { useSettings } from '../../context/SettingsContext';
import { useStyles, useTheme } from '../../hooks/useTheme';
import { dayColorFor, type } from '../../theme';
import { routeDriveFrom, routeDriveLine, routeDriveRoads } from '../../utils/readyRoutes';
import Icon from '../ui/Icon';

/** A row with a marker in the rail: the start, a night, or the finish. */
function Place({ marker, name, subtitle }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.event}>
      <View style={styles.rail}>{marker}</View>
      <View style={styles.flex}>
        <Text style={[type.bodyStrong, styles.text]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[type.small, styles.muted]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

/**
 * An Iconic Trip day by day, in the plan timeline's look: the start, then each
 * day as a bar in its colour ("Day 1 · 80 mi · 2 stops", a chip per Iconic
 * Road), a ring where you stay the night, and the finish. Its stops show once
 * it's copied to your plans.
 */
export default function RouteDays({ route }) {
  const { c } = useTheme();
  const { units } = useSettings();
  const styles = useStyles(makeStyles);
  const last = route.drives.length - 1;
  return (
    <View>
      <Place
        marker={<View style={[styles.dot, { backgroundColor: c.start }]} />}
        name={routeDriveFrom(route, 0)}
        subtitle="Start"
      />
      {route.drives.map((d, i) => {
        const color = dayColorFor(c, i + 1);
        return (
          <View key={i}>
            <View style={styles.leg}>
              <View style={styles.rail}>
                <View style={[styles.bar, { backgroundColor: color }]} />
              </View>
              <View style={styles.legText}>
                <Text style={[type.label, styles.muted, styles.regular]}>
                  <Text style={[styles.text, styles.strong]}>Day {i + 1}</Text> · {routeDriveLine(route, i, units)}
                </Text>
                {routeDriveRoads(route, i).map((road) => (
                  <View key={road} style={styles.roadChip}>
                    <Icon name="verified" size={14} color={c.onRoadContainer} filled />
                    <Text style={[type.nav, styles.roadChipText]} numberOfLines={1}>
                      {road}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
            {i < last ? (
              <Place
                marker={<View style={[styles.ring, { borderColor: color }]} />}
                name={d.stops.at(-1).name}
                subtitle={`Night ${i + 1}`}
              />
            ) : (
              <Place
                marker={<View style={[styles.dot, { backgroundColor: c.finish }]} />}
                name={d.stops.at(-1).name}
                subtitle={d.stops.at(-1).name === routeDriveFrom(route, 0) ? 'Back to the start' : 'Finish'}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

// As PlanTimeline's rows.
const makeStyles = (c) => ({
  event: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  leg: { flexDirection: 'row', alignItems: 'stretch', gap: 12, minHeight: 44 },
  rail: { width: 22, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 16, height: 16, borderRadius: 8 },
  ring: { width: 16, height: 16, borderRadius: 8, borderWidth: 3, backgroundColor: c.background },
  bar: { width: 4, flex: 1, borderRadius: 2 },
  flex: { flex: 1, minWidth: 0 },
  text: { color: c.text },
  strong: { fontFamily: type.label.fontFamily },
  muted: { color: c.textMuted },
  regular: { fontFamily: type.body.fontFamily },
  legText: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingVertical: 8 },
  roadChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
    paddingVertical: 2,
    paddingLeft: 6,
    paddingRight: 8,
    borderRadius: 6,
    backgroundColor: c.roadContainer,
  },
  roadChipText: { color: c.onRoadContainer, letterSpacing: 0 },
});

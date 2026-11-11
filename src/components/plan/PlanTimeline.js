import { Pressable, Text, View } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { pressedOpacity, type } from '../../theme';
import { getRoad } from '../../utils/iconicRoads';
import Icon from '../ui/Icon';

const RAIL_W = 22;

/** Green start dot, numbered ring for a stop, red finish dot. */
function Marker({ kind, number, color }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  if (kind === 'stop') {
    return (
      <View style={[styles.ring, { borderColor: color }]}>
        <Text style={[styles.ringNumber, { color }]}>{number}</Text>
      </View>
    );
  }
  return <View style={[styles.dot, { backgroundColor: kind === 'start' ? c.start : c.finish }]} />;
}

function EventRow({ kind, number, color, name, subtitle, linked, onPress }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const body = (
    <View style={styles.event}>
      <View style={styles.rail}>
        <Marker kind={kind} number={number} color={color} />
      </View>
      <View style={styles.flex}>
        <Text style={[type.bodyStrong, styles.text]} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.subtitle}>
          {linked ? <Icon name="link" size={15} color={c.textMuted} /> : null}
          <Text style={[type.small, styles.muted]} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </View>
      {onPress ? <Icon name="more_vert" size={22} color={c.textMuted} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => pressed && styles.pressed}>
      {body}
    </Pressable>
  );
}

/** Between two rows: the drive's bar, with an Iconic Road's chip when the leg drives one. */
function LegRow({ color, road, text, onPress }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const body = (
    <View style={styles.leg}>
      <View style={styles.rail}>
        <View style={[styles.bar, { backgroundColor: color }]} />
      </View>
      <View style={styles.legText}>
        {text ? <Text style={[type.label, styles.muted, styles.regular]}>{text}</Text> : null}
        {road ? (
          <View style={styles.roadChip}>
            <Icon name="verified" size={14} color={c.onRoadContainer} filled />
            <Text style={[type.nav, styles.roadChipText]} numberOfLines={1}>
              {road}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => pressed && styles.pressed}>
      {body}
    </Pressable>
  );
}

/**
 * One planned drive as a timeline, like the Trip page's: its start (a green
 * dot; linked when it's where the drive before ends), a numbered ring per stop,
 * an Iconic Road as a chip on the leg it's driven on, and the last place as the
 * red finish. Leg distances come with leg routing. `start` is driveStart();
 * onStopPress(stop) opens a stop's options.
 */
export default function PlanTimeline({ drive, index, start, color, onStopPress }) {
  const { c } = useTheme();
  const rows = [];
  const startName = start?.name ?? 'Your location';
  const startSubtitle = start?.linked
    ? `End of drive ${index}`
    : start
      ? 'Start'
      : 'Wherever you are when you start';
  rows.push(
    <EventRow key="start" kind="start" name={startName} subtitle={startSubtitle} linked={start?.linked} />
  );

  if (drive.stops.length === 0) {
    rows.push(<LegRow key="empty" color={c.outline} text="No stops yet. Add where this drive goes" />);
    return <View>{rows}</View>;
  }

  const lastPlace = drive.stops.map((s) => !s.roadId).lastIndexOf(true);
  let number = 0;
  drive.stops.forEach((stop, i) => {
    const road = stop.roadId ? getRoad(stop.roadId) : null;
    if (road) {
      rows.push(
        <LegRow key={`leg-${stop.id}`} color={color} road={road.name} onPress={() => onStopPress(stop)} />
      );
      return;
    }
    // A leg leads into each place, unless an Iconic Road's leg already did.
    if (!drive.stops[i - 1]?.roadId) rows.push(<LegRow key={`leg-${stop.id}`} color={color} />);
    const finish = i === drive.stops.length - 1 && i === lastPlace;
    if (!finish) number += 1;
    rows.push(
      <EventRow
        key={`stop-${stop.id}`}
        kind={finish ? 'finish' : 'stop'}
        number={number}
        color={color}
        name={stop.name ?? 'Dropped pin'}
        subtitle={finish ? 'Finish' : 'Stop'}
        onPress={() => onStopPress(stop)}
      />
    );
  });

  // A drive that ends on an Iconic Road finishes at its far end.
  const last = drive.stops.at(-1);
  if (last.roadId) {
    const road = getRoad(last.roadId);
    rows.push(
      <EventRow key="finish" kind="finish" name={road ? `End of ${road.name}` : 'Finish'} subtitle="Finish" />
    );
  }
  return <View>{rows}</View>;
}

const makeStyles = (c) => ({
  event: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  leg: { flexDirection: 'row', alignItems: 'stretch', gap: 12, minHeight: 44 },
  rail: { width: RAIL_W, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 16, height: 16, borderRadius: 8 },
  ring: {
    width: RAIL_W,
    height: RAIL_W,
    borderRadius: RAIL_W / 2,
    borderWidth: 3,
    backgroundColor: c.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringNumber: { fontFamily: type.nav.fontFamily, fontSize: 11, lineHeight: 13 },
  bar: { width: 4, flex: 1, borderRadius: 2 },
  flex: { flex: 1, minWidth: 0 },
  text: { color: c.text },
  subtitle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  muted: { color: c.textMuted, flexShrink: 1 },
  regular: { fontFamily: type.body.fontFamily },
  legText: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
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
  pressed: { opacity: pressedOpacity },
});

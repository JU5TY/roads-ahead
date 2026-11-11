import { useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { pressedOpacity, type } from '../../theme';
import { getRoad } from '../../utils/iconicRoads';
import Button from '../ui/Button';
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

/** The drag handle: drag it up or down to move its stop (the gesture is the parent's). */
function Handle({ name, handlers }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    // Not flattened away on Android, so it gets its own touches.
    <View {...handlers} collapsable={false} style={styles.handle} accessibilityLabel={`Move ${name}`}>
      <Icon name="drag_indicator" size={22} color={c.textMuted} />
    </View>
  );
}

function EventRow({ kind, number, color, name, subtitle, linked, onPress, onChange, handlers }) {
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
      {onChange ? <Button label="Change" variant="text" size="small" onPress={onChange} /> : null}
      {handlers ? <Handle name={name} handlers={handlers} /> : null}
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
function LegRow({ color, road, text, onPress, handlers }) {
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
      {handlers ? <Handle name={road} handlers={handlers} /> : null}
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
 * One stop's rows, draggable by their handle (`handlers` go on it). While a
 * stop is dragged it follows the finger and the others slide out of its way
 * (`shift`); the timeline works out where it lands from the rows' heights.
 */
function Draggable({ index, shift, dragging, dy, handlers, onLayout, children }) {
  const styles = useStyles(makeStyles);
  return (
    <Animated.View
      onLayout={(e) => onLayout(index, e.nativeEvent.layout)}
      style={
        dragging ? [styles.dragging, { transform: [{ translateY: dy }] }] : { transform: [{ translateY: shift }] }
      }
    >
      {children(handlers)}
    </Animated.View>
  );
}

/**
 * One planned drive as a timeline, like the Trip page's: its start (a green
 * dot; linked when it's where the drive before ends) with Change, a numbered
 * ring per stop, an Iconic Road as a chip on the leg it's driven on, and the
 * last place as the red finish. Stops are dragged by their handle to reorder
 * them; tapping one opens its options. Leg distances come with leg routing.
 * `start` is driveStart(); onStopPress(stop), onStartPress(),
 * onMove(stop, position).
 */
export default function PlanTimeline({ drive, index, start, color, onStopPress, onStartPress, onMove }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const [layouts, setLayouts] = useState({}); // each stop's rows: { y, height }, by index
  const [dy] = useState(() => new Animated.Value(0));
  const [drag, setDrag] = useState(null); // { from, to, y0 } while a stop is dragged
  // A dropped stop stays where it was dropped until the saved order comes back.
  const [dropped, setDropped] = useState(null); // { before, order }
  const stops = dropped?.before === drive.stops ? dropped.order : drive.stops;

  const move = (pageY) => {
    if (!drag) return;
    const moved = pageY - drag.y0;
    dy.setValue(moved);
    const own = layouts[drag.from];
    if (!own) return;
    // Lands after every other stop whose middle it has passed.
    const middle = own.y + own.height / 2 + moved;
    let to = 0;
    for (let j = 0; j < stops.length; j += 1) {
      const l = layouts[j];
      if (j !== drag.from && l && l.y + l.height / 2 < middle) to += 1;
    }
    if (to !== drag.to) setDrag({ ...drag, to });
  };
  const end = () => {
    if (drag && drag.to !== drag.from) {
      const order = [...stops];
      const [moved] = order.splice(drag.from, 1);
      order.splice(drag.to, 0, moved);
      setDropped({ before: drive.stops, order });
      onMove(moved, drag.to);
    }
    setDrag(null);
  };
  // On a stop's handle: the drag is the handle's from the first touch, not the page's scrolling.
  const handlersFor = (i) => ({
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderGrant: (e) => {
      dy.setValue(0);
      setDrag({ from: i, to: i, y0: e.nativeEvent.pageY });
      return true; // and keeps the scroll view out of it
    },
    onResponderMove: (e) => move(e.nativeEvent.pageY),
    onResponderRelease: end,
    onResponderTerminate: end,
  });
  // How far stop j slides to make room while another is dragged.
  const shiftOf = (j) => {
    if (!drag || j === drag.from) return 0;
    const h = layouts[drag.from]?.height ?? 0;
    if (drag.from < drag.to && j > drag.from && j <= drag.to) return -h;
    if (drag.to < drag.from && j >= drag.to && j < drag.from) return h;
    return 0;
  };

  const startName = start?.name ?? 'Your location';
  const startSubtitle = start?.linked
    ? `End of drive ${index}`
    : start
      ? 'Start'
      : 'Wherever you are when you start';
  const startRow = (
    <EventRow
      kind="start"
      name={startName}
      subtitle={startSubtitle}
      linked={start?.linked}
      onChange={onStartPress}
    />
  );

  if (stops.length === 0) {
    return (
      <View>
        {startRow}
        <LegRow color={c.outline} text="No stops yet. Add where this drive goes" />
      </View>
    );
  }

  // Stops are numbered in order; the last place, unless a road follows it, is the finish.
  const lastPlace = stops.map((s) => !s.roadId).lastIndexOf(true);
  const numbers = [];
  for (let i = 0, n = 0; i < stops.length; i += 1) {
    const finish = i === stops.length - 1 && i === lastPlace;
    if (!stops[i].roadId && !finish) n += 1;
    numbers.push(finish ? null : n);
  }
  const unitRows = (stop, i, handlers) => {
    const road = stop.roadId ? getRoad(stop.roadId) : null;
    if (road) {
      return <LegRow color={color} road={road.name} onPress={() => onStopPress(stop)} handlers={handlers} />;
    }
    const finish = numbers[i] === null;
    return (
      <>
        {/* A leg leads into each place, unless an Iconic Road's leg already did. */}
        {stops[i - 1]?.roadId ? null : <LegRow color={color} />}
        <EventRow
          kind={finish ? 'finish' : 'stop'}
          number={numbers[i]}
          color={color}
          name={stop.name ?? 'Dropped pin'}
          subtitle={finish ? 'Finish' : 'Stop'}
          onPress={() => onStopPress(stop)}
          handlers={handlers}
        />
      </>
    );
  };

  // A drive that ends on an Iconic Road finishes at its far end.
  const last = stops.at(-1);
  const lastRoad = last.roadId ? getRoad(last.roadId) : null;

  return (
    <View>
      {startRow}
      <View style={styles.units}>
        {stops.map((stop, i) => (
          <Draggable
            key={stop.id}
            index={i}
            shift={shiftOf(i)}
            dragging={drag?.from === i}
            dy={dy}
            handlers={handlersFor(i)}
            onLayout={(j, layout) => setLayouts((l) => ({ ...l, [j]: layout }))}
          >
            {(handlers) => unitRows(stop, i, handlers)}
          </Draggable>
        ))}
      </View>
      {last.roadId ? (
        <EventRow kind="finish" name={lastRoad ? `End of ${lastRoad.name}` : 'Finish'} subtitle="Finish" />
      ) : null}
    </View>
  );
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
  handle: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  units: { position: 'relative' },
  // Lifted over the others while it's dragged.
  dragging: { zIndex: 1, elevation: 4, backgroundColor: c.background, ...c.cardShadow },
  pressed: { opacity: pressedOpacity },
});

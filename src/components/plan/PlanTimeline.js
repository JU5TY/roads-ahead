import { useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { pressedOpacity, type } from '../../theme';
import { getRoad } from '../../utils/iconicRoads';
import Button from '../ui/Button';
import Icon from '../ui/Icon';

const RAIL_W = 22;

/** Green start dot, a ring in the drive's colour for a stop, red finish dot (as on a trip). */
function Marker({ kind, color }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  if (kind === 'stop') return <View style={[styles.ring, { borderColor: color }]} />;
  return <View style={[styles.dot, { backgroundColor: kind === 'start' ? c.start : c.finish }]} />;
}

/** The drag handle: drag it up or down to move its stop (the gesture is the parent's). Blue while held. */
function Handle({ name, handlers, held }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    // Not flattened away on Android, so it gets its own touches.
    <View {...handlers} collapsable={false} style={styles.handle} accessibilityLabel={`Move ${name}`}>
      <Icon name="drag_indicator" size={22} color={held ? c.accent : c.textMuted} />
    </View>
  );
}

function EventRow({ kind, color, name, subtitle, linked, onPress, onChange, handlers, held }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const body = (
    <View style={styles.event}>
      <View style={styles.rail}>
        <Marker kind={kind} color={color} />
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
      {handlers ? <Handle name={name} handlers={handlers} held={held} /> : null}
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
 * Between two rows: the drive's bar, with an Iconic Road's chip when the leg
 * drives one, and a boat when it takes a ferry (its miles are on the road).
 */
function LegRow({ color, road, text, ferry, onPress, handlers, held }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const body = (
    <View style={styles.leg}>
      <View style={styles.rail}>
        <View style={[styles.bar, { backgroundColor: color }]} />
      </View>
      <View style={styles.legText}>
        {text && ferry ? <Icon name="directions_boat" size={16} color={c.textMuted} /> : null}
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
      {handlers ? <Handle name={road} handlers={handlers} held={held} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => pressed && styles.pressed}>
      {body}
    </Pressable>
  );
}

/** Between two days: the overnight break where you stay, as on a trip's timeline. */
export function OvernightRow({ place }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.leg}>
      <View style={styles.rail}>
        <View style={[styles.bar, { backgroundColor: c.outline }]} />
      </View>
      <View style={styles.legText}>
        <Icon name="bedtime" size={18} color={c.textMuted} />
        <Text style={[type.label, styles.muted, styles.regular]}>Overnight in {place}</Text>
      </View>
    </View>
  );
}

/**
 * One stop's rows, draggable by their handle (`handlers` go on it). While a
 * stop is dragged it follows the finger and the others slide out of its way
 * (`shift`); the timeline works out where it lands from the rows' heights.
 * It's lifted flat on the page's colour, so its leg reads as the line itself.
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
 * dot; linked when it's where the drive before ends) with Change, a ring per
 * stop, an Iconic Road as a chip on the leg it's driven on, and the
 * last place as the red finish. Stops are dragged by their handle to reorder
 * them; tapping one opens its options.
 * `start` is driveStart(); `legTexts` ("33 mi · 45m") and `ferryLegs` (a Set,
 * the legs taking a ferry) are by the id of the
 * stop each leg arrives at; onStopPress(stop), onStartPress(),
 * onMove(stop, position). `locked` (a copied ready-made route) leaves out the
 * handles and taps: nothing can be changed. A round trip's way back (the last
 * drive's final stop, `home`, from withWayBack) is its finish: onBackPress(). `numbered`
 * (a plan of more than one day) starts it on "Day 2 · Start", as a trip's days.
 */
export default function PlanTimeline({
  drive,
  index,
  start,
  color,
  legTexts = {},
  ferryLegs,
  onStopPress,
  onStartPress,
  onMove,
  onBackPress,
  numbered = false,
  locked = false,
}) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const [layouts, setLayouts] = useState({}); // each stop's rows: { y, height }, by index
  const [dy] = useState(() => new Animated.Value(0));
  const [drag, setDrag] = useState(null); // { from, to, y0 } while a stop is dragged
  // A dropped stop stays where it was dropped until the saved order comes back.
  const [dropped, setDropped] = useState(null); // { before, order }
  // The way back stays at the end: it isn't dragged, and nothing is dragged past it.
  const home = drive.stops.at(-1)?.home ? drive.stops.at(-1) : null;
  const placed = home ? drive.stops.slice(0, -1) : drive.stops;
  const stops = dropped?.before === drive.stops ? dropped.order : placed;
  // Distances are left off while a stop moves, and until the moved drive is routed again.
  const texts = drag || dropped?.before === drive.stops ? {} : legTexts;

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
  const startSubtitle = numbered ? `Day ${index + 1} · Start` : 'Start';
  const startRow = (
    <EventRow
      kind="start"
      name={startName}
      subtitle={startSubtitle}
      onChange={onStartPress}
    />
  );

  if (stops.length === 0 && !home) {
    return (
      <View>
        {startRow}
        <LegRow color={c.outline} text="No stops yet. Add where this day goes" />
      </View>
    );
  }

  // The last place is the finish, unless an Iconic Road comes after it.
  const lastPlace = stops.map((s) => !s.roadId).lastIndexOf(true);
  const unitRows = (stop, i, dragHandlers) => {
    const handlers = locked ? undefined : dragHandlers;
    const onPress = locked ? undefined : () => onStopPress(stop);
    const road = stop.roadId ? getRoad(stop.roadId) : null;
    if (road) {
      // A road shows the leg to the place after it (or to its own end, last).
      const next = stops[i + 1] ?? home;
      const legId = next && !next.roadId ? next.id : stop.id;
      const text = texts[legId];
      return (
        <LegRow
          color={color}
          road={road.name}
          text={text}
          ferry={ferryLegs?.has(legId)}
          onPress={onPress}
          handlers={handlers}
          held={drag?.from === i}
        />
      );
    }
    const finish = !home && i === stops.length - 1 && i === lastPlace;
    return (
      <>
        {/* A leg leads into each place, unless an Iconic Road's leg already did. */}
        {stops[i - 1]?.roadId ? null : (
          <LegRow color={color} text={texts[stop.id]} ferry={ferryLegs?.has(stop.id)} />
        )}
        <EventRow
          kind={finish ? 'finish' : 'stop'}
          color={color}
          name={stop.name ?? 'Dropped pin'}
          subtitle={finish ? 'Finish' : 'Stop'}
          onPress={onPress}
          handlers={handlers}
          held={drag?.from === i}
        />
      </>
    );
  };

  // A drive that ends on an Iconic Road finishes at its far end.
  const last = stops.at(-1);
  const lastRoad = last?.roadId ? getRoad(last.roadId) : null;

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
      {home ? (
        <>
          {/* An Iconic Road's leg already leads into it. */}
          {last?.roadId ? null : <LegRow color={color} text={texts[home.id]} ferry={ferryLegs?.has(home.id)} />}
          <EventRow
            kind="finish"
            name={home.name}
            subtitle="Back to the start"
            linked
            onPress={locked ? undefined : onBackPress}
          />
        </>
      ) : last.roadId ? (
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
  ring: { width: 16, height: 16, borderRadius: 8, borderWidth: 3, backgroundColor: c.background },
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
  // Over the others while it's dragged, with no shadow: only the stop looks like it moves.
  dragging: { zIndex: 1, backgroundColor: c.background },
  pressed: { opacity: pressedOpacity },
});

import { useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { pressedOpacity, type } from '../../theme';
import { getRoad } from '../../utils/iconicRoads';
import { regroupDays } from '../../utils/plans';
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
 * A plan as a timeline, like the Trip page's: one day (its tab), or the whole
 * route (All: `days` of them). A day starts on a green dot ("Day 2 · Start",
 * with Change); its stops are rings and an Iconic Road a chip on the leg it's
 * driven on. Every day but the last ends where you stay (a red Finish), then
 * the overnight break and the next day's start; the last day ends at its last
 * place, or at the way back (`home`, from withWayBack: onBackPress()).
 * `days`: [{ index, start (driveStart), stops (as on the map), last }].
 * Stops are dragged by their handle. On All a stay drags too, taking its night
 * with it, and a stop dragged past a stay moves into the other day; on a day's
 * tab its stay is pinned as the day's end. onArrange(each shown day's stop ids,
 * from regroupDays) after a drop. `legTexts` ("33 mi · 45m") and `ferryLegs` (a
 * Set) are by the id of the stop each leg arrives at; onStopPress(stop, day),
 * onStartPress(day), colorOf(day), by day index. `numbered` (a plan of more
 * than one day) labels starts "Day 2 · Start". `locked` (a copied ready-made
 * route) leaves out the handles and taps: nothing can be changed.
 */
export default function PlanTimeline({
  days,
  colorOf,
  legTexts = {},
  ferryLegs,
  onStopPress,
  onStartPress,
  onArrange,
  onBackPress,
  numbered = false,
  locked = false,
}) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const [layouts, setLayouts] = useState({}); // each unit's rows: { y, height }, by index
  const [dy] = useState(() => new Animated.Value(0));
  const [drag, setDrag] = useState(null); // { from, to, y0 } while a stop is dragged
  // A dropped stop stays where it was dropped until the saved order comes back.
  const [dropped, setDropped] = useState(null); // { key, units }
  const route = days.length > 1;
  const lastDay = days.at(-1);
  // The way back stays at the end: it isn't dragged, and nothing is dragged past it.
  const home = lastDay.stops.at(-1)?.home ? lastDay.stops.at(-1) : null;
  const ownStops = (d) => d.stops.filter((s) => !s.home);
  // Every stop in route order, with its day and whether it's where that day ends (its stay).
  const unitsOf = (groups) =>
    groups.flatMap((stops, k) =>
      stops.map((stop, i) => ({ stop, day: days[k].index, stay: !days[k].last && i === stops.length - 1 }))
    );
  const fresh = unitsOf(days.map(ownStops));
  const key = fresh.map((u) => u.stop.id).join(',');
  const units = dropped?.key === key ? dropped.units : fresh;
  // On a day's tab, its stay is its end: not dragged, and nothing dragged below it.
  const pinned = !route && units.at(-1)?.stay;
  const maxTo = pinned ? units.length - 2 : units.length - 1;
  // Distances are left off while a stop moves, and until the moved route is routed again.
  const texts = drag || dropped?.key === key ? {} : legTexts;

  const move = (pageY) => {
    if (!drag) return;
    const moved = pageY - drag.y0;
    dy.setValue(moved);
    const own = layouts[drag.from];
    if (!own) return;
    // Lands after every other stop whose middle it has passed.
    const middle = own.y + own.height / 2 + moved;
    let to = 0;
    for (let j = 0; j < units.length; j += 1) {
      const l = layouts[j];
      if (j !== drag.from && l && l.y + l.height / 2 < middle) to += 1;
    }
    to = Math.min(to, maxTo);
    if (to !== drag.to) setDrag({ ...drag, to });
  };
  const end = () => {
    if (drag && drag.to !== drag.from) {
      const order = units.map((u) => u.stop);
      const [moved] = order.splice(drag.from, 1);
      order.splice(drag.to, 0, moved);
      // The days re-form around their stays (a lone day just takes the new order).
      const ids = order.map((s) => s.id);
      const groups = route ? regroupDays(days.map((d) => ownStops(d).map((s) => s.id)), ids) : [ids];
      const byId = new Map(order.map((s) => [s.id, s]));
      setDropped({ key, units: unitsOf(groups.map((g) => g.map((id) => byId.get(id)))) });
      onArrange(groups);
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
  // How far unit j slides to make room while another is dragged.
  const shiftOf = (j) => {
    if (!drag || j === drag.from) return 0;
    const h = layouts[drag.from]?.height ?? 0;
    if (drag.from < drag.to && j > drag.from && j <= drag.to) return -h;
    if (drag.to < drag.from && j >= drag.to && j < drag.from) return h;
    return 0;
  };

  const startRow = (d) => (
    <EventRow
      key={`start-${d.index}`}
      kind="start"
      name={d.start?.name ?? 'Your location'}
      subtitle={numbered ? `Day ${d.index + 1} · Start` : 'Start'}
      onChange={locked || !onStartPress ? undefined : () => onStartPress(d.index)}
    />
  );
  const noStops = (k) => <LegRow key={`none-${k}`} color={c.outline} text="No stops yet. Add where this day goes" />;
  // After a stay (or an empty day): the night, then the next day's start; on
  // through any days with no stops, to the next one that goes somewhere.
  const nightsAfter = (p, place) => {
    const rows = [];
    for (let q = p; q + 1 < days.length; q += 1) {
      const next = days[q + 1];
      rows.push(<OvernightRow key={`night-${next.index}`} place={place} />, startRow(next));
      if (ownStops(next).length) break;
      rows.push(noStops(next.index));
      place = next.start?.name ?? 'Dropped pin';
    }
    return rows;
  };
  const posOf = (day) => days.findIndex((d) => d.index === day);

  const unitRows = (u, i, dragHandlers) => {
    const { stop, day, stay } = u;
    const color = colorOf(day);
    const handlers = locked || (pinned && i === units.length - 1) ? undefined : dragHandlers;
    const onPress = locked ? undefined : () => onStopPress(stop, day);
    const prev = units[i - 1];
    const next = units[i + 1];
    const night = route && stay ? nightsAfter(posOf(day), stop.roadId ? getRoad(stop.roadId)?.name : stop.name) : null;
    const road = stop.roadId ? getRoad(stop.roadId) : null;
    if (road) {
      // A road shows the leg to the place after it in its day (or to its own end, last).
      const after = next && next.day === day ? next.stop : !stay && i === units.length - 1 ? home : null;
      const legId = after && !after.roadId ? after.id : stop.id;
      return (
        <>
          <LegRow
            color={color}
            road={road.name}
            text={texts[legId]}
            ferry={ferryLegs?.has(legId)}
            onPress={onPress}
            handlers={handlers}
            held={drag?.from === i}
          />
          {stay ? <EventRow kind="finish" name={`End of ${road.name}`} subtitle="Finish" /> : null}
          {night}
        </>
      );
    }
    const finish = stay || (!home && i === units.length - 1);
    return (
      <>
        {/* A leg leads into each place, unless an Iconic Road's leg in its day already did. */}
        {prev?.stop.roadId && prev.day === day && !prev.stay ? null : (
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
        {night}
      </>
    );
  };

  const first = days[0];
  const last = units.at(-1);
  const lastColor = colorOf(lastDay.index);
  const lastRoad = last && last.stop.roadId && !last.stay ? getRoad(last.stop.roadId) : null;

  return (
    <View>
      {startRow(first)}
      {ownStops(first).length ? null : [noStops(first.index), ...(route ? nightsAfter(0, first.start?.name ?? 'Dropped pin') : [])]}
      <View style={styles.units}>
        {units.map((u, i) => (
          <Draggable
            key={u.stop.id}
            index={i}
            shift={shiftOf(i)}
            dragging={drag?.from === i}
            dy={dy}
            handlers={handlersFor(i)}
            onLayout={(j, layout) => setLayouts((l) => ({ ...l, [j]: layout }))}
          >
            {(handlers) => unitRows(u, i, handlers)}
          </Draggable>
        ))}
      </View>
      {home ? (
        <>
          {/* An Iconic Road's leg already leads into it. */}
          {lastRoad ? null : <LegRow color={lastColor} text={texts[home.id]} ferry={ferryLegs?.has(home.id)} />}
          <EventRow
            kind="finish"
            name={home.name}
            subtitle="Back to the start"
            linked
            onPress={locked ? undefined : onBackPress}
          />
        </>
      ) : lastRoad ? (
        <EventRow kind="finish" name={`End of ${lastRoad.name}`} subtitle="Finish" />
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

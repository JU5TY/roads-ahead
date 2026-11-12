import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { pressedOpacity, type } from '../../theme';
import { formatDistance, formatDurationShort, formatTime } from '../../utils/format';
import PhotoGallery from '../photos/PhotoGallery';
import PhotoThumb from '../photos/PhotoThumb';
import Icon from '../ui/Icon';
import SectionHeader from '../ui/SectionHeader';

const TIME_W = 44;
const RAIL_W = 20;
/** Photos taken this long before or after a rest stop still belong to it. */
const PHOTO_SLACK_MS = 2 * 60 * 1000;
const PHOTO_SIZE = 64;
const MAX_STOP_PHOTOS = 4;

/** Start (green dot), rest stop (ring in the route colour), border (flag) or finish (red dot). */
function Marker({ kind, color }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  if (kind === 'crossing') return <Icon name="flag" filled size={20} color={c.accent} />;
  if (kind === 'stop') return <View style={[styles.ring, { borderColor: color }]} />;
  return <View style={[styles.dot, { backgroundColor: kind === 'start' ? c.start : c.finish }]} />;
}

function EventRow({ item, color, onPress, onDriveOptions, hideTimes }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const isStop = item.type === 'stop';
  const isCrossing = item.type === 'crossing';
  const title = isCrossing
    ? `Crossed into ${item.country}`
    : item.place ||
      (item.type === 'start' ? 'Start' : item.type === 'finish' ? 'Finish' : 'Rest stop');
  const subtitle = isCrossing
    ? `${item.from} → ${item.country}`
    : isStop
      ? hideTimes
        ? 'Rest stop'
        : `Rest stop · ${formatDurationShort(item.endTime - item.time)}`
      : item.type === 'start'
        ? item.dayNumber
          ? `Day ${item.dayNumber} · Start`
          : 'Start'
        : 'Finish';

  const body = (
    <View style={styles.event}>
      {hideTimes ? null : <Text style={[type.small, styles.time]}>{formatTime(item.time)}</Text>}
      <View style={styles.rail}>
        <Marker kind={item.type} color={color} />
      </View>
      <View style={styles.flex}>
        <Text style={[type.bodyStrong, styles.title]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[type.small, styles.muted]}>{subtitle}</Text>
      </View>
      {item.type === 'start' && item.driveId && onDriveOptions ? (
        <Pressable
          onPress={() => onDriveOptions(item.driveId)}
          accessibilityRole="button"
          accessibilityLabel="Drive options"
          hitSlop={4}
          style={({ pressed }) => [styles.options, pressed && styles.pressed]}
        >
          <Icon name="more_vert" size={24} color={c.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );

  if (!isStop || !onPress) return body;
  return (
    <Pressable
      onPress={() => onPress(item)}
      style={({ pressed }) => pressed && styles.pressed}
      accessibilityRole="button"
      accessibilityHint="Shows this stop on the map"
    >
      {body}
    </Pressable>
  );
}

const GAP_ICONS = { leg: 'directions_car', break: 'schedule', overnight: 'bedtime' };
// Ferries, tunnels and pauses (seaCrossing items): [icon, name].
const SEA = {
  ferry: ['directions_boat', 'Ferry'],
  tunnel: ['train', 'Tunnel'],
  pause: ['pause', 'Paused'],
};

/**
 * Between events: a driving leg (solid bar), a ferry, tunnel or pause (dotted,
 * not counted as driving), a break or an overnight (faint bar).
 */
function GapRow({ item, color, units, hideTimes, roads = [] }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const isLeg = item.type === 'leg';
  const isSea = item.type === 'seaCrossing';
  const [seaIcon, seaName] = isSea ? SEA[item.kind] : [];
  const icon = isSea ? seaIcon : GAP_ICONS[item.type];
  const duration = hideTimes ? '' : ` · ${formatDurationShort(item.durationMs)}`;
  // A pause's distance is just the gap between two fixes, so it isn't shown.
  const seaDistance = item.kind === 'pause' ? '' : ` · ${formatDistance(item.distanceM, units)}`;
  const text = isLeg
    ? `${formatDistance(item.distanceM, units)}${duration}`
    : isSea
      ? `${seaName}${seaDistance}${duration}`
      : item.type === 'break'
        ? `Break${duration}`
        : `Overnight${item.place ? ` in ${item.place}` : ''}${duration}`;

  return (
    <View style={styles.gap}>
      {hideTimes ? null : <View style={styles.timeSpacer} />}
      <View style={styles.rail}>
        {isSea ? (
          <View style={styles.dots}>
            {[0, 1, 2, 3].map((k) => (
              <View key={k} style={[styles.railDot, { backgroundColor: color }]} />
            ))}
          </View>
        ) : (
          <View style={[styles.bar, { backgroundColor: isLeg ? color : c.outline }]} />
        )}
      </View>
      <View style={styles.gapText}>
        <Icon name={icon} size={18} color={c.textMuted} />
        <Text style={[type.label, styles.muted, styles.regular]} numberOfLines={1}>
          {text}
        </Text>
        {roads.map((name) => (
          <View key={name} style={styles.roadChip}>
            <Icon name="verified" size={14} color={c.onRoadContainer} />
            <Text style={[type.nav, styles.roadChipText]} numberOfLines={1}>
              {name}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Thumbnails under a rest stop, lined up with its text; "+N" on the last when there are more. */
function PhotoRow({ photos, hideTimes, onPress }) {
  const styles = useStyles(makeStyles);
  const shown = photos.slice(0, MAX_STOP_PHOTOS);
  const more = photos.length - shown.length;
  return (
    <View style={[styles.photos, { marginLeft: (hideTimes ? 0 : TIME_W + 12) + RAIL_W + 12 }]}>
      {shown.map((photo, i) => (
        <PhotoThumb key={photo.id} photo={photo} size={PHOTO_SIZE} onPress={() => onPress(photo)}>
          {i === shown.length - 1 && more > 0 ? (
            <View style={styles.more}>
              <Text style={[type.bodyStrong, styles.moreText]}>+{more}</Text>
            </View>
          ) : null}
        </PhotoThumb>
      ))}
    </View>
  );
}

/** Names of the roads completed during the leg at `i`: between the events either side of it. */
function roadsOnLeg(items, i, roads) {
  const before = items[i - 1];
  const after = items[i + 1];
  if (!before || !after) return [];
  const from = before.endTime ?? before.time;
  const names = roads
    .filter((r) => r.completedAt > from && r.completedAt <= after.time + 60000)
    .map((r) => r.name);
  return [...new Set(names)];
}

/**
 * "Timeline" section: start, driving legs, rest stops, border crossings and finish (items from
 * utils/timeline.js), drawn in the route colour. onStopPress(item) on a stop.
 * `roads` ([{ name, completedAt }]) puts an Iconic Road chip on the leg it was
 * completed on; `hideTimes` drops clock times and durations. `photos` (from
 * usePhotos) puts the ones taken at a rest stop under it. `colorOfDay(n)`
 * colours a trip timeline's items by their day instead of `color`.
 * `onDriveOptions(driveId)` puts a ⋮ on each drive's Start row, for that
 * drive's own actions (move, link, delete), now that the tabs are days.
 */
export default function Timeline({
  items,
  color,
  units,
  onStopPress,
  roads = [],
  hideTimes = false,
  photos = [],
  colorOfDay,
  onDriveOptions,
}) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const [viewing, setViewing] = useState(null); // index into `photos`
  const isGap = (item) => ['leg', 'seaCrossing', 'break', 'overnight'].includes(item.type);
  const photosAt = (item) =>
    item.type === 'stop'
      ? photos.filter(
          (p) => p.time >= item.time - PHOTO_SLACK_MS && p.time <= item.endTime + PHOTO_SLACK_MS
        )
      : [];
  const anyPhotos = items.some((item) => photosAt(item).length > 0);
  return (
    <View>
      <SectionHeader title="Timeline" />
      {anyPhotos ? (
        <View style={styles.photoNote}>
          <Icon name="photo_library" size={16} color={c.textMuted} />
          <Text style={[type.small, styles.muted]}>Photos from your gallery, matched by time</Text>
        </View>
      ) : null}
      <PhotoGallery
        visible={viewing !== null}
        photos={photos}
        startIndex={viewing}
        onClose={() => setViewing(null)}
        hideTimes={hideTimes}
      />
      {items.flatMap((item, i) => {
        const row = isGap(item) ? (
          <GapRow
            key={`${item.type}-${i}`}
            item={item}
            color={colorOfDay && item.day ? colorOfDay(item.day) : color}
            units={units}
            hideTimes={hideTimes}
            roads={item.type === 'leg' ? roadsOnLeg(items, i, roads) : []}
          />
        ) : (
          <EventRow
            key={`${item.type}-${i}`}
            item={item}
            color={colorOfDay && item.day ? colorOfDay(item.day) : color}
            onPress={onStopPress}
            onDriveOptions={onDriveOptions}
            hideTimes={hideTimes}
          />
        );
        const atStop = photosAt(item);
        return atStop.length
          ? [
              row,
              <PhotoRow
                key={`photos-${i}`}
                photos={atStop}
                hideTimes={hideTimes}
                onPress={(photo) => setViewing(photos.indexOf(photo))}
              />,
            ]
          : [row];
      })}
    </View>
  );
}

const makeStyles = (c) => ({
  regular: { fontFamily: type.body.fontFamily },
  event: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  gap: { flexDirection: 'row', alignItems: 'stretch', gap: 12, minHeight: 44 },
  time: { width: TIME_W, textAlign: 'right', color: c.textMuted },
  timeSpacer: { width: TIME_W },
  rail: { width: RAIL_W, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 16, height: 16, borderRadius: 8 },
  ring: { width: 16, height: 16, borderRadius: 8, borderWidth: 3, backgroundColor: c.background },
  bar: { width: 4, flex: 1, borderRadius: 2 },
  dots: { flex: 1, justifyContent: 'space-evenly' },
  railDot: { width: 4, height: 4, borderRadius: 2 },
  flex: { flex: 1, minWidth: 0 },
  options: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { color: c.text },
  muted: { color: c.textMuted, flexShrink: 1 },
  gapText: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
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
  photoNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 4,
    marginTop: -4,
    marginBottom: 12,
  },
  photos: { flexDirection: 'row', gap: 6, paddingTop: 2, paddingBottom: 10 },
  more: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.photoScrim,
  },
  moreText: { color: c.onPhoto },
  pressed: { opacity: pressedOpacity },
});

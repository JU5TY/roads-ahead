import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView, useKeyboardState } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import RouteMap from '../components/RouteMap';
import Icon from '../components/ui/Icon';
import IconButton from '../components/ui/IconButton';
import SectionHeader from '../components/ui/SectionHeader';
import { useSettings } from '../context/SettingsContext';
import { useHere } from '../hooks/useHere';
import { useSavedLines } from '../hooks/usePlanRoutes';
import { useStyles, useTheme } from '../hooks/useTheme';
import { MIN_SEARCH_LENGTH, SEARCH_CREDIT, searchPlaces } from '../services/placeSearch';
import { pinName } from '../services/placeService';
import { addPlanStop, getPlan, setPlanDriveStart } from '../storage/planStorage';
import { dayColorFor, pressedOpacity, radius, spacing, type } from '../theme';
import { formatDistance } from '../utils/format';
import { roadPlace } from '../utils/iconicRoads';
import {
  addPosition,
  driveMarkers,
  driveReach,
  driveStart,
  mapPlanOf,
  planOutline,
  roadStop,
  roadsNear,
} from '../utils/plans';

const MAP_HEIGHT = 300;
const MAP_HEIGHT_TYPING = 140; // while the keyboard is up, so the results have room
const SEARCH_DELAY_MS = 400; // wait for a pause in typing before asking
// Where the map opens with nowhere planned and no location: all of Britain.
const BRITAIN = { latitude: 54.6, longitude: -3.4, latitudeDelta: 9, longitudeDelta: 9 };

/** A row of the list: a round icon well, name and grey detail, and an add button or a note. */
function PlaceRow({ icon, well, ink, name, detail, addLabel, note, onAdd }) {
  const styles = useStyles(makeStyles);
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onAdd}
      disabled={!onAdd}
      accessibilityRole="button"
      accessibilityLabel={addLabel}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[styles.well, { backgroundColor: well }]}>
        <Icon name={icon} size={20} color={ink} filled={icon === 'keep'} />
      </View>
      <View style={styles.rowText}>
        <Text style={[type.bodyStrong, styles.text]} numberOfLines={1}>
          {name}
        </Text>
        {detail ? (
          <Text style={[type.small, styles.muted]} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      {note ? <Text style={[type.label, styles.muted]}>{note}</Text> : null}
      {onAdd ? (
        <View style={styles.add}>
          <Icon name="add" size={22} color={c.accent} />
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * Add a stop to a planned drive, or (`mode` "start") pick where it starts: a
 * place from search, or a pin dropped by long-pressing the map, named by the
 * phone. Adding a stop also offers Iconic Roads near the drive. Params: `plan`
 * (id), `drive` (index from 0), `mode`.
 */
export default function AddStopScreen() {
  const params = useLocalSearchParams();
  const planId = Number(params.plan);
  const index = Number(params.drive);
  const forStart = params.mode === 'start';
  const { c } = useTheme();
  const { units } = useSettings();
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const typing = useKeyboardState((s) => s.isVisible);
  const [plan, setPlan] = useState(null);
  const { here, ready } = useHere();
  const [text, setText] = useState('');
  // The last answer, for the text it was for: { text, status: 'done' | 'failed', places }.
  const [search, setSearch] = useState({ text: '', status: 'done', places: [] });
  const [pin, setPin] = useState(null); // { latitude, longitude, name, naming }
  const saving = useRef(false);

  useEffect(() => {
    getPlan(planId)
      .then((p) => (p ? setPlan(p) : router.back()))
      .catch((err) => console.warn('[plan] load failed', err));
  }, [planId]);

  // The map as the plan's: Drive 1 from where it set off or the phone, a round trip's way back.
  const mapPlan = useMemo(() => (plan ? mapPlanOf(plan, here) : null), [plan, here]);
  const outline = useMemo(() => (mapPlan ? planOutline(mapPlan) : []), [mapPlan]);
  const nothingYet = plan != null && outline.every((d) => d.coordinates.length === 0);
  const lines = useSavedLines(mapPlan);

  // With nothing planned yet and no location, the map opens on Britain.
  const region = here ? { ...here, latitudeDelta: 0.5, longitudeDelta: 0.5 } : BRITAIN;

  // Search near where the drive has got to (for a start, where it is now).
  const near = useMemo(() => {
    if (!plan) return null;
    const from = forStart ? driveStart(plan, index) : driveReach(plan, index);
    return from ?? driveStart(plan, index) ?? pin ?? here;
  }, [plan, index, forStart, pin, here]);

  // Asks once typing pauses; a newer search cancels the one before.
  useEffect(() => {
    if (text.trim().length < MIN_SEARCH_LENGTH) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const result = await searchPlaces(text, { near, signal: controller.signal });
      if (result.cancelled) return;
      setSearch(
        result.failed ? { text, status: 'failed', places: [] } : { text, status: 'done', places: result.places }
      );
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `near` only steers the results, so moving it doesn't search again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  if (!plan) return <View style={styles.screen} />;
  const drive = plan.drives[index];
  if (!drive) return <View style={styles.screen} />;
  const driveName = `Day ${index + 1}`;
  const color = dayColorFor(c, index + 1);

  const dropPin = (coordinate) => {
    const dropped = { latitude: coordinate.latitude, longitude: coordinate.longitude, name: null, naming: true };
    setPin(dropped);
    pinName(dropped).then((name) =>
      // Unless another pin has been dropped since.
      setPin((p) =>
        p?.latitude === dropped.latitude && p?.longitude === dropped.longitude ? { ...p, name, naming: false } : p
      )
    );
  };

  const save = (fn) => {
    if (saving.current) return;
    saving.current = true;
    fn()
      .then(() => router.back())
      .catch((err) => {
        saving.current = false;
        console.warn('[plan] add failed', err);
      });
  };
  const choose = ({ name, latitude, longitude }, source) =>
    save(() =>
      forStart
        ? setPlanDriveStart(drive.id, { name: name ?? 'Dropped pin', latitude, longitude })
        : addPlanStop(drive.id, { name, latitude, longitude, source }, addPosition(plan, index))
    );
  const addLabel = (name) => (forStart ? `Start ${driveName} at ${name}` : `Add ${name} to ${driveName}`);

  const roads = forStart ? [] : roadsNear(plan, index);
  const markers = [
    ...driveMarkers(mapPlan, index).map((m) => ({ ...m, color })),
    ...(pin ? [{ key: 'pin', kind: 'finish', coordinate: pin, title: pin.name ?? 'Dropped pin', color: c.finish }] : []),
  ];
  const pickedCoords = outline[index]?.coordinates ?? [];
  const mapHeight = (typing ? MAP_HEIGHT_TYPING : MAP_HEIGHT) + insets.top;

  // Too short to search shows nothing; while a newer answer is on its way, the last one stays.
  const asked = text.trim().length >= MIN_SEARCH_LENGTH;
  const places = asked ? search.places : [];
  const waiting = asked && search.text !== text;
  let status = null;
  if (waiting && places.length === 0) status = 'Searching…';
  else if (asked && !waiting && search.status === 'failed')
    status = "Search isn't working right now. Long-press the map to drop a pin instead.";
  else if (asked && !waiting && places.length === 0)
    status = 'No places found. Try another name, or long-press the map to drop a pin.';

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.screen}>
      <View style={[styles.map, { height: mapHeight }]}>
        {!ready ? null : (
          <RouteMap
            flat
            segments={outline.map(({ index: i, coordinates }) => ({
              key: `drive-${i}`,
              // Along the roads when the plan's map has saved its line, else straight.
              coordinates: lines[i] ?? coordinates,
              color: i === index ? color : `${dayColorFor(c, i + 1)}40`,
              dotted: !lines[i],
            }))}
            fitTo={pickedCoords.length > 1 ? pickedCoords : undefined}
            region={nothingYet ? region : undefined}
            markers={markers}
            onLongPress={dropPin}
          />
        )}
        <IconButton
          icon="arrow_back"
          variant="floating"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={[styles.back, { top: insets.top + 12 }]}
        />
        <View style={[styles.hintRow, { top: insets.top + 20 }]} pointerEvents="none">
          <View style={styles.hint}>
            <Text style={[type.label, styles.text]} numberOfLines={1}>
              Hold to drop a pin
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.panel}
        contentContainerStyle={[styles.panelContent, { paddingBottom: spacing.xl + (typing ? 0 : insets.bottom) }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>{forStart ? `Where ${driveName} starts` : 'Search for a place'}</Text>
        <View style={styles.search}>
          <Icon name="search" size={22} color={c.textMuted} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Town, village or place"
            placeholderTextColor={c.textMuted}
            style={styles.input}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search for a place"
          />
          {text ? (
            <IconButton icon="close" variant="plain" size={40} iconSize={20} accessibilityLabel="Clear" onPress={() => setText('')} />
          ) : null}
        </View>

        <View style={styles.list}>
          {pin ? (
            <PlaceRow
              icon="keep"
              well={c.dangerContainer}
              ink={c.danger}
              name={pin.name ?? 'Dropped pin'}
              detail={pin.naming ? 'Dropped pin · finding its name…' : 'Dropped pin'}
              addLabel={addLabel(pin.name ?? 'the dropped pin')}
              onAdd={pin.naming ? undefined : () => choose(pin, 'pin')}
            />
          ) : null}
          {places.map((p) => (
            <PlaceRow
              key={p.id}
              icon="location_on"
              well={c.track}
              ink={c.text}
              name={p.name}
              detail={p.detail}
              addLabel={addLabel(p.name)}
              onAdd={() => choose(p, 'search')}
            />
          ))}
        </View>
        {status ? <Text style={[type.bodySmall, styles.muted, styles.status]}>{status}</Text> : null}
        {places.length > 0 ? <Text style={[type.small, styles.muted, styles.credit]}>{SEARCH_CREDIT}</Text> : null}

        {roads.length > 0 ? (
          <>
            <SectionHeader title={`Iconic Roads near ${driveName}`} style={styles.roadsHeader} />
            <View style={styles.list}>
              {roads.map(({ road, metres, inPlan }) => (
                <PlaceRow
                  key={road.id}
                  icon="verified"
                  well={c.roadContainer}
                  ink={c.onRoadContainer}
                  name={road.name}
                  detail={`${roadPlace(road)} · ${formatDistance(metres, units, 0)} away`}
                  note={inPlan ? 'In plan' : null}
                  addLabel={addLabel(road.name)}
                  onAdd={
                    inPlan
                      ? undefined
                      : () => save(() => addPlanStop(drive.id, roadStop(plan, index, road), addPosition(plan, index)))
                  }
                />
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  map: { backgroundColor: c.mapLand },
  back: { position: 'absolute', left: 12 },
  // Centred, and never under the Back button (12 + 48 + 12 from each edge).
  hintRow: { position: 'absolute', left: 72, right: 72, alignItems: 'center' },
  hint: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: c.floating,
    ...c.cardShadow,
  },
  panel: { flex: 1 },
  panelContent: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  label: { ...type.label, color: c.textMuted, marginBottom: 6 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingLeft: spacing.md,
    paddingRight: 4,
    borderRadius: radius.card,
    backgroundColor: c.card,
  },
  input: { ...type.bodyLarge, flex: 1, color: c.text, paddingVertical: 12 },
  list: { marginTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 6 },
  well: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0 },
  add: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: { marginTop: spacing.sm },
  credit: { marginTop: spacing.sm },
  roadsHeader: { marginTop: spacing.lg },
  text: { color: c.text },
  muted: { color: c.textMuted },
  pressed: { opacity: pressedOpacity },
});

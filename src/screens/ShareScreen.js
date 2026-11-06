import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  PixelRatio,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polyline } from 'react-native-svg';

import PhotoThumb from '../components/photos/PhotoThumb';
import ShareCard from '../components/share/ShareCard';
import Button from '../components/ui/Button';
import Icon from '../components/ui/Icon';
import IconButton from '../components/ui/IconButton';
import PremiumTag from '../components/ui/PremiumTag';
import { useSettings } from '../context/SettingsContext';
import { usePhotoCrop } from '../hooks/usePhotoCrop';
import { usePhotos } from '../hooks/usePhotos';
import { useStyles, useTheme } from '../hooks/useTheme';
import { useTripPreview } from '../hooks/useTripPreview';
import { shareCardImage } from '../services/shareService';
import { getTrip } from '../storage/tripStorage';
import { listVehicles } from '../storage/vehicleStorage';
import { pressedOpacity, spacing, type } from '../theme';
import { CENTRED, fitCrop } from '../utils/photoCrop';
import { fitInBox } from '../utils/routeOutline';
import { shareCardContent } from '../utils/shareCard';

const THUMB_W = 64;
const THUMB_H = 80;
// A long drive's shape stays true at the shared image's size.
const CARD_POINTS = 1200;
const CAPTURE_WIDTH = 1080 / PixelRatio.get(); // 1080 pixels wide once captured
// Width / height of the card (see ShareCard).
const FORMATS = [
  { id: 'post', label: 'Post', ratio: 4 / 5 },
  { id: 'story', label: 'Story', ratio: 9 / 16 },
];
// Everything above and below the preview, safe areas aside: it takes what's left.
const AROUND_PREVIEW = 358;
const MIN_PREVIEW_WIDTH = 200;

/** The Route choice: a small drawing of the route on the card's blue. */
function RouteTile({ segments, selected, onPress }) {
  const styles = useStyles(makeStyles);
  const routes = (segments ?? []).map((s) => s.coordinates).filter((r) => r.length > 1);
  const fit = fitInBox(routes, THUMB_W, THUMB_H, 10);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Route background"
      accessibilityState={{ selected }}
      style={[styles.tile, styles.routeTile, selected && styles.tileSelected]}
    >
      <Svg width={THUMB_W} height={THUMB_H} accessible={false}>
        {fit
          ? routes.map((r, i) => (
              <Polyline key={i} points={fit.points(r)} fill="none" stroke="#FFFFFF" strokeWidth={2} />
            ))
          : null}
      </Svg>
    </Pressable>
  );
}

/**
 * Share a trip or one of its drives as an image: a preview of the card, a choice
 * of background, and Share. Params: `trip`, and `drive` for one drive of a longer trip.
 */
export default function ShareScreen() {
  const { trip: tripParam, drive: driveParam } = useLocalSearchParams();
  const { units } = useSettings();
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const captureRef = useRef(null);
  const [trip, setTrip] = useState(null);
  const [vehicles, setVehicles] = useState([]); // the Garage
  const [format, setFormat] = useState('post');
  const [photoUri, setPhotoUri] = useState(null);
  const [loadedUri, setLoadedUri] = useState(null); // the photo the captured card has drawn
  const [crops, setCrops] = useState({}); // the photo's framing in each format
  const [framed, setFramed] = useState(false); // they've moved a photo, so know they can

  useEffect(() => {
    let cancelled = false;
    // A Garage that won't load only leaves the vehicle off the card.
    Promise.all([getTrip(Number(tripParam)), listVehicles().catch(() => [])])
      .then(([t, garage]) => {
        if (cancelled) return;
        setVehicles(garage);
        setTrip(t);
      })
      .catch((err) => console.warn('[share] load failed', err));
    return () => {
      cancelled = true;
    };
  }, [tripParam]);

  // A lone drive is the whole trip, so it's shared as the trip.
  const drive =
    trip && trip.drives.length > 1 && driveParam
      ? (trip.drives.find((d) => d.id === Number(driveParam)) ?? null)
      : null;
  const drives = useMemo(() => (drive ? [drive] : trip?.drives), [drive, trip]);
  const previewOf = useMemo(() => (drives ? { drives } : null), [drives]);
  const segments = useTripPreview(previewOf, { points: CARD_POINTS });
  const { photos, access, allow } = usePhotos([[drives?.[0]?.startedAt, drives?.at(-1)?.endedAt]]);

  const { ratio } = FORMATS.find((f) => f.id === format);
  const previewHeight = screenHeight - AROUND_PREVIEW - insets.top - insets.bottom;
  const previewWidth = Math.min(
    screenWidth - 2 * spacing.md,
    Math.max(MIN_PREVIEW_WIDTH, previewHeight * ratio)
  );
  const photo = photoUri ? photos.find((p) => p.id === photoUri) : null;
  const photoAspect = photo?.width && photo?.height ? photo.width / photo.height : null;
  const crop = crops[format] ?? CENTRED;
  const cropper = usePhotoCrop({
    aspect: photoAspect,
    width: previewWidth,
    height: previewWidth / ratio,
    crop,
    onChange: (next) => {
      setCrops((all) => ({ ...all, [format]: next }));
      setFramed(true);
    },
  });

  if (!trip) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  const content = shareCardContent(trip, drive, vehicles);
  const ready = segments !== null && (!photoUri || loadedUri === photoUri);
  const canAsk = access === 'ask' || access === 'blocked';

  return (
    <View style={styles.screen}>
      {/* Drawn off screen at the image's size, and captured when Share is tapped. */}
      <View ref={captureRef} collapsable={false} style={styles.capture}>
        <ShareCard
          content={content}
          segments={segments}
          units={units}
          width={CAPTURE_WIDTH}
          format={format}
          photoUri={photoUri}
          photoAspect={photoAspect}
          photoCrop={photoAspect ? fitCrop(crop, photoAspect, 1, 1 / ratio) : CENTRED}
          onPhotoLoad={() => setLoadedUri(photoUri)}
          // A photo that won't open falls back to the route card rather than blocking Share.
          onPhotoError={() => setPhotoUri(null)}
        />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}>
        <View style={styles.header}>
          <IconButton
            icon="arrow_back"
            variant="plain"
            accessibilityLabel="Back"
            onPress={() => router.back()}
          />
          <Text style={[type.section, styles.title]} role="heading">
            {drive ? 'Share drive' : 'Share trip'}
          </Text>
        </View>

        <View style={styles.formats} role="radiogroup" accessibilityLabel="Image shape">
          {FORMATS.map((f) => (
            <Pressable
              key={f.id}
              onPress={() => setFormat(f.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: format === f.id }}
              style={[styles.format, format === f.id && styles.formatSelected]}
            >
              <Text style={[type.label, format === f.id ? styles.text : styles.muted]}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.preview}>
          <ShareCard
            content={content}
            segments={segments}
            units={units}
            width={previewWidth}
            format={format}
            photoUri={photoUri}
            photoAspect={photoAspect}
            photoMotion={cropper.transform}
          />
          {photoAspect ? (
            <>
              <View {...cropper.panHandlers} style={StyleSheet.absoluteFill} />
              {framed ? null : (
                <View style={styles.hint} pointerEvents="none">
                  <Text style={[type.label, styles.hintText]}>Pinch and drag to frame</Text>
                </View>
              )}
            </>
          ) : null}
        </View>

        <View style={styles.choices}>
          <View>
            <Text style={[type.label, styles.muted, styles.choiceLabel]}>Route</Text>
            <RouteTile
              segments={segments}
              selected={!photoUri}
              onPress={() => setPhotoUri(null)}
            />
          </View>
          {canAsk || photos.length ? (
            <View style={styles.flex}>
              <View style={styles.photosLabel}>
                <Text style={[type.label, styles.muted]}>Photos</Text>
                {/* Free for everyone for now, though still badged: it goes behind Premium later. */}
                <PremiumTag />
              </View>
              {canAsk ? (
                <Pressable
                  onPress={allow}
                  accessibilityRole="button"
                  accessibilityLabel="Use your photos"
                  style={({ pressed }) => [styles.tile, styles.askTile, pressed && styles.pressed]}
                >
                  <Icon name="photo_library" size={24} color={c.onAccentContainer} />
                </Pressable>
              ) : (
                <FlatList
                  horizontal
                  data={photos}
                  keyExtractor={(p) => p.id}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.photoRow}
                  renderItem={({ item }) => (
                    <PhotoThumb
                      photo={item}
                      size={THUMB_W}
                      style={[styles.photoTile, item.id === photoUri && styles.tileSelected]}
                      onPress={() => {
                        if (item.id === photoUri) return;
                        setLoadedUri(null);
                        setCrops({});
                        setPhotoUri(item.id);
                      }}
                    />
                  )}
                />
              )}
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
        <Button
          label="Share"
          disabled={!ready}
          onPress={() => shareCardImage(captureRef)}
        />
      </View>
    </View>
  );
}

const makeStyles = (c) => ({
  screen: { flex: 1, backgroundColor: c.screen },
  center: { alignItems: 'center', justifyContent: 'center' },
  capture: { position: 'absolute', left: -10000, top: 0 },
  content: { paddingHorizontal: spacing.md, paddingBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: -8 },
  title: { color: c.text },
  formats: {
    flexDirection: 'row',
    marginTop: 12,
    padding: 4,
    borderRadius: 20,
    backgroundColor: c.track,
  },
  format: { flex: 1, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  formatSelected: { backgroundColor: c.card },
  text: { color: c.text },
  preview: { marginTop: 12, alignSelf: 'center', borderRadius: 16, overflow: 'hidden' },
  // On the card's photo, so its colours stay the same in light and dark.
  hint: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  hintText: { color: '#FFFFFF' },
  choices: { flexDirection: 'row', gap: 16, marginTop: 16 },
  // Route's label sits on the same line as Photos and its taller Premium tag.
  choiceLabel: { height: 24, marginBottom: 6, textAlignVertical: 'center', lineHeight: 24 },
  photosLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    height: 24,
    marginBottom: 6,
  },
  muted: { color: c.textMuted },
  flex: { flex: 1, minWidth: 0 },
  tile: { width: THUMB_W, height: THUMB_H, borderRadius: 12, overflow: 'hidden' },
  // Centred so the selected border doesn't push the drawing off-centre.
  routeTile: { backgroundColor: '#174EA6', alignItems: 'center', justifyContent: 'center' },
  askTile: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.accentContainer,
  },
  tileSelected: { borderWidth: 3, borderColor: c.accent },
  photoRow: { gap: 6 },
  photoTile: { height: THUMB_H, borderRadius: 12 },
  pressed: { opacity: pressedOpacity },
  footer: { paddingHorizontal: spacing.md, paddingTop: 12 },
});

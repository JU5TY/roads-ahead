import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polyline } from 'react-native-svg';

import PhotoThumb from '../components/photos/PhotoThumb';
import PosterCard from '../components/poster/PosterCard';
import Button from '../components/ui/Button';
import { showMessage } from '../components/ui/DialogHost';
import Icon from '../components/ui/Icon';
import IconButton from '../components/ui/IconButton';
import { useSettings } from '../context/SettingsContext';
import { usePhotoCrop } from '../hooks/usePhotoCrop';
import { usePhotos } from '../hooks/usePhotos';
import { useStyles, useTheme } from '../hooks/useTheme';
import { useTripPreview } from '../hooks/useTripPreview';
import { PosterOrderError, printingOpen, startPosterOrder } from '../services/posterService';
import { getTrip } from '../storage/tripStorage';
import { listVehicles } from '../storage/vehicleStorage';
import { pressedOpacity, spacing, type } from '../theme';
import { comingSoon } from '../utils/comingSoon';
import { CENTRED, fitCrop } from '../utils/photoCrop';
import { MIN_PHOTO_DPI, photoDpi, posterSpec, posterText } from '../utils/poster';
import { IMAGE, PAGE, SIZES } from '../utils/posterLayout';
import { fitInBox } from '../utils/routeOutline';

// Poster-shaped choices: A-series paper is 1 : √2.
const THUMB_W = 57;
const THUMB_H = 80;
// A long trip's shape stays true at A2.
const POSTER_POINTS = 4000;
// The preview is as tall as Share's Post card on the same phone (see ShareScreen),
// so the poster's text is as easy to read.
const SHARE_AROUND_PREVIEW = 358;
const SHARE_MIN_WIDTH = 200;
const SHARE_POST_RATIO = 4 / 5;
const PREVIEW_PAD = 12; // grey above and below the poster

/** The Route choice: a small drawing of the route on the map's blue. */
function RouteTile({ segments, selected, onPress }) {
  const styles = useStyles(makeStyles);
  const routes = (segments ?? []).map((s) => s.coordinates).filter((r) => r.length > 1);
  const fit = fitInBox(routes, THUMB_W, THUMB_H, 10);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Route poster"
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
 * Order a printed poster of a trip, or one drive of it: a preview of the poster, a
 * choice of route or photo and of size, and Order. Params: `trip`, and `drive`.
 */
export default function PosterScreen() {
  const { trip: tripParam, drive: driveParam } = useLocalSearchParams();
  const { units } = useSettings();
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [trip, setTrip] = useState(null);
  const [vehicles, setVehicles] = useState([]); // the Garage
  const [size, setSize] = useState('A3');
  const [photoId, setPhotoId] = useState(null);
  const [crop, setCrop] = useState(CENTRED);
  const [framed, setFramed] = useState(false); // they've moved a photo, so know they can
  const [ordering, setOrdering] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // A Garage that won't load only leaves the vehicle off the poster.
    Promise.all([getTrip(Number(tripParam)), listVehicles().catch(() => [])])
      .then(([t, garage]) => {
        if (cancelled) return;
        setVehicles(garage);
        setTrip(t);
      })
      .catch((err) => console.warn('[poster] load failed', err));
    return () => {
      cancelled = true;
    };
  }, [tripParam]);

  // A lone drive is the whole trip, so it's printed as the trip.
  const drive =
    trip && trip.drives.length > 1 && driveParam
      ? (trip.drives.find((d) => d.id === Number(driveParam)) ?? null)
      : null;
  const drives = useMemo(() => (drive ? [drive] : trip?.drives), [drive, trip]);
  const previewOf = useMemo(() => (drives ? { drives } : null), [drives]);
  const segments = useTripPreview(previewOf, { points: POSTER_POINTS });
  const { photos, access, allow } = usePhotos([[drives?.[0]?.startedAt, drives?.at(-1)?.endedAt]]);

  const shareWidth = Math.min(
    screenWidth - 2 * spacing.md,
    Math.max(
      SHARE_MIN_WIDTH,
      (screenHeight - SHARE_AROUND_PREVIEW - insets.top - insets.bottom) * SHARE_POST_RATIO
    )
  );
  const previewHeight = shareWidth / SHARE_POST_RATIO;
  const posterWidth = Math.min(
    screenWidth - 2 * spacing.md - 2 * PREVIEW_PAD,
    ((previewHeight - 2 * PREVIEW_PAD) * PAGE.width) / PAGE.height
  );
  const u = posterWidth / PAGE.width;
  const photo = photoId ? (photos.find((p) => p.id === photoId) ?? null) : null;
  const photoAspect = photo?.width && photo?.height ? photo.width / photo.height : null;
  const cropper = usePhotoCrop({
    aspect: photoAspect,
    width: IMAGE.width * u,
    height: IMAGE.height * u,
    crop,
    onChange: (next) => {
      setCrop(next);
      setFramed(true);
    },
  });

  const text = useMemo(
    () => (trip ? posterText(trip, drive, vehicles, units) : null),
    [trip, drive, vehicles, units]
  );
  const spec = useMemo(() => {
    if (!text || !segments) return null;
    return posterSpec({
      text,
      segments,
      size,
      photo,
      crop: photoAspect ? fitCrop(crop, photoAspect, IMAGE.width, IMAGE.height) : CENTRED,
    });
  }, [text, segments, size, photo, photoAspect, crop]);

  if (!trip || !spec) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  const canAsk = access === 'ask' || access === 'blocked';
  const dpi = photoAspect ? photoDpi(photo, fitCrop(crop, photoAspect, IMAGE.width, IMAGE.height), size) : null;
  const soft = dpi !== null && dpi < MIN_PHOTO_DPI;
  const [widthMm, heightMm] = SIZES[size].mm;

  const order = async () => {
    if (!printingOpen) {
      comingSoon('Ordering a printed poster');
      return;
    }
    setOrdering(true);
    try {
      await startPosterOrder({ spec, photoId, tripId: trip.id });
    } catch (err) {
      if (!(err instanceof PosterOrderError)) console.warn('[poster] order failed', err);
      showMessage(
        "Couldn't start the order",
        err instanceof PosterOrderError ? err.message : 'Something went wrong. Please try again.'
      );
    } finally {
      setOrdering(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}>
        <View style={styles.header}>
          <IconButton
            icon="arrow_back"
            variant="plain"
            accessibilityLabel="Back"
            onPress={() => router.back()}
          />
          <Text style={[type.section, styles.title]} role="heading">
            Print poster
          </Text>
        </View>

        <View style={styles.sizes} role="radiogroup" accessibilityLabel="Poster size">
          {Object.values(SIZES).map((s) => (
            <Pressable
              key={s.label}
              onPress={() => setSize(s.label)}
              accessibilityRole="radio"
              accessibilityState={{ checked: size === s.label }}
              style={[styles.size, size === s.label && styles.sizeSelected]}
            >
              <Text style={[type.label, size === s.label ? styles.text : styles.muted]}>
                {s.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={[styles.preview, { height: previewHeight }]}>
          <View style={styles.poster} accessibilityLabel={`Preview of the ${size} poster`}>
            <PosterCard
              spec={spec}
              width={posterWidth}
              photoUri={photo?.id}
              photoMotion={cropper.transform}
              // A photo that won't open goes back to the route poster rather than blocking Order.
              onPhotoError={() => setPhotoId(null)}
            />
            {photoAspect ? (
              <View
                {...cropper.panHandlers}
                style={[
                  styles.cropArea,
                  {
                    left: IMAGE.x * u,
                    top: IMAGE.y * u,
                    width: IMAGE.width * u,
                    height: IMAGE.height * u,
                  },
                ]}
              >
                {framed ? null : (
                  <View style={styles.hint} pointerEvents="none">
                    <Text style={[type.label, styles.hintText]}>Pinch and drag to frame</Text>
                  </View>
                )}
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.choices}>
          <View>
            <Text style={[type.label, styles.muted, styles.choiceLabel]}>Route</Text>
            <RouteTile segments={segments} selected={!photoId} onPress={() => setPhotoId(null)} />
          </View>
          {canAsk || photos.length ? (
            <View style={styles.flex}>
              <Text style={[type.label, styles.muted, styles.choiceLabel]}>Photo</Text>
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
                      style={[styles.photoTile, item.id === photoId && styles.tileSelected]}
                      onPress={() => {
                        if (item.id === photoId) return;
                        setCrop(CENTRED);
                        setPhotoId(item.id);
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
        {soft ? (
          <View style={styles.warning}>
            <Icon name="warning" size={20} color={c.warning} />
            <Text style={[type.bodySmall, styles.warningText]}>
              This photo may look soft at {size}. Choose{' '}
              {size === 'A2' ? 'A3, or a sharper photo' : 'a sharper photo'}.
            </Text>
          </View>
        ) : (
          <Text style={[type.bodySmall, styles.muted, styles.delivery]}>
            Fine-art print, {widthMm} × {heightMm} mm · Free UK delivery
          </Text>
        )}
        <Button
          label={ordering ? 'Preparing your poster…' : `Order print · ${SIZES[size].price}`}
          disabled={ordering || (!!photoId && !photoAspect)}
          onPress={order}
        />
      </View>
    </View>
  );
}

const makeStyles = (c) => ({
  screen: { flex: 1, backgroundColor: c.screen },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.md, paddingBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: -8 },
  title: { color: c.text },
  text: { color: c.text },
  muted: { color: c.textMuted },
  flex: { flex: 1, minWidth: 0 },
  preview: {
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: c.track,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Paper casts a shadow in dark mode too.
  poster: {
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  cropArea: { position: 'absolute', alignItems: 'center' },
  // On the photo, so its colours stay the same in light and dark.
  hint: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  hintText: { color: '#FFFFFF' },
  choices: { flexDirection: 'row', gap: 16, marginTop: 16 },
  choiceLabel: { height: 24, marginBottom: 6, textAlignVertical: 'center', lineHeight: 24 },
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
  sizes: {
    flexDirection: 'row',
    marginTop: 12,
    padding: 4,
    borderRadius: 20,
    backgroundColor: c.track,
  },
  size: { flex: 1, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sizeSelected: { backgroundColor: c.card },
  footer: { paddingHorizontal: spacing.md, paddingTop: 12, gap: 10 },
  delivery: { textAlign: 'center' },
  warning: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  warningText: { flex: 1, color: c.warning },
});

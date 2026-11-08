import { useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { pressedOpacity, radius, type } from '../../theme';
import Icon from '../ui/Icon';
import SectionHeader from '../ui/SectionHeader';
import PhotoGallery from './PhotoGallery';
import PhotoThumb from './PhotoThumb';

const GAP = 6;

/**
 * "Photos" section of a trip: the first three gallery photos taken during it,
 * "+N" on the last, and See all. Asks for gallery access first, the whole card
 * the button, like the print banner's. `photos`,
 * `access` and `allow` come from usePhotos().
 */
export default function TripPhotos({ photos, access, allow, hideTimes }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(null); // null | { start: index or null for the grid }

  if (access === 'ask' || access === 'blocked') {
    return (
      <>
        <SectionHeader title="Photos" />
        <Pressable
          onPress={allow}
          accessibilityRole="button"
          accessibilityLabel="Photos from your trip"
          accessibilityHint={access === 'blocked' ? 'Opens Settings' : undefined}
          style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        >
          <View style={styles.well}>
            <Icon name="photo_library" size={26} color={c.onAccentContainer} />
          </View>
          <View style={styles.flex}>
            <Text style={[type.bodyStrong, styles.text]}>Photos from your trip</Text>
            <Text style={[type.bodySmall, styles.muted]}>
              Allow access to see the photos you took on this trip
            </Text>
          </View>
          <Icon name="chevron_right" size={24} color={c.textMuted} />
        </Pressable>
      </>
    );
  }
  if (access !== 'granted' || photos.length === 0) return null;

  const size = (width - 16 * 2 - GAP * 2) / 3;
  const shown = photos.slice(0, 3);
  const more = photos.length - shown.length;
  return (
    <>
      <SectionHeader
        title="Photos"
        subtitle={`${photos.length} from your gallery`}
        actionLabel={photos.length > 3 ? 'See all' : undefined}
        onAction={() => setOpen({ start: null })}
      />
      <View style={styles.row}>
        {shown.map((photo, i) => (
          <PhotoThumb
            key={photo.id}
            photo={photo}
            size={size}
            onPress={() => (i === 2 && more > 0 ? setOpen({ start: null }) : setOpen({ start: i }))}
          >
            {i === 2 && more > 0 ? (
              <View style={styles.more}>
                <Text style={[type.section, styles.moreText]}>+{more}</Text>
              </View>
            ) : null}
          </PhotoThumb>
        ))}
      </View>
      <PhotoGallery
        visible={open !== null}
        photos={photos}
        startIndex={open?.start ?? null}
        onClose={() => setOpen(null)}
        hideTimes={hideTimes}
      />
    </>
  );
}

const makeStyles = (c) => ({
  row: { flexDirection: 'row', gap: GAP },
  more: {
    ...{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.photoScrim,
  },
  moreText: { color: c.onPhoto },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    // Its text lines up with the Driving time card's and the print banner's.
    paddingVertical: 16,
    paddingLeft: 20,
    paddingRight: 12,
    borderRadius: radius.card,
    backgroundColor: c.card,
    ...c.cardShadow,
  },
  pressed: { opacity: pressedOpacity },
  well: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.accentContainer,
  },
  flex: { flex: 1, gap: 2 },
  text: { color: c.text },
  muted: { color: c.textMuted },
});

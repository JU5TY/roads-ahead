import { useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { radius, type } from '../../theme';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import SectionHeader from '../ui/SectionHeader';
import PhotoGallery from './PhotoGallery';
import PhotoThumb from './PhotoThumb';

const GAP = 6;

/**
 * "Photos" section of a trip: the first three gallery photos taken during it,
 * "+N" on the last, and See all. Asks for gallery access first. `photos`,
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
        <View style={styles.card}>
          <View style={styles.well}>
            <Icon name="photo_library" size={24} color={c.onAccentContainer} />
          </View>
          <View style={styles.flex}>
            <Text style={[type.bodyStrong, styles.text]}>{"We'll find your trip photos"}</Text>
            <Text style={[type.small, styles.muted]}>
              We match them by when they were taken, and they stay in your gallery.
            </Text>
            <Button
              size="small"
              variant="tonal"
              label={access === 'blocked' ? 'Open Settings' : 'Allow access'}
              onPress={allow}
              style={styles.allow}
            />
          </View>
        </View>
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
    gap: 16,
    padding: 16,
    borderRadius: radius.card,
    backgroundColor: c.card,
    ...c.cardShadow,
  },
  well: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.accentContainer,
  },
  flex: { flex: 1, gap: 2 },
  text: { color: c.text },
  muted: { color: c.textMuted },
  allow: { alignSelf: 'flex-start', marginTop: 10 },
});

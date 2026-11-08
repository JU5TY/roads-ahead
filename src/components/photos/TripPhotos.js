import { useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';

import { useStyles } from '../../hooks/useTheme';
import { type } from '../../theme';
import BannerCard from '../ui/BannerCard';
import SectionHeader from '../ui/SectionHeader';
import PhotoGallery from './PhotoGallery';
import PhotoThumb from './PhotoThumb';

const GAP = 6;

/**
 * "Photos" section of a trip: the first three gallery photos taken during it,
 * "+N" on the last, and See all. Asks for gallery access first with a BannerCard,
 * like the print banner's. `photos`, `access` and `allow` come from usePhotos();
 * `what` is 'trip' or 'drive'.
 */
export default function TripPhotos({ photos, access, allow, hideTimes, what = 'trip' }) {
  const styles = useStyles(makeStyles);
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(null); // null | { start: index or null for the grid }

  if (access === 'ask' || access === 'blocked') {
    return (
      <>
        <SectionHeader title="Photos" />
        <BannerCard
          icon="photo_library"
          title={`Photos from your ${what}`}
          subtitle={`Allow access to see the photos taken on this ${what}`}
          onPress={allow}
          accessibilityHint={access === 'blocked' ? 'Opens Settings' : undefined}
        />
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
});

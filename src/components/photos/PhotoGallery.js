import { Image } from 'expo-image';
import { useState } from 'react';
import { FlatList, Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStyles } from '../../hooks/useTheme';
import { type } from '../../theme';
import { formatDayDate, formatTime } from '../../utils/format';
import Icon from '../ui/Icon';
import PhotoThumb from './PhotoThumb';

const GAP = 4;

/** One photo at a time, full screen; swipe for the next. */
function Viewer({ photos, index, onIndex, onBack, hideTimes }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const styles = useStyles(makeStyles);
  const photo = photos[index];
  return (
    <View style={styles.viewer}>
      <FlatList
        data={photos}
        keyExtractor={(p) => p.id}
        horizontal
        pagingEnabled
        initialScrollIndex={index}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={(e) => onIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => (
          <Image source={{ uri: item.id }} style={{ width, flex: 1 }} contentFit="contain" />
        )}
      />
      <View style={[styles.viewerBar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={onBack} style={styles.round} accessibilityLabel="Close photo">
          <Icon name="close" size={24} color="#FFFFFF" />
        </Pressable>
        <Text style={[type.label, styles.viewerText]}>
          {photo
            ? `${index + 1} of ${photos.length} · ${formatDayDate(photo.time)}${hideTimes ? '' : ` · ${formatTime(photo.time)}`}`
            : ''}
        </Text>
      </View>
    </View>
  );
}

/**
 * Full-screen photos: a grid of all of them, or with `startIndex` straight
 * into one photo. `hideTimes` leaves clock times out (Iconic Road drives).
 */
export default function PhotoGallery({ visible, photos, startIndex = null, onClose, hideTimes }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const styles = useStyles(makeStyles);
  const [index, setIndex] = useState(startIndex);
  const [opened, setOpened] = useState(startIndex);
  // Reset to where it was opened from each time it's shown.
  if (opened !== startIndex) {
    setOpened(startIndex);
    setIndex(startIndex);
  }
  const size = (width - 16 * 2 - GAP * 2) / 3;
  const back = () => (startIndex === null ? setIndex(null) : onClose());

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={index === null ? onClose : back}>
      {index === null ? (
        <View style={[styles.screen, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <Pressable onPress={onClose} style={styles.headerButton} accessibilityLabel="Close">
              <Icon name="close" size={24} color={styles.title.color} />
            </Pressable>
            <Text style={[type.section, styles.title]}>
              {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
            </Text>
          </View>
          <FlatList
            data={photos}
            keyExtractor={(p) => p.id}
            numColumns={3}
            columnWrapperStyle={{ gap: GAP }}
            contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 16 }]}
            renderItem={({ item, index: i }) => (
              <PhotoThumb photo={item} size={size} onPress={() => setIndex(i)} />
            )}
          />
        </View>
      ) : (
        <Viewer
          photos={photos}
          index={index}
          onIndex={setIndex}
          onBack={back}
          hideTimes={hideTimes}
        />
      )}
    </Modal>
  );
}

const makeStyles = (c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 64, paddingHorizontal: 8 },
  headerButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  title: { color: c.text },
  grid: { paddingHorizontal: 16, gap: GAP },
  viewer: { flex: 1, backgroundColor: c.photoBackground },
  viewerBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingBottom: 8,
    backgroundColor: c.photoScrim,
  },
  round: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  viewerText: { color: c.onPhoto, flexShrink: 1 },
});

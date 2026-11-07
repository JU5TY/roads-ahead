import { Image as ExpoImage } from 'expo-image';
import { Animated, Image, Platform, View } from 'react-native';

import { MAX_ZOOM, coverSize, cropTransform } from '../../utils/photoCrop';

/**
 * A gallery photo filling its frame: expo-image on iPhone (its photo library
 * addresses), React Native's on Android, whose bitmaps can be drawn into a captured
 * image. Placed by `crop`, or by `motion` while it's being dragged, once its `aspect`
 * is known; centred until then.
 */
export default function FramedPhoto({
  uri,
  aspect,
  crop,
  motion,
  frameWidth,
  frameHeight,
  onLoad,
  onError,
}) {
  const style = { width: '100%', height: '100%' };
  const image =
    Platform.OS === 'android' ? (
      <Image source={{ uri }} style={style} resizeMode="cover" onLoad={onLoad} onError={onError} />
    ) : (
      <ExpoImage source={{ uri }} style={style} contentFit="cover" onLoad={onLoad} onError={onError} />
    );
  if (!aspect) return <View style={{ position: 'absolute', ...style }}>{image}</View>;
  const cover = coverSize(aspect, frameWidth, frameHeight);
  const { translateX, translateY, scale } =
    motion ?? cropTransform(crop, aspect, frameWidth, frameHeight);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: cover.width * MAX_ZOOM,
        height: cover.height * MAX_ZOOM,
        transformOrigin: 'left top',
        transform: [{ translateX }, { translateY }, { scale }],
      }}
    >
      {image}
    </Animated.View>
  );
}

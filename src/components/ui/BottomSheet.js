import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
} from 'react-native';

import { useStyles } from '../../hooks/useTheme';

const OPEN_MS = 300;
const CLOSE_MS = 220;

/**
 * A modal sheet from the bottom of the screen: the scrim fades in while the
 * sheet slides up over it (a Modal's own "slide" moves the scrim too), and
 * both go the same way out before it unmounts. Children are the sheet itself,
 * styled by the caller; they mount afresh each time it opens. Tapping the scrim
 * (unless `scrimCloses` is false) or Back calls onClose. Keeps clear of the keyboard (padding on Android too:
 * edge-to-edge windows don't resize for it). No motion with reduced motion on.
 * `maxHeight` (of the screen, e.g. '80%') caps the sheet; give the sheet
 * `flexShrink: 1` so a ScrollView in it scrolls rather than overflowing.
 */
export default function BottomSheet({
  visible,
  onClose,
  scrimCloses = true,
  maxHeight = '100%',
  children,
}) {
  const styles = useStyles(makeStyles);
  const [mounted, setMounted] = useState(visible);
  const [scrim] = useState(() => new Animated.Value(0));
  // Starts off screen; the sheet's own height once it's laid out.
  const [offset] = useState(() => new Animated.Value(Dimensions.get('window').height));
  const height = useRef(0);
  const reduceMotion = useRef(false);

  const animate = (open, after) => {
    const duration = reduceMotion.current ? 0 : open ? OPEN_MS : CLOSE_MS;
    const easing = open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic);
    Animated.parallel([
      Animated.timing(scrim, { toValue: open ? 1 : 0, duration, easing, useNativeDriver: true }),
      Animated.timing(offset, {
        toValue: open ? 0 : height.current,
        duration,
        easing,
        useNativeDriver: true,
      }),
    ]).start(after);
  };

  useEffect(() => {
    if (visible) {
      AccessibilityInfo.isReduceMotionEnabled()
        .catch(() => false)
        .then((reduce) => {
          reduceMotion.current = reduce;
        });
      // Opened again while closing: back up from where it is.
      if (height.current > 0) animate(true);
      else setMounted(true);
    } else if (mounted) {
      animate(false, ({ finished }) => {
        if (!finished) return;
        height.current = 0;
        setMounted(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Opens once the sheet has a height to slide up from.
  const onLayout = (e) => {
    const first = height.current === 0;
    height.current = e.nativeEvent.layout.height;
    if (first && visible) {
      offset.setValue(height.current);
      animate(true);
    }
  };

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.scrim, { opacity: scrim }]}>
        {scrimCloses ? (
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
        ) : null}
      </Animated.View>
      <KeyboardAvoidingView style={styles.column} behavior="padding" pointerEvents="box-none">
        <Animated.View
          onLayout={onLayout}
          style={{ maxHeight, transform: [{ translateY: offset }] }}
        >
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (c) => ({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: c.scrim },
  column: { flex: 1, justifyContent: 'flex-end' },
});

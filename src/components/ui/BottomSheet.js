import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStyles } from '../../hooks/useTheme';
import { radius, spacing } from '../../theme';

const OPEN_MS = 300;
const CLOSE_MS = 220;
const DRAG_CLOSE = 80; // dragged this far down (or flicked), the sheet closes
const SHOW_WAIT_MS = 250; // opens anyway if the Modal never says it's showing

/**
 * A modal sheet from the bottom of the screen, the same for every sheet: a
 * panel with rounded top corners and a handle bar. The scrim fades in while the
 * panel slides up over it (a Modal's own "slide" moves the scrim too), and both
 * go the same way out before it unmounts. Children are the panel's content and
 * mount afresh each time it opens; give a ScrollView in it room to shrink
 * (`flexShrink: 1` on its parents) so a tall sheet scrolls under the status bar
 * rather than running past it, or behind the keyboard (kept clear with padding
 * on Android too: edge-to-edge windows don't resize for it).
 * Dragging the handle down, tapping the scrim (unless `scrimCloses` is false)
 * or Back calls onClose. No motion with reduced motion on.
 */
export default function BottomSheet({ visible, onClose, scrimCloses = true, children }) {
  const insets = useSafeAreaInsets();
  const styles = useStyles(makeStyles);
  const [mounted, setMounted] = useState(visible);
  const [scrim] = useState(() => new Animated.Value(0));
  // Starts off screen; the panel's own height once it's laid out.
  const [offset] = useState(() => new Animated.Value(Dimensions.get('window').height));
  const height = useRef(0);
  const shown = useRef(false); // the Modal is on screen (Android draws it a moment later)
  const opened = useRef(false);
  const isVisible = useRef(visible);
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

  // Slides up once the Modal is showing and the panel has a height to come from.
  const open = () => {
    if (opened.current || !shown.current || height.current === 0 || !isVisible.current) return;
    opened.current = true;
    offset.setValue(height.current);
    animate(true);
  };

  useEffect(() => {
    isVisible.current = visible;
  });

  useEffect(() => {
    if (visible) {
      AccessibilityInfo.isReduceMotionEnabled()
        .catch(() => false)
        .then((reduce) => {
          reduceMotion.current = reduce;
        });
      // Opened again while closing: back up from where it is.
      if (shown.current && height.current > 0) animate(true);
      else setMounted(true);
    } else if (mounted) {
      animate(false, ({ finished }) => {
        if (!finished) return;
        height.current = 0;
        shown.current = false;
        opened.current = false;
        setMounted(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const onLayout = (e) => {
    const first = height.current === 0;
    height.current = e.nativeEvent.layout.height;
    if (!first) return;
    open();
    setTimeout(() => {
      shown.current = true;
      open();
    }, SHOW_WAIT_MS);
  };

  // The handle drags the panel down; let go far enough (or flick) and it closes.
  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
    onPanResponderMove: (_, g) => offset.setValue(Math.max(0, g.dy)),
    onPanResponderRelease: (_, g) => {
      if (g.dy > DRAG_CLOSE || g.vy > 0.8) onClose();
      else Animated.spring(offset, { toValue: 0, bounciness: 0, useNativeDriver: true }).start();
    },
  });

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      onShow={() => {
        shown.current = true;
        open();
      }}
    >
      <Animated.View style={[styles.scrim, { opacity: scrim }]}>
        {scrimCloses ? (
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
        ) : null}
      </Animated.View>
      <KeyboardAvoidingView
        style={[styles.column, { paddingTop: insets.top + spacing.lg }]}
        behavior="padding"
        pointerEvents="box-none"
      >
        <Animated.View
          onLayout={onLayout}
          style={[styles.panel, { transform: [{ translateY: offset }] }]}
        >
          <View {...pan.panHandlers} style={styles.grabber}>
            <View style={styles.handle} />
          </View>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (c) => ({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: c.scrim },
  column: { flex: 1, justifyContent: 'flex-end' },
  panel: {
    flexShrink: 1,
    backgroundColor: c.background,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
  },
  // A taller strip than the bar, so it's easy to grab.
  grabber: { alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.sm },
  handle: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.outlineStrong,
    opacity: 0.4,
  },
});

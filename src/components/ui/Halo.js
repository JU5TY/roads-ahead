import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import Icon from './Icon';

/**
 * A light ring behind a round picture (the logo, the Location pin, No trips,
 * Home's map). `size` is the ring's outer size; the child sits centred in it.
 * `grow` scales the ring in once on mount, for the one-off onboarding screens.
 */
export default function Halo({ size, grow = false, style, children }) {
  const styles = useStyles(makeStyles);
  const [progress] = useState(() => new Animated.Value(grow ? 0 : 1));
  useEffect(() => {
    if (!grow) return;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) progress.setValue(1);
        else
          Animated.timing(progress, {
            toValue: 1,
            duration: 520,
            easing: Easing.bezier(0.2, 0.8, 0.2, 1),
            useNativeDriver: true,
          }).start();
      });
    return () => {
      cancelled = true;
    };
  }, [grow, progress]);
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  return (
    <View style={[styles.wrap, { width: size, height: size }, style]}>
      <Animated.View
        style={[
          styles.ring,
          { borderRadius: size / 2, opacity: progress, transform: [{ scale }] },
        ]}
      />
      {children}
    </View>
  );
}

/** A solid blue circle with a white icon, in its ring: Location, the Record sheet, No trips. */
export function HaloIcon({ icon, grow = false, style }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <Halo size={104} grow={grow} style={style}>
      <View style={styles.badge}>
        <Icon name={icon} filled size={38} color={c.onAccent} />
      </View>
    </Halo>
  );
}

const makeStyles = (c) => ({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  ring: { ...StyleSheet.absoluteFillObject, backgroundColor: c.halo },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.accent,
  },
});

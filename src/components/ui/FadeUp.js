import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

/**
 * Fades and slides its children up into place, `delay` ms after mounting.
 * Shows them straight away when the phone asks for reduced motion.
 */
export default function FadeUp({ delay = 0, style, children }) {
  const progress = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) progress.setValue(1);
        else
          Animated.timing(progress, {
            toValue: 1,
            duration: 400,
            delay,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }).start();
      });
    return () => {
      cancelled = true;
    };
  }, [progress, delay]);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
  return (
    <Animated.View style={[style, { opacity: progress, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

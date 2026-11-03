import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Text, View } from 'react-native';

import { useStyles } from '../hooks/useTheme';
import { radius, spacing, type } from '../theme';
import IconButton from './ui/IconButton';
import MapDot from './MapDot';

export const MAP_CARD_ROOM = 88; // the card's height and gap: map padding under it

const KIND_LABELS = { start: 'Start', finish: 'Finish', stop: 'Rest stop' };

// Asked once, so the first fade doesn't wait on it.
let reduceMotion = false;
AccessibilityInfo.isReduceMotionEnabled()
  .then((on) => (reduceMotion = on))
  .catch(() => {});
AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => (reduceMotion = on));

/**
 * The card for a map marker that's been tapped, floating over the bottom of the
 * map in place of a callout: its mark, its name, then what it is and any
 * description ("Rest stop · 25 min"). `marker` is one of RouteMap's markers, or
 * null to hide. It fades up in and back down out, keeping the last marker while
 * it goes; tapping another marker swaps the words without fading again.
 */
export default function MapCard({ marker, onClose }) {
  const styles = useStyles(makeStyles);
  const [shown, setShown] = useState(marker);
  const progress = useState(() => new Animated.Value(0))[0];

  if (marker && marker !== shown) setShown(marker);

  useEffect(() => {
    const show = marker != null;
    const anim = Animated.timing(progress, {
      toValue: show ? 1 : 0,
      // No movement for reduced motion: it just appears and goes.
      duration: reduceMotion ? 0 : show ? 220 : 160,
      easing: show ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start(({ finished }) => finished && !show && setShown(null));
    return () => anim.stop();
  }, [marker != null, progress]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!shown) return null;
  const kindLabel = KIND_LABELS[shown.kind];
  // A stop with no place name is already titled "Rest stop".
  const detail = [kindLabel !== shown.title && kindLabel, shown.description]
    .filter(Boolean)
    .join(' · ');
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });
  return (
    <Animated.View
      style={[styles.wrap, { opacity: progress, transform: [{ translateY }] }]}
      // Fades the card and its shadow as one picture on Android, so the shadow
      // doesn't flicker.
      renderToHardwareTextureAndroid
      pointerEvents={marker ? 'box-none' : 'none'}
    >
      <View style={styles.card} accessible accessibilityLabel={`${shown.title}. ${detail}`}>
        <MapDot kind={shown.kind} color={shown.color} size={16} />
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {shown.title}
          </Text>
          {detail ? (
            <Text style={styles.detail} numberOfLines={1}>
              {detail}
            </Text>
          ) : null}
        </View>
        <IconButton
          icon="close"
          variant="plain"
          size={36}
          iconSize={20}
          accessibilityLabel="Close"
          onPress={onClose}
        />
      </View>
    </Animated.View>
  );
}

const makeStyles = (c) => ({
  wrap: { position: 'absolute', left: spacing.md, right: spacing.md, bottom: spacing.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MAP_CARD_ROOM - spacing.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    borderRadius: radius.card,
    backgroundColor: c.card,
    ...c.cardShadow,
  },
  text: { flex: 1 },
  title: { ...type.bodyStrong, color: c.text },
  detail: { ...type.small, color: c.textMuted },
});

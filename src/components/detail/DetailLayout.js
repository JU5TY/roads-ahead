import { router } from 'expo-router';
import { useState } from 'react';
import { Animated, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStyles } from '../../hooks/useTheme';
import { bottomSpace, spacing } from '../../theme';
import IconButton from '../ui/IconButton';

export const MAP_HEIGHT = 400;

/**
 * Trip page: a full-width map under the status bar with a round back button
 * top left and round action buttons top right, and the content below it on a
 * panel that slides up over the map (the map scrolls at half speed, so it
 * seems to stay behind). Only a `floating` button (FloatingButton, placed by
 * the screen) floats over the content, which leaves room for it at the end.
 * actions: [{ icon, label, onPress }], left to right; label is for screen readers.
 * `mapHeight` below the status bar: 400 on Trip, 380 on Day, 360 on a road.
 * `scrollEnabled` false holds the page still (while a plan's stop is dragged).
 * `footer` is pinned under the content, outside the scroll (an Iconic Trip's Copy).
 */
export default function DetailLayout({
  map,
  mapHeight = MAP_HEIGHT,
  actions = [],
  scrollRef,
  scrollEnabled = true,
  footer,
  floating,
  children,
}) {
  const insets = useSafeAreaInsets();
  const styles = useStyles(makeStyles);
  const [scrollY] = useState(() => new Animated.Value(0));
  // Scrolling up, the map moves at half speed; pulled down past the top, it
  // stays pinned while the content bounces.
  const mapShift = scrollY.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [-1, 0, 0.5],
  });

  return (
    <View style={styles.screen}>
      <Animated.ScrollView
        ref={scrollRef}
        scrollEnabled={scrollEnabled}
        // The panel's own colour runs to the end of the page.
        contentContainerStyle={styles.scrollContent}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
      >
        <Animated.View
          style={[
            styles.map,
            { height: mapHeight + insets.top, transform: [{ translateY: mapShift }] },
          ]}
        >
          {map}
        </Animated.View>
        <View
          style={[
            styles.content,
            { paddingBottom: (floating ? bottomSpace.recordPill : spacing.xl) + (footer ? 0 : insets.bottom) },
          ]}
        >
          {children}
        </View>
      </Animated.ScrollView>
      {footer ? (
        <View style={[styles.footer, { paddingBottom: spacing.lg + insets.bottom }]}>{footer}</View>
      ) : null}
      {floating}
      <IconButton
        icon="arrow_back"
        variant="floating"
        accessibilityLabel="Back"
        onPress={() => router.back()}
        style={[styles.back, { top: insets.top + 12 }]}
      />
      {actions.length > 0 ? (
        <View style={[styles.actions, { top: insets.top + 12 }]}>
          {actions.map((a) => (
            <IconButton
              key={a.label}
              icon={a.icon}
              variant="floating"
              accessibilityLabel={a.label}
              onPress={a.onPress}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  map: { backgroundColor: c.card },
  scrollContent: { flexGrow: 1 },
  // A straight top edge where it meets the map (the Google logo stays clear).
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    backgroundColor: c.background,
    shadowColor: c.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: -2 },
    elevation: 4,
  },
  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    backgroundColor: c.background,
    borderTopWidth: 1,
    borderTopColor: c.divider,
  },
  back: { position: 'absolute', left: 12 },
  actions: { position: 'absolute', right: 12, flexDirection: 'row', gap: 8 },
});

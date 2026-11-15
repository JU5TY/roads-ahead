import { Children, useEffect, useId, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '../../hooks/useTheme';
import { pressedOpacity } from '../../theme';
import Icon from './Icon';

const END = 56; // the solid end an arrow sits in
const LEAD = 24; // the fade into it
const ARROW = 32;
const EDGE = 4; // this close to an end counts as there

/** A fade from clear to the page colour, pointing `to` 'left' or 'right'. */
function Fade({ to, color }) {
  const id = `pillFade${useId().replace(/:/g, '')}`;
  return (
    <Svg width={LEAD} height="100%">
      <Defs>
        <LinearGradient id={id} x1={to === 'right' ? 0 : 1} y1="0" x2={to === 'right' ? 1 : 0} y2="0">
          <Stop offset="0" stopColor={color} stopOpacity={0} />
          <Stop offset="1" stopColor={color} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Rect width={LEAD} height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/**
 * A round ‹ or › over a solid end of the row, `side` 'left' or 'right'. The
 * whole solid end is the button; taps on the fade go through to the pill
 * under it, so a half-faded pill can still be picked.
 */
function Arrow({ side, onPress }) {
  const { c } = useTheme();
  const right = side === 'right';
  const fade = (
    <View pointerEvents="none">
      <Fade to={side} color={c.background} />
    </View>
  );
  return (
    <View pointerEvents="box-none" style={[styles.end, right ? styles.right : styles.left]}>
      {right ? fade : null}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={right ? 'Show more' : 'Show earlier'}
        style={[styles.solid, { backgroundColor: c.background }]}
      >
        {({ pressed }) => (
          <View style={[styles.arrow, { borderColor: c.outline }, pressed && { opacity: pressedOpacity }]}>
            <Icon name={right ? 'chevron_right' : 'chevron_left'} size={20} color={c.text} />
          </View>
        )}
      </Pressable>
      {right ? null : fade}
    </View>
  );
}

/**
 * A row of pills that scrolls sideways (a trip's or plan's days, Iconic Roads
 * countries). While there's more out of view, that end shows a round › (or ‹
 * once it's been scrolled), even when the pills stop neatly short of the edge;
 * tapping it moves the row on about a screen. A row that fits shows neither.
 * The `selected` pill slides fully into view, clear of the fade and arrow,
 * when it's picked (or the row opens on it). `style` and
 * `contentContainerStyle` are the ScrollView's.
 */
export default function PillRow({ style, contentContainerStyle, children, ...rest }) {
  const scroller = useRef(null);
  const [x, setX] = useState(0);
  const [width, setWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  // Also read where it stopped: the last scroll event of a fling can be skipped,
  // which left the end arrow showing at the end.
  const track = (e) => setX(e.nativeEvent.contentOffset.x);
  // A screen less both ends, so the pill that was at the edge stays in view.
  const step = Math.max(width - 2 * END - LEAD, 80);
  const scrollTo = (to) =>
    scroller.current?.scrollTo({ x: Math.min(Math.max(to, 0), contentWidth - width), animated: true });
  const scrollBy = (dx) => scrollTo(x + dx);

  // Where each pill sits along the row, to bring the picked one into view.
  const pills = Children.toArray(children);
  const boxes = useRef([]);
  const picked = pills.findIndex((p) => p.props?.selected);
  useEffect(() => {
    const box = boxes.current[picked];
    if (!box || !width) return;
    // Clear of the end that's covered: the fade and arrow show while there's more that way.
    const left = x + (x > EDGE ? END + LEAD : 0);
    const right = x + width - (x + width < contentWidth - EDGE ? END + LEAD : 0);
    if (box.x < left) scrollTo(box.x - END - LEAD);
    else if (box.x + box.width > right) scrollTo(box.x + box.width - width + END + LEAD);
    // Only when the pick changes or the row is first measured, not as it scrolls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, width, contentWidth]);
  return (
    <View style={style}>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={contentContainerStyle}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onContentSizeChange={(w) => setContentWidth(w)}
        onScroll={track}
        onScrollEndDrag={track}
        onMomentumScrollEnd={track}
        scrollEventThrottle={16}
        {...rest}
      >
        {pills.map((pill, i) => (
          <View key={pill.key} onLayout={(e) => (boxes.current[i] = e.nativeEvent.layout)}>
            {pill}
          </View>
        ))}
      </ScrollView>
      {x > EDGE ? <Arrow side="left" onPress={() => scrollBy(-step)} /> : null}
      {x + width < contentWidth - EDGE ? <Arrow side="right" onPress={() => scrollBy(step)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  end: { position: 'absolute', top: 0, bottom: 0, flexDirection: 'row' },
  left: { left: 0 },
  right: { right: 0 },
  solid: { width: END, alignItems: 'center', justifyContent: 'center' },
  arrow: {
    width: ARROW,
    height: ARROW,
    borderRadius: ARROW / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

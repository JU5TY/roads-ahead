import { useId, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '../../hooks/useTheme';

const FADE = 56;

/** A fade from clear to the page colour, pointing `to` 'left' or 'right'. */
function Fade({ to, color }) {
  const id = `pillFade${useId().replace(/:/g, '')}`;
  return (
    <View pointerEvents="none" style={[styles.fade, to === 'right' ? styles.right : styles.left]}>
      <Svg width={FADE} height="100%">
        <Defs>
          <LinearGradient id={id} x1={to === 'right' ? 0 : 1} y1="0" x2={to === 'right' ? 1 : 0} y2="0">
            <Stop offset="0" stopColor={color} stopOpacity={0} />
            <Stop offset="1" stopColor={color} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect width={FADE} height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/**
 * A row of pills that scrolls sideways (a trip's or plan's days, Iconic Roads
 * countries). The end fades into the page while there's more to see, and the
 * start once it's been scrolled, so it's clear the row goes on. A row that fits
 * shows no fade. `style` and `contentContainerStyle` are the ScrollView's.
 */
export default function PillRow({ style, contentContainerStyle, children, ...rest }) {
  const { c } = useTheme();
  const [x, setX] = useState(0);
  const [width, setWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  return (
    <View style={style}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={contentContainerStyle}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onContentSizeChange={(w) => setContentWidth(w)}
        onScroll={(e) => setX(e.nativeEvent.contentOffset.x)}
        scrollEventThrottle={32}
        {...rest}
      >
        {children}
      </ScrollView>
      {x > 1 ? <Fade to="left" color={c.background} /> : null}
      {x + width < contentWidth - 1 ? <Fade to="right" color={c.background} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fade: { position: 'absolute', top: 0, bottom: 0, width: FADE },
  left: { left: 0 },
  right: { right: 0 },
});

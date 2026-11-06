import { useMemo } from 'react';
import { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { landPath } from '../utils/countries';

// The drawn map's colours (the share card and Home), the same in light and dark.
export const MAP_BLUE = '#174EA6';
export const MAP_LAND = '#2F6FD0';
export const MAP_PALE = '#D2E3FC';

const FADE_HEIGHT = 105;

/** Land for `fit` (from fitInBox) on a `width` x `height` drawing. */
export function useLandPath(fit, width, height) {
  return useMemo(() => (fit ? landPath(fit.project, width, height) : ''), [fit, width, height]);
}

/**
 * Inside an Svg: the land from useLandPath, fading to `fadeEnd` and staying
 * faint below it so text there stays readable.
 */
export default function DrawnLand({ path, width, height, fadeEnd }) {
  return (
    <>
      <Defs>
        <LinearGradient id="landFade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={MAP_BLUE} stopOpacity={0} />
          <Stop offset="0.25" stopColor={MAP_BLUE} stopOpacity={0.07} />
          <Stop offset="0.5" stopColor={MAP_BLUE} stopOpacity={0.25} />
          <Stop offset="0.75" stopColor={MAP_BLUE} stopOpacity={0.48} />
          <Stop offset="1" stopColor={MAP_BLUE} stopOpacity={0.65} />
        </LinearGradient>
      </Defs>
      {/* The stroke draws the coasts and borders, so a country inland still has a shape. */}
      {path ? (
        <Path d={path} fill={MAP_LAND} stroke={MAP_BLUE} strokeWidth={1} strokeLinejoin="round" />
      ) : null}
      <Rect y={fadeEnd - FADE_HEIGHT} width={width} height={FADE_HEIGHT} fill="url(#landFade)" />
      <Rect y={fadeEnd} width={width} height={height - fadeEnd} fill={MAP_BLUE} fillOpacity={0.65} />
    </>
  );
}

import { Image as ExpoImage } from 'expo-image';
import { useMemo } from 'react';
import { Animated, Image, Platform, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Polyline, Rect, Stop } from 'react-native-svg';

import { fonts } from '../../theme';
import { distanceParts, formatDurationShort } from '../../utils/format';
import { CENTRED, MAX_ZOOM, coverSize, cropTransform } from '../../utils/photoCrop';
import { countryFrame } from '../../utils/countries';
import { fitInBox, fitInCircle, pinPoint, routeSpanKm } from '../../utils/routeOutline';
import AppLogo from '../AppLogo';
import DrawnLand, { MAP_BLUE, MAP_PALE, useLandPath } from '../DrawnLand';
import FlagStack from '../countries/FlagStack';

// The card is laid out on a grid 432 wide and scaled to `width`, so the preview
// and the shared image match. Its colours stay the same in light and dark.
const WIDTH = 432;
const PAD = 28;
const GAP = 20;
const ROUTE_MARGIN = 36; // the padding, plus most of a dot's radius
// On the drawn map, a route shorter than this shows the whole country around it,
// with a pin instead if its start and end dots would sit on top of each other.
const SHORT_ROUTE_KM = 100;
const PIN_BELOW = 24;
const PHOTO_ROUTE_SIZE = 72; // on a photo: a small round drawing above the text
// The route's box ends where the text starts when it has every line, less a Story's
// wider gap. A Story keeps clear of Instagram's profile bar (the top 10% on a phone
// test; its controls sat below the image) and leaves room for shorter phones.
const FORMATS = {
  post: { height: 540, routeTop: 0, routeBottom: 300, textBottom: PAD, fadeEnd: 297, shade: [0.45, 0.68, 1] },
  story: { height: 768, routeTop: 64, routeBottom: 482, textBottom: 62, fadeEnd: 491, shade: [0.45, 0.65, 0.92] },
};
const BLUE = MAP_BLUE;
const WHITE = '#FFFFFF';
const PALE_ON_BLUE = MAP_PALE;
const PALE_ON_PHOTO = '#E8EAED';
const FLAG_COLORS = { ring: WHITE, more: '#E8F0FE', onMore: BLUE };

/**
 * Gallery photos: expo-image on iPhone (its photo library addresses), React Native's
 * on Android, whose bitmaps can be drawn into the captured image. Placed by `crop`, or
 * by `motion` while it's being dragged, once its `aspect` is known; centred until then.
 */
function Photo({ uri, aspect, crop, motion, frameWidth, frameHeight, onLoad, onError }) {
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

/**
 * One line of the route and its dots on the card's grid, or a pin when they'd be too
 * small. `small` draws them finer, for the photo card's round drawing; never a pin.
 */
function RouteLines({ segments, fit, small = false }) {
  const routes = segments.map((s) => s.coordinates).filter((r) => r.length > 1);
  if (!fit || !routes.length) return null;
  const pin = small ? null : pinPoint(fit, routes, PIN_BELOW);
  if (pin) {
    return (
      <>
        <Circle cx={pin[0]} cy={pin[1]} r={17} fill={WHITE} fillOpacity={0.25} />
        <Circle cx={pin[0]} cy={pin[1]} r={7} fill="#1A73E8" stroke={WHITE} strokeWidth={3} />
      </>
    );
  }
  const [startX, startY] = fit.project(routes[0][0]);
  const [endX, endY] = fit.project(routes.at(-1).at(-1));
  const dot = small ? { r: 3.5, strokeWidth: 1.5 } : { r: 8, strokeWidth: 3 };
  return (
    <>
      {segments
        .filter((s) => s.coordinates.length > 1)
        .map((s) => (
          <Polyline
            key={s.key}
            points={fit.points(s.coordinates)}
            fill="none"
            stroke={WHITE}
            strokeWidth={small ? 2.5 : 4}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={s.dotted ? (small ? '0.1 6' : '0.1 9') : undefined}
          />
        ))}
      <Circle cx={startX} cy={startY} fill="#1E8E3E" stroke={WHITE} {...dot} />
      <Circle cx={endX} cy={endY} fill="#D93025" stroke={WHITE} {...dot} />
    </>
  );
}

/**
 * The image that gets shared: the trip's route on a drawn map, or `photoUri` darkened
 * for the text with the route small above it, clear of the photo's subject. `format` is its shape: 'post' (4:5) or 'story' (9:16).
 * `content` comes from shareCardContent(), `segments` from useTripPreview().
 * `photoAspect` and `photoCrop` place the photo (see photoCrop.js); `photoMotion`
 * moves it instead, from usePhotoCrop().
 */
export default function ShareCard({
  content,
  segments,
  units,
  width,
  format = 'post',
  photoUri,
  photoAspect,
  photoCrop = CENTRED,
  photoMotion,
  onPhotoLoad,
  onPhotoError,
}) {
  const { height, routeTop, routeBottom, textBottom, fadeEnd, shade } = FORMATS[format];
  const u = width / WIDTH;
  const frameHeight = width * (height / WIDTH);
  const routes = useMemo(
    () => (segments ?? []).map((s) => s.coordinates).filter((r) => r.length > 1),
    [segments]
  );
  const onMap = !photoUri;
  const fit = useMemo(() => {
    if (!onMap) return null;
    const short = routeSpanKm(routes) < SHORT_ROUTE_KM;
    const framed = short ? [...routes, countryFrame(routes)] : routes;
    return fitInBox(framed, WIDTH, routeBottom - routeTop, ROUTE_MARGIN, routeTop);
  }, [routes, routeBottom, routeTop, onMap]);
  const photoFit = useMemo(
    () => (onMap ? null : fitInCircle(routes, PHOTO_ROUTE_SIZE)),
    [routes, onMap]
  );
  const land = useLandPath(fit, WIDTH, height);
  const pale = photoUri ? PALE_ON_PHOTO : PALE_ON_BLUE;
  const distance = distanceParts(content.stats.distanceM, units);
  const line = (fontFamily, fontSize, lineHeight, color, extra) => ({
    fontFamily,
    fontSize: fontSize * u,
    lineHeight: lineHeight * u,
    color,
    ...extra,
  });

  return (
    <View style={{ width, height: frameHeight, backgroundColor: BLUE, overflow: 'hidden' }}>
      {photoUri ? (
        <Photo
          uri={photoUri}
          aspect={photoAspect}
          crop={photoCrop}
          motion={photoMotion}
          frameWidth={width}
          frameHeight={frameHeight}
          onLoad={onPhotoLoad}
          onError={onPhotoError}
        />
      ) : null}
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${WIDTH} ${height}`}
        style={{ position: 'absolute' }}
        accessible={false}
      >
        <Defs>
          <LinearGradient id="photoShade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000000" stopOpacity={0.28} />
            <Stop offset={shade[0]} stopColor="#000000" stopOpacity={0.22} />
            <Stop offset={shade[1]} stopColor="#000000" stopOpacity={0.72} />
            <Stop offset={shade[2]} stopColor="#000000" stopOpacity={0.86} />
          </LinearGradient>
        </Defs>
        {photoUri ? (
          <Rect width={WIDTH} height={height} fill="url(#photoShade)" />
        ) : (
          <DrawnLand path={land} width={WIDTH} height={height} fadeEnd={fadeEnd} />
        )}
        <RouteLines segments={segments ?? []} fit={fit} />
      </Svg>

      <View style={{ position: 'absolute', left: PAD * u, right: PAD * u, bottom: textBottom * u }}>
        {photoFit ? (
          <Svg
            width={PHOTO_ROUTE_SIZE * u}
            height={PHOTO_ROUTE_SIZE * u}
            viewBox={`0 0 ${PHOTO_ROUTE_SIZE} ${PHOTO_ROUTE_SIZE}`}
            style={{ marginBottom: GAP * u }}
            accessible={false}
          >
            <Circle
              cx={PHOTO_ROUTE_SIZE / 2}
              cy={PHOTO_ROUTE_SIZE / 2}
              r={PHOTO_ROUTE_SIZE / 2}
              fill="#000000"
              fillOpacity={0.6}
            />
            <RouteLines segments={segments ?? []} fit={photoFit} small />
          </Svg>
        ) : null}
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          style={line(fonts.semibold, 13, 18, pale, { letterSpacing: 0.4 * u })}
        >
          {content.kicker}
        </Text>
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          style={line(fonts.medium, 36, 42, WHITE, { marginTop: 4 * u })}
        >
          {content.title}
        </Text>
        {content.subtitle ? (
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            style={line(fonts.regular, 16, 22, pale, { marginTop: 6 * u })}
          >
            {content.subtitle}
          </Text>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 24 * u, marginTop: GAP * u }}>
          <View>
            <Text allowFontScaling={false} style={line(fonts.medium, 22, 28, WHITE)}>
              {distance.value}
              <Text style={line(fonts.medium, 14, 28, pale)}> {distance.unit}</Text>
            </Text>
            <Text allowFontScaling={false} style={line(fonts.regular, 12, 16, pale)}>
              Distance
            </Text>
          </View>
          {content.drivingMs != null ? (
            <View>
              <Text allowFontScaling={false} style={line(fonts.medium, 22, 28, WHITE)}>
                {formatDurationShort(content.drivingMs)}
              </Text>
              <Text allowFontScaling={false} style={line(fonts.regular, 12, 16, pale)}>
                Driving time
              </Text>
            </View>
          ) : null}
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 36 * u,
            marginTop: GAP * u,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 * u }}>
            <View
              style={{
                borderRadius: 13 * u,
                borderWidth: photoUri ? 0 : 1 * u,
                borderColor: WHITE,
              }}
            >
              <AppLogo size={26 * u} />
            </View>
            <Text allowFontScaling={false} style={line(fonts.medium, 14, 20, WHITE)}>
              Roads Ahead
            </Text>
          </View>
          <FlagStack countries={content.countries} size={36 * u} colors={FLAG_COLORS} />
        </View>
      </View>
    </View>
  );
}

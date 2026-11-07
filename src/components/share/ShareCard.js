import { useMemo } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Polyline, Rect, Stop } from 'react-native-svg';

import { fonts } from '../../theme';
import { distanceParts, formatDurationShort } from '../../utils/format';
import { CENTRED } from '../../utils/photoCrop';
import { fitMap, pinPoint } from '../../utils/routeOutline';
import AppLogo from '../AppLogo';
import DrawnLand, { MAP_BLUE, MAP_PALE, useLandPath } from '../DrawnLand';
import FlagStack from '../countries/FlagStack';
import FramedPhoto from '../photos/FramedPhoto';

// The card is laid out on a grid 432 wide and scaled to `width`, so the preview
// and the shared image match. Its colours stay the same in light and dark.
const WIDTH = 432;
const PAD = 28;
const GAP = 20;
const ROUTE_MARGIN = 36; // the padding, plus most of a dot's radius
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

/** One line of the route and its dots on the card's grid, or a pin when they'd be too small. */
function RouteLines({ segments, fit }) {
  const routes = segments.map((s) => s.coordinates).filter((r) => r.length > 1);
  if (!fit || !routes.length) return null;
  const pin = pinPoint(fit, routes);
  if (pin) {
    return (
      <>
        <Circle cx={pin[0]} cy={pin[1]} r={17} fill={WHITE} fillOpacity={0.25} />
        <Circle cx={pin[0]} cy={pin[1]} r={7} fill={BLUE} stroke={WHITE} strokeWidth={3} />
      </>
    );
  }
  const [startX, startY] = fit.project(routes[0][0]);
  const [endX, endY] = fit.project(routes.at(-1).at(-1));
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
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={s.dotted ? '0.1 9' : undefined}
          />
        ))}
      <Circle cx={startX} cy={startY} r={8} fill={BLUE} stroke={WHITE} strokeWidth={3} />
      <Circle cx={endX} cy={endY} r={8} fill={BLUE} stroke={WHITE} strokeWidth={3} />
    </>
  );
}

/**
 * The image that gets shared: the trip's route on a drawn map, or `photoUri` darkened
 * for the text. `format` is its shape: 'post' (4:5) or 'story' (9:16).
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
    return fitMap(routes, WIDTH, routeBottom - routeTop, ROUTE_MARGIN, routeTop);
  }, [routes, routeBottom, routeTop, onMap]);
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
        <FramedPhoto
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

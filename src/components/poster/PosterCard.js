import { Text, View } from 'react-native';
import Svg, { Circle, Path, Polyline, Rect } from 'react-native-svg';

import { fonts } from '../../theme';
import { CENTRED } from '../../utils/photoCrop';
import {
  CIRCLE,
  CIRCLE_LINE,
  COLORS,
  IMAGE,
  MAP_LINE,
  PAGE,
  TEXT,
  textLayout,
} from '../../utils/posterLayout';
import FramedPhoto from '../photos/FramedPhoto';

const FONTS = { light: fonts.light, regular: fonts.regular };

/** The route from a poster spec's `map`, in a box `size` units across, drawn with `look`. */
function RouteDrawing({ map, look, box }) {
  if (!map) return null;
  return (
    <>
      <Rect width={box.width} height={box.height} fill={COLORS.sea} />
      {map.land ? (
        <Path d={map.land} fill={COLORS.land} stroke={COLORS.sea} strokeWidth={1} strokeLinejoin="round" />
      ) : null}
      {map.lines.map((line, i) => (
        <Polyline
          key={i}
          points={line.points}
          fill="none"
          stroke={COLORS.line}
          strokeWidth={look.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={line.dotted ? `0.1 ${look.width * 2.3}` : undefined}
        />
      ))}
      {[map.start, map.end].map((at, i) =>
        at ? <Circle key={i} cx={at[0]} cy={at[1]} r={look.dot} fill={COLORS.line} /> : null
      )}
      {map.pin ? (
        <>
          <Circle cx={map.pin[0]} cy={map.pin[1]} r={look.halo} fill={COLORS.line} fillOpacity={0.25} />
          <Circle cx={map.pin[0]} cy={map.pin[1]} r={look.dot} fill={COLORS.line} />
        </>
      ) : null}
    </>
  );
}

/** One centred line of the poster's text, its top at `top` units. */
function PosterLine({ line, style, top, u }) {
  if (!line.text) return null;
  return (
    <Text
      allowFontScaling={false}
      numberOfLines={1}
      style={{
        position: 'absolute',
        top: top * u,
        left: 0,
        right: 0,
        textAlign: 'center',
        fontFamily: FONTS[style.font],
        fontSize: line.size * u,
        lineHeight: style.line * u,
        letterSpacing: line.tracking * u,
        // Letter spacing also follows the last letter: this keeps the words centred.
        paddingLeft: line.tracking * u,
        color: style.color,
        includeFontPadding: false,
      }}
    >
      {line.text}
    </Text>
  );
}

/**
 * The printed poster from posterSpec(), `width` wide, on the same 594 x 840 layout
 * the print server uses. A photo poster also needs `photoUri`; `photoMotion` moves
 * the photo while it's being framed (from usePhotoCrop()). Paper colours, in light
 * and dark alike.
 */
export default function PosterCard({ spec, width, photoUri, photoMotion, onPhotoLoad, onPhotoError }) {
  const u = width / PAGE.width;
  const layout = textLayout(spec.edition);
  const photo = spec.photo;
  const imageWidth = IMAGE.width * u;
  const imageHeight = IMAGE.height * u;
  const ringed = CIRCLE.r + CIRCLE.ring;

  return (
    <View style={{ width, height: PAGE.height * u, backgroundColor: COLORS.paper, overflow: 'hidden' }}>
      <View
        style={{
          position: 'absolute',
          left: IMAGE.x * u,
          top: IMAGE.y * u,
          width: imageWidth,
          height: imageHeight,
          overflow: 'hidden',
          backgroundColor: COLORS.sea,
        }}
      >
        {photo ? (
          photoUri ? (
            <FramedPhoto
              uri={photoUri}
              aspect={photo.width && photo.height ? photo.width / photo.height : null}
              crop={photo.crop ?? CENTRED}
              motion={photoMotion}
              frameWidth={imageWidth}
              frameHeight={imageHeight}
              onLoad={onPhotoLoad}
              onError={onPhotoError}
            />
          ) : null
        ) : (
          <Svg width="100%" height="100%" viewBox={`0 0 ${IMAGE.width} ${IMAGE.height}`} accessible={false}>
            <RouteDrawing map={spec.map} look={MAP_LINE} box={IMAGE} />
          </Svg>
        )}
      </View>

      {photo && spec.map ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: (CIRCLE.cx - ringed) * u,
            top: (CIRCLE.cy - ringed) * u,
            width: ringed * 2 * u,
            height: ringed * 2 * u,
            borderRadius: ringed * u,
            backgroundColor: COLORS.paper,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              width: CIRCLE.r * 2 * u,
              height: CIRCLE.r * 2 * u,
              borderRadius: CIRCLE.r * u,
              overflow: 'hidden',
            }}
          >
            <Svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${CIRCLE.r * 2} ${CIRCLE.r * 2}`}
              accessible={false}
            >
              <RouteDrawing
                map={spec.map}
                look={CIRCLE_LINE}
                box={{ width: CIRCLE.r * 2, height: CIRCLE.r * 2 }}
              />
            </Svg>
          </View>
        </View>
      ) : null}

      <PosterLine line={spec.lines.title} style={TEXT.title} top={layout.title} u={u} />
      <PosterLine line={spec.lines.route} style={TEXT.route} top={layout.route} u={u} />
      <View
        style={{
          position: 'absolute',
          left: layout.rule.x * u,
          top: layout.rule.y * u,
          width: layout.rule.width * u,
          height: Math.max(1, u),
          backgroundColor: COLORS.rule,
        }}
      />
      <PosterLine line={spec.lines.footer} style={TEXT.footer} top={layout.footer} u={u} />
    </View>
  );
}

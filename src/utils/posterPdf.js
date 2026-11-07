// Draws a poster spec (from posterSpec()) as a print-ready PDF at the paper's exact
// size: shapes and text as vectors, the photo at its own resolution. Laid out from
// the same file as the preview, so the two match. Imports name their files in full
// so server/poster/scripts/render-sample.mjs can run this in Node too.
import fontkit from '@pdf-lib/fontkit';
import {
  LineCapStyle,
  LineJoinStyle,
  PDFDocument,
  appendBezierCurve,
  beginText,
  clip,
  closePath,
  concatTransformationMatrix,
  drawObject,
  endPath,
  endText,
  fill,
  fillAndStroke,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  setCharacterSpacing,
  setDashPattern,
  setFillingRgbColor,
  setFontAndSize,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingRgbColor,
  setTextMatrix,
  showText,
  stroke,
} from 'pdf-lib';

import { coverSize } from './photoCrop.js';
import {
  ARROW_EM,
  CIRCLE,
  CIRCLE_LINE,
  COLORS,
  IMAGE,
  MAP_LINE,
  PAGE,
  SIZES,
  TEXT,
  posterLines,
  textLayout,
  textWidth,
} from './posterLayout.js';
import { jpegInfo } from './jpeg.js';

const POINTS_PER_MM = 72 / 25.4;
const BEZIER_CIRCLE = 0.5523; // control points that make four curves a circle
// The font's line box, as a share of its size (hhea ascent and descent over units per em).
const ASCENT = 1932 / 2000;
const DESCENT = 572 / 2000;

const rgbOf = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const fillColor = (hex) => setFillingRgbColor(...rgbOf(hex));
const strokeColor = (hex) => setStrokingRgbColor(...rgbOf(hex));

/** "x,y x,y …" from an SVG polyline, as [[x, y], …]. */
const pairs = (points) =>
  points
    .trim()
    .split(/\s+/)
    .map((p) => p.split(',').map(Number))
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));

const polyline = (pts, close = false) => {
  if (pts.length < 2) return [];
  const ops = [moveTo(...pts[0]), ...pts.slice(1).map((p) => lineTo(...p))];
  return close ? [...ops, closePath()] : ops;
};

const circle = (cx, cy, r) => {
  const k = r * BEZIER_CIRCLE;
  return [
    moveTo(cx + r, cy),
    appendBezierCurve(cx + r, cy + k, cx + k, cy + r, cx, cy + r),
    appendBezierCurve(cx - k, cy + r, cx - r, cy + k, cx - r, cy),
    appendBezierCurve(cx - r, cy - k, cx - k, cy - r, cx, cy - r),
    appendBezierCurve(cx + k, cy - r, cx + r, cy - k, cx + r, cy),
    closePath(),
  ];
};

/** The land from landPath(): "Mx,y x,y …Z" rings, as path operators. */
const landOps = (d) =>
  d
    .split('M')
    .filter(Boolean)
    .flatMap((ring) => polyline(pairs(ring.replace('Z', ' ')), true));

/** The route drawing (see RouteDrawing in the app), in a `box` of its own units. */
function routeOps(map, look, box) {
  if (!map) return [];
  const ops = [fillColor(COLORS.sea), rectangle(0, 0, box.width, box.height), fill()];
  if (map.land) {
    ops.push(
      fillColor(COLORS.land),
      strokeColor(COLORS.sea),
      setLineWidth(1),
      setLineJoin(LineJoinStyle.Round),
      ...landOps(map.land),
      fillAndStroke()
    );
  }
  ops.push(
    strokeColor(COLORS.line),
    setLineWidth(look.width),
    setLineCap(LineCapStyle.Round),
    setLineJoin(LineJoinStyle.Round)
  );
  for (const line of map.lines) {
    ops.push(
      setDashPattern(line.dotted ? [0.1, look.width * 2.3] : [], 0),
      ...polyline(pairs(line.points)),
      stroke()
    );
  }
  ops.push(setDashPattern([], 0));
  if (map.start) {
    ops.push(
      fillColor(COLORS.sea),
      strokeColor(COLORS.line),
      setLineWidth(look.ring),
      ...circle(map.start[0], map.start[1], look.start),
      fillAndStroke()
    );
  }
  if (map.end) ops.push(fillColor(COLORS.line), ...circle(map.end[0], map.end[1], look.end), fill());
  if (map.pin) {
    ops.push(
      pushGraphicsState(),
      fillColor(blend(COLORS.sea, COLORS.line, 0.25)),
      ...circle(map.pin[0], map.pin[1], look.halo),
      fill(),
      popGraphicsState(),
      fillColor(COLORS.pin),
      strokeColor(COLORS.line),
      setLineWidth(look.ring),
      ...circle(map.pin[0], map.pin[1], look.pin),
      fillAndStroke()
    );
  }
  return ops;
}

/** `top` at `share` opacity over `bottom`, as one colour: the pin's halo sits on the sea. */
function blend(bottom, top, share) {
  const [a, b] = [rgbOf(bottom), rgbOf(top)];
  const mix = a.map((v, i) => Math.round((v * (1 - share) + b[i] * share) * 255));
  return `#${mix.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The cm matrix that draws a photo XObject (a unit square) into the box at `left`,
 * `top`, `width` x `height` on a y-down page, turned upright for its EXIF orientation.
 */
function photoMatrix(orientation, left, top, width, height) {
  switch (orientation) {
    case 3:
    case 4:
      return [-width, 0, 0, height, left + width, top];
    case 5:
    case 6:
      return [0, height, width, 0, left, top];
    case 7:
    case 8:
      return [0, -height, -width, 0, left + width, top + height];
    default:
      return [width, 0, 0, -height, left, top + height];
  }
}

/**
 * The PDF for `spec`, as bytes. `fonts` holds the Light and Regular TTF files;
 * `photo` is the photo poster's JPEG or PNG file.
 */
export async function renderPoster({ spec, fonts, photo }) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(spec.lines.title.text || 'Roads Ahead poster');
  doc.setCreator('Roads Ahead');
  const embedded = {
    light: await doc.embedFont(fonts.light, { subset: true }),
    regular: await doc.embedFont(fonts.regular, { subset: true }),
  };

  const [widthMm, heightMm] = SIZES[spec.size].mm;
  const pageWidth = widthMm * POINTS_PER_MM;
  const pageHeight = heightMm * POINTS_PER_MM;
  const page = doc.addPage([pageWidth, pageHeight]);
  const k = pageWidth / PAGE.width; // points per layout unit
  // Everything but text is drawn in layout units, y down, as in the app.
  const layoutSpace = concatTransformationMatrix(k, 0, 0, -k, 0, pageHeight);

  const ops = [
    pushGraphicsState(),
    layoutSpace,
    fillColor(COLORS.paper),
    rectangle(0, 0, PAGE.width, PAGE.height),
    fill(),
  ];

  // The map, or the photo framed as it was in the app.
  ops.push(
    pushGraphicsState(),
    rectangle(IMAGE.x, IMAGE.y, IMAGE.width, IMAGE.height),
    clip(),
    endPath(),
    concatTransformationMatrix(1, 0, 0, 1, IMAGE.x, IMAGE.y)
  );
  if (spec.edition === 'photo') {
    const info = photo.type === 'png' ? null : jpegInfo(photo.bytes);
    const image =
      photo.type === 'png' ? await doc.embedPng(photo.bytes) : await doc.embedJpg(photo.bytes);
    const sideways = info && info.orientation >= 5;
    const [shownW, shownH] = sideways ? [image.height, image.width] : [image.width, image.height];
    const cover = coverSize(shownW / shownH, IMAGE.width, IMAGE.height);
    const { zoom, x, y } = spec.photo.crop;
    const width = cover.width * zoom;
    const height = cover.height * zoom;
    const left = IMAGE.width / 2 - x * width;
    const top = IMAGE.height / 2 - y * height;
    const name = page.node.newXObject('Photo', image.ref);
    ops.push(
      fillColor(COLORS.sea),
      rectangle(0, 0, IMAGE.width, IMAGE.height),
      fill(),
      pushGraphicsState(),
      concatTransformationMatrix(...photoMatrix(info?.orientation ?? 1, left, top, width, height)),
      drawObject(name),
      popGraphicsState()
    );
  } else {
    ops.push(...routeOps(spec.map, MAP_LINE, IMAGE));
  }
  ops.push(popGraphicsState());

  // The photo poster's route circle, in its white ring over the photo's edge.
  if (spec.edition === 'photo' && spec.map) {
    const d = CIRCLE.r * 2;
    ops.push(
      fillColor(COLORS.paper),
      ...circle(CIRCLE.cx, CIRCLE.cy, CIRCLE.r + CIRCLE.ring),
      fill(),
      pushGraphicsState(),
      ...circle(CIRCLE.cx, CIRCLE.cy, CIRCLE.r),
      clip(),
      endPath(),
      concatTransformationMatrix(1, 0, 0, 1, CIRCLE.cx - CIRCLE.r, CIRCLE.cy - CIRCLE.r),
      ...routeOps(spec.map, CIRCLE_LINE, { width: d, height: d }),
      popGraphicsState()
    );
  }

  // The rule between the route line and the footer.
  const layout = textLayout(spec.edition);
  ops.push(
    fillColor(COLORS.rule),
    rectangle(layout.rule.x, layout.rule.y, layout.rule.width, 1),
    fill(),
    popGraphicsState()
  );

  // The text, laid out from its words.
  const lines = posterLines({
    title: spec.lines.title.text,
    route: spec.lines.route.text,
    footer: spec.lines.footer.text,
  });
  for (const [key, top] of [
    ['title', layout.title],
    ['route', layout.route],
    ['footer', layout.footer],
  ]) {
    ops.push(...textOps(page, embedded, lines[key], TEXT[key], top, k, pageHeight));
  }

  page.pushOperators(...ops);
  return doc.save();
}

/**
 * One centred line of text at `top` layout units, in points. Characters the font
 * lacks are left out, and "→" is drawn as a line with an arrowhead.
 */
function textOps(page, embedded, line, style, top, k, pageHeight) {
  const font = embedded[style.font];
  const known = new Set(font.getCharacterSet());
  const text = [...line.text].filter((ch) => ch === '→' || known.has(ch.codePointAt(0))).join('');
  if (!text.trim()) return [];
  const sized = { ...line, font: style.font };
  const baseline = top + (style.line - (ASCENT + DESCENT) * line.size) / 2 + ASCENT * line.size;
  const fontName = page.node.newFontDictionary(font.name, font.ref);
  const y = pageHeight - baseline * k;
  let x = PAGE.width / 2 - textWidth(text, sized) / 2;

  const ops = [pushGraphicsState(), fillColor(style.color), strokeColor(style.color)];
  for (const [i, part] of text.split('→').entries()) {
    if (i > 0) {
      // The arrow, centred on the capitals' middle.
      const size = line.size;
      const mid = baseline - size * 0.36;
      const from = x + size * 0.08;
      const to = x + size * (ARROW_EM - 0.08);
      const head = size * 0.22;
      const pt = (px, py) => [px * k, pageHeight - py * k];
      ops.push(
        setLineWidth(size * 0.065 * k),
        setLineCap(LineCapStyle.Round),
        setLineJoin(LineJoinStyle.Round),
        moveTo(...pt(from, mid)),
        lineTo(...pt(to, mid)),
        moveTo(...pt(to - head, mid - head)),
        lineTo(...pt(to, mid)),
        lineTo(...pt(to - head, mid + head)),
        stroke()
      );
      x += size * ARROW_EM + line.tracking;
    }
    if (!part) continue;
    ops.push(
      beginText(),
      setFontAndSize(fontName, line.size * k),
      setCharacterSpacing(line.tracking * k),
      setTextMatrix(1, 0, 0, 1, x * k, y),
      showText(font.encodeText(part)),
      endText()
    );
    x += textWidth(part, sized) + line.tracking;
  }
  ops.push(popGraphicsState());
  return ops;
}

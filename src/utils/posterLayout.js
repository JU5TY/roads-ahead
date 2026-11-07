// The printed poster's layout, shared by the app's preview and the print server
// (server/poster), so both draw the same thing. It's laid out on A3 at 2 units a
// millimetre, 594 x 840; A2 has the same shape, so it's the same layout scaled up.
// Plain data and maths only: the server imports this file as it is.

export const PAGE = { width: 594, height: 840 };
// The map or photo, with a white margin round three sides and the text below.
export const IMAGE = { x: 30, y: 30, width: 534, height: 553 };
// The photo poster's route circle, centred on the photo's bottom edge, in a white ring.
export const CIRCLE = { cx: 297, cy: 583, r: 60, ring: 5 };

export const COLORS = {
  paper: '#FFFFFF',
  title: '#202124',
  route: '#3C4043',
  rule: '#BDC1C6',
  footer: '#5F6368',
  sea: '#174EA6',
  land: '#2F6FD0',
  line: '#FFFFFF',
};

// The route on the map, and in the circle (both drawn in their own box's units). Its
// start and finish, and a short drive's dot, are solid white like the line.
export const MAP_LINE = { width: 3.7, dot: 7, halo: 21 };
export const CIRCLE_LINE = { width: 2.5, dot: 3, halo: 8 };

// Prices are in pence. The server charges its own copy of these, never the app's.
export const SIZES = {
  A3: { label: 'A3', pence: 3999, price: '£39.99', mm: [297, 420] },
  A2: { label: 'A2', pence: 4999, price: '£49.99', mm: [420, 594] },
};

// The text block, centred under the image. `tracking` is letter spacing, in units.
export const TEXT = {
  title: { font: 'light', size: 32, line: 40, tracking: 11, color: COLORS.title },
  route: { font: 'regular', size: 13, line: 18, tracking: 3, color: COLORS.route },
  footer: { font: 'regular', size: 11, line: 18, tracking: 2, color: COLORS.footer },
};
const RULE = { width: 36, gap: 18 };
const ROUTE_GAP = 14;
const FOOTER_GAP = 16;
const TEXT_WIDTH = 494; // 20 in from the image's edges
// Space kept above and below the text: the photo poster leaves room for its circle.
const PADDING = { route: [0, 10], photo: [56, 6] };

/** Where each line of text starts, top down, for 'route' or 'photo'. */
export function textLayout(edition) {
  const top = IMAGE.y + IMAGE.height;
  const [padTop, padBottom] = PADDING[edition];
  const block =
    TEXT.title.line + ROUTE_GAP + TEXT.route.line + RULE.gap + 1 + FOOTER_GAP + TEXT.footer.line;
  const title = top + padTop + (PAGE.height - top - padTop - padBottom - block) / 2;
  const route = title + TEXT.title.line + ROUTE_GAP;
  const rule = route + TEXT.route.line + RULE.gap;
  return {
    title,
    route,
    rule: { x: (PAGE.width - RULE.width) / 2, y: rule, width: RULE.width },
    footer: rule + 1 + FOOTER_GAP,
  };
}

// Advance widths in thousandths of an em, from the app's Google Sans Flex files, for
// capitals and the characters around them. The font has no arrow, so "→" is drawn.
const GLYPHS =
  ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`{|}~ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞ·–—’‘“”ŁŚŻŹĆŃŞŢĂȘȚŐŰŒ';
const WIDTHS = {
  light: [
    223, 302, 324, 635, 590, 816, 634, 184, 330, 330, 416, 554, 228, 334, 228, 300, 640, 358, 525,
    534, 582, 555, 559, 499, 552, 559, 228, 228, 554, 554, 554, 492, 887, 660, 595, 726, 696, 528,
    508, 785, 686, 228, 524, 616, 492, 844, 694, 815, 558, 815, 580, 544, 526, 644, 622, 926, 616,
    584, 558, 358, 300, 358, 468, 557, 446, 366, 241, 366, 554, 660, 660, 660, 660, 660, 660, 938,
    726, 528, 528, 528, 528, 228, 228, 228, 228, 696, 694, 815, 815, 815, 815, 815, 815, 644, 644,
    644, 644, 584, 558, 228, 557, 891, 228, 228, 374, 374, 500, 544, 558, 558, 726, 694, 544, 526,
    660, 544, 526, 815, 644, 1151,
  ],
  regular: [
    244, 316, 386, 667, 628, 856, 656, 226, 342, 342, 450, 578, 266, 367, 266, 334, 670, 388, 548,
    557, 596, 570, 580, 516, 573, 580, 266, 266, 578, 578, 578, 486, 907, 698, 638, 752, 738, 582,
    552, 815, 734, 274, 542, 648, 536, 906, 740, 847, 608, 847, 631, 586, 576, 692, 668, 966, 644,
    624, 589, 399, 334, 399, 500, 612, 489, 410, 264, 410, 578, 698, 698, 698, 698, 698, 698, 979,
    752, 582, 582, 582, 582, 274, 274, 274, 274, 738, 740, 847, 847, 847, 847, 847, 847, 692, 692,
    692, 692, 624, 608, 266, 612, 978, 266, 266, 436, 436, 540, 586, 589, 589, 752, 740, 586, 576,
    698, 586, 576, 847, 692, 1182,
  ],
};
export const ARROW_EM = 0.9; // how wide the drawn "→" is
const UNKNOWN_EM = 0.66; // a capital's average, for anything not listed

const advances = {};
const advanceOf = (font, ch) => {
  if (ch === '→') return ARROW_EM;
  if (!advances[font]) {
    advances[font] = new Map([...GLYPHS].map((g, i) => [g, WIDTHS[font][i] / 1000]));
  }
  return advances[font].get(ch) ?? UNKNOWN_EM;
};

/** How wide `text` is drawn, in units, from its first letter to its last. */
export function textWidth(text, { font, size, tracking }) {
  const chars = [...text];
  if (!chars.length) return 0;
  const glyphs = chars.reduce((sum, ch) => sum + advanceOf(font, ch) * size, 0);
  return glyphs + tracking * (chars.length - 1);
}

/** `style` shrunk, letter spacing and all, until `text` fits across the poster. */
export function fitText(text, style) {
  const width = textWidth(text, style);
  if (width <= TEXT_WIDTH) return style;
  const scale = TEXT_WIDTH / width;
  const round = (n) => Math.floor(n * 100) / 100;
  return { ...style, size: round(style.size * scale), tracking: round(style.tracking * scale) };
}

/** The poster's three lines, in capitals, each sized to fit. */
export function posterLines({ title, route, footer }) {
  const line = (text, style) => {
    const upper = (text ?? '').toUpperCase();
    return { text: upper, ...fitText(upper, style) };
  };
  return {
    title: line(title, TEXT.title),
    route: line(route, TEXT.route),
    footer: line(footer, TEXT.footer),
  };
}

/** Millimetres per layout unit when printed at `size` ('A3' or 'A2'). */
export const mmPerUnit = (size) => SIZES[size].mm[0] / PAGE.width;

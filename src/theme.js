// Google-style look: one blue accent, white cards on a light grey page, in
// light and dark. Screens read the palette for the current appearance through
// useTheme() (src/hooks/useTheme.js); the You screen can pin light or dark.
const light = {
  background: '#F8F9FA', // the page behind cards
  card: '#FFFFFF', // cards, rows groups, sheets
  surface: '#FFFFFF', // stat tiles and other card-like blocks
  surfaceLow: '#FFFFFF',
  track: '#E8EAED', // segmented switch, search button, chips at rest
  outline: '#DADCE0',
  outlineStrong: '#80868B', // switch track when off
  divider: '#E8EAED',
  text: '#202124',
  textStrong: '#202124', // the big live distance on Record
  textMuted: '#5F6368',
  accent: '#1A73E8',
  onAccent: '#FFFFFF',
  accentContainer: '#E8F0FE', // blue tint: icon wells, Recording row, Premium
  onAccentContainer: '#174EA6',
  accentContainerMuted: '#3B5BA0',
  accentWell: '#D2E3FC', // icon circles on the blue Premium card
  // Iconic Roads keep their own teal so completions stand out from the blue UI.
  roadContainer: '#CDEFE9',
  onRoadContainer: '#00201C',
  roadContainerMuted: '#005047',
  ringTrack: '#D5F2EC', // Iconic Roads progress ring
  ringFill: '#1EB59F',
  ringNumber: '#00796B',
  roadBadge: '#00796B', // round badge behind a completed road's tick (road page, Drive saved)
  onRoadBadge: '#FFFFFF',
  roadHalo: '#1EB59F', // ring around the Drive saved badge
  // Stat cards: white with a blue number (Driving time adds a blue icon well).
  statAccent: '#FFFFFF',
  onStatAccent: '#1A73E8',
  statAccentIcon: '#1A73E8',
  statAccentIconWell: '#E8F0FE',
  warningContainer: '#FEEFC3',
  onWarningContainer: '#5F3B00',
  breakDue: '#E8710A', // Record's break bar once a break is due
  stop: '#D93025',
  onStop: '#FFFFFF',
  start: '#1E8E3E',
  finish: '#D93025',
  // Drawn maps (Your map, route thumbnails).
  mapLand: '#EEF2EC',
  heroMapLand: '#EEF2EC', // Home's round map, on the page
  mapRoad: '#FFFFFF',
  progressTrack: '#E3E5E8',
  outlinedRow: '#FFFFFF', // not-yet Iconic Road rows
  screen: '#FFFFFF', // full-screen pages without cards (Record, Drive saved)
  recordControl: '#E8EAED', // Record's round Maps / Hide map buttons and break track
  onRecordControl: '#202124',
  recordingPill: '#FCE8E6',
  onRecordingPill: '#A50E0E',
  floating: '#FFFFFF', // round buttons over the map, the Record pill
  navBar: '#FFFFFF',
  navBorder: '#E3E5E8',
  navPill: 'transparent',
  onNavPill: '#1A73E8',
  scrim: 'rgba(0,0,0,0.32)',
  // Light cards float on a soft shadow; dark cards are just lighter grey.
  cardShadow: {
    shadowColor: '#3C4043',
    shadowOpacity: 0.22,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  dayColors: ['#F29900', '#E52592', '#9334E6'],
  // Number badges in the Drives list: [background, text] per day colour.
  dayBadges: [
    ['#FEEFC3', '#5F3B00'],
    ['#FDE7F3', '#7A0D4A'],
    ['#F3E8FD', '#3B0A6B'],
  ],
};

const dark = {
  background: '#202124',
  card: '#2C2D31',
  surface: '#2C2D31',
  surfaceLow: '#2C2D31',
  track: '#3C4043',
  outline: '#44474A',
  outlineStrong: '#9AA0A6',
  divider: '#3C4043',
  text: '#E8EAED',
  textStrong: '#FFFFFF',
  textMuted: '#BDC1C6',
  accent: '#8AB4F8',
  onAccent: '#062E6F',
  accentContainer: '#283A55',
  onAccentContainer: '#D2E3FC',
  accentContainerMuted: '#A8C7FA',
  accentWell: '#2F4A73',
  roadContainer: '#0F3B36',
  onRoadContainer: '#A6F2E5',
  roadContainerMuted: '#7FD3C6',
  ringTrack: '#0F3B36',
  ringFill: '#5CD5C4',
  ringNumber: '#7FD3C6',
  roadBadge: '#5CD5C4',
  onRoadBadge: '#003731',
  roadHalo: '#3DDBB8',
  statAccent: '#2C2D31',
  onStatAccent: '#8AB4F8',
  statAccentIcon: '#8AB4F8',
  statAccentIconWell: '#283A55',
  warningContainer: '#3D3214',
  onWarningContainer: '#FDD663',
  breakDue: '#FCAD70',
  stop: '#F28B82',
  onStop: '#601410',
  start: '#34A853',
  finish: '#EA4335',
  mapLand: '#1C2226',
  heroMapLand: '#2C2D31', // the card colour, so the circle stands out on the page
  mapRoad: '#2C343A',
  progressTrack: '#3A3B3F',
  outlinedRow: '#26272B',
  screen: '#202124',
  recordControl: '#35363A',
  onRecordControl: '#FFFFFF',
  recordingPill: '#4A1C1A',
  onRecordingPill: '#F6AEA9',
  floating: '#35363A',
  navBar: '#2C2D31',
  navBorder: '#2C2D31',
  navPill: 'transparent',
  onNavPill: '#8AB4F8',
  scrim: 'rgba(0,0,0,0.5)',
  cardShadow: null,
  dayColors: ['#FDD663', '#FF8BCB', '#C58AF9'],
  dayBadges: [
    ['#3D3214', '#FDD663'],
    ['#4A1F35', '#FFB3DC'],
    ['#33204A', '#D7AEFB'],
  ],
};

export const palettes = { light, dark };

/** Route colour for day N of a trip; repeats after three days. */
export const dayColorFor = (palette, dayNumber) =>
  palette.dayColors[(dayNumber - 1) % palette.dayColors.length];

/** [background, text] of day N's number badge. */
export const dayBadgeFor = (palette, dayNumber) =>
  palette.dayBadges[(dayNumber - 1) % palette.dayBadges.length];

// Google Sans Flex, one static file per weight (loaded in src/app/_layout.js).
// Set fontFamily only, never fontWeight, or Android falls back to the system font.
export const fonts = {
  regular: 'GoogleSansFlex-Regular', // 400: titles, body
  medium: 'GoogleSansFlex-Medium', // 500: labels, numbers, buttons
  semibold: 'GoogleSansFlex-SemiBold', // 600: the caps date line
  strong: 'GoogleSansFlex-Medium',
  bold: 'GoogleSansFlex-SemiBold',
  display: 'GoogleSansFlex-Display', // 500 cut for large sizes: hero numbers
};

export const fontFiles = {
  [fonts.regular]: require('../assets/fonts/GoogleSansFlex-Regular.ttf'),
  [fonts.medium]: require('../assets/fonts/GoogleSansFlex-Medium.ttf'),
  [fonts.semibold]: require('../assets/fonts/GoogleSansFlex-SemiBold.ttf'),
  [fonts.display]: require('../assets/fonts/GoogleSansFlex-Display.ttf'),
};

// Text styles, without colour.
export const type = {
  hero: { fontFamily: fonts.display, fontSize: 96, lineHeight: 100, letterSpacing: -2 },
  display: { fontFamily: fonts.display, fontSize: 64, lineHeight: 68, letterSpacing: -1.5 },
  headline: { fontFamily: fonts.regular, fontSize: 32, lineHeight: 40 },
  title: { fontFamily: fonts.regular, fontSize: 28, lineHeight: 34 },
  section: { fontFamily: fonts.medium, fontSize: 18, lineHeight: 24 },
  // Uppercase group labels on Home, Trips and You ("LATEST TRIP").
  overline: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, letterSpacing: 0.8 },
  statLarge: { fontFamily: fonts.medium, fontSize: 32, lineHeight: 38, letterSpacing: -0.3 },
  stat: { fontFamily: fonts.medium, fontSize: 28, lineHeight: 34 },
  statUnit: { fontFamily: fonts.medium, fontSize: 15 },
  bodyLarge: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
  label: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  button: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 20 },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  smallStrong: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  caps: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.4 },
  // The blue caps line above a title ("DAY 1 · MON 3 NOV").
  kicker: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, letterSpacing: 0.4 },
  nav: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 },
  navActive: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 },
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export const radius = { sm: 6, md: 12, lg: 12, card: 12, pill: 999 };

/**
 * Buttons that float over the bottom of a scrolling page, and the room the
 * page leaves under its last item so they never cover it: how high the button
 * sits, its height, and a 16 gap. The Record pill floats over Home and Trips
 * (above the nav).
 */
export const floating = {
  recordPill: { lift: 16, height: 56 },
};
export const bottomSpace = {
  recordPill: floating.recordPill.lift + floating.recordPill.height + 16,
};

import Svg, { Circle, Path } from 'react-native-svg';

// The app icon's colours, the same in light and dark.
const BLUE = '#1A73E8';
const WHITE = '#FFFFFF';

/** The app icon's winding-road mark, white on a blue circle. */
export default function AppLogo({ size }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" accessibilityLabel="Roads Ahead">
      <Circle cx="512" cy="512" r="512" fill={BLUE} />
      <Path
        d="M460 282 L556 300 Q600 309 600 346 Q600 383 556 392 L372 427 Q333 435 333 475 Q333 515 372 522 L704 585 Q745 593 745 633 Q745 673 704 681 L268 763"
        fill="none"
        stroke={WHITE}
        strokeWidth={66}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="460" cy="280" r="54" fill={WHITE} />
    </Svg>
  );
}

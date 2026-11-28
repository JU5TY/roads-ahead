import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '../hooks/useTheme';

import { APP_NAME } from '../utils/appName';

// The app icon's colours, for pictures that look the same in any theme (share cards).
const BLUE = '#1A73E8';
const WHITE = '#FFFFFF';

/**
 * The app icon's winding-road mark, white on a blue circle. `themed` follows the
 * theme's accent instead, as the website does: the same in light, and a light
 * blue circle with a navy road in dark, which stands out without a rim.
 */
export default function AppLogo({ size, themed = false }) {
  const { c } = useTheme();
  const disc = themed ? c.accent : BLUE;
  const road = themed ? c.onAccent : WHITE;
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" accessibilityLabel={APP_NAME}>
      <Circle cx="512" cy="512" r="512" fill={disc} />
      <Path
        d="M460 282 L556 300 Q600 309 600 346 Q600 383 556 392 L372 427 Q333 435 333 475 Q333 515 372 522 L704 585 Q745 593 745 633 Q745 673 704 681 L268 763"
        fill="none"
        stroke={road}
        strokeWidth={66}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="460" cy="280" r="54" fill={road} />
    </Svg>
  );
}

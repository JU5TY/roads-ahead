import { useMemo } from 'react';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { useTheme } from '../hooks/useTheme';
import { fitInCircle } from '../utils/routeOutline';

/**
 * Round flat map of routes, fitted inside a `size` circle (Home's Your map).
 * lines: [{ coordinates, color, opacity?, width?, dotted? }], drawn in order.
 */
export default function RouteCircle({ size, lines }) {
  const { c } = useTheme();

  const points = useMemo(() => {
    const fit = fitInCircle(
      lines.map((l) => l.coordinates),
      size
    );
    if (!fit) return [];
    return lines
      .filter((l) => l.coordinates.length > 1)
      .map((l) => ({ ...l, points: fit.points(l.coordinates) }));
  }, [lines, size]);

  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={c.heroMapLand} />
      {points.map((l, i) => (
        <Polyline
          key={i}
          points={l.points}
          fill="none"
          stroke={l.color}
          strokeOpacity={l.opacity ?? 1}
          strokeWidth={l.width ?? 3}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={l.dotted ? '0.1 7' : undefined}
        />
      ))}
    </Svg>
  );
}

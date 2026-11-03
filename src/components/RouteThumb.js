import { useMemo } from 'react';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { useTheme } from '../hooks/useTheme';
import { fitInCircle } from '../utils/routeOutline';

/**
 * Round route thumbnail for the Trips list: the trip's outline, coloured by day,
 * with a green start and a red end. A plain drawing rather than a map, so a long
 * list stays light and nothing loads from the network.
 * segments: [{ key, coordinates, color, dotted? }] (dotted: a ferry or tunnel)
 */
export default function RouteThumb({ segments, size = 56 }) {
  const { c } = useTheme();
  const drawn = useMemo(() => {
    const routes = segments.map((s) => s.coordinates).filter((r) => r.length > 1);
    const fit = fitInCircle(routes, size);
    if (!fit) return null;
    return {
      lines: segments
        .filter((s) => s.coordinates.length > 1)
        .map((s) => ({
          key: s.key,
          color: s.color,
          dotted: s.dotted,
          points: fit.points(s.coordinates),
        })),
      start: fit.project(routes[0][0]),
      end: fit.project(routes.at(-1).at(-1)),
    };
  }, [segments, size]);

  return (
    <Svg width={size} height={size} accessible={false}>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={c.mapLand} />
      {drawn?.lines.map((l) => (
        <Polyline
          key={l.key}
          points={l.points}
          fill="none"
          stroke={l.color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={l.dotted ? '0.1 4' : undefined}
        />
      ))}
      {drawn ? (
        <>
          <Circle
            cx={drawn.start[0]}
            cy={drawn.start[1]}
            r={3}
            fill={c.start}
            stroke={c.mapRoad}
            strokeWidth={1}
          />
          <Circle
            cx={drawn.end[0]}
            cy={drawn.end[1]}
            r={3}
            fill={c.finish}
            stroke={c.mapRoad}
            strokeWidth={1}
          />
        </>
      ) : null}
    </Svg>
  );
}

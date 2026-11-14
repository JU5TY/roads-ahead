import { View } from 'react-native';

import { useTheme } from '../hooks/useTheme';
import Icon from './ui/Icon';

/**
 * The Iconic Road mark: a teal round badge with the mountain, sitting on the
 * corner of a route thumbnail (20) or the edge of a card's map (32). `ring` is
 * the colour behind it, so it reads as cut out. The parent places it with `style`.
 */
export default function RoadBadge({ ring, size = 20, style }) {
  const { c } = useTheme();
  const border = size > 24 ? 3 : 2;
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: border,
          borderColor: ring,
          backgroundColor: c.roadBadge,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Icon name="landscape" filled size={Math.round(size * 0.62)} color={c.onRoadBadge} />
    </View>
  );
}

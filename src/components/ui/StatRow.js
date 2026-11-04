import { View } from 'react-native';

import StatCard from './StatCard';

/**
 * Stat tiles side by side, the Trip/Record tiles: icon, number (unit in grey), label.
 * `stats` is [{ icon, value, unit?, label }], kept to two so the numbers never squash.
 */
export default function StatRow({ stats, style }) {
  return (
    <View style={[styles.row, style]}>
      {stats.map(({ icon, value, unit, label }) => (
        <StatCard
          key={label}
          icon={icon}
          value={value}
          unit={unit}
          label={label}
          style={styles.tile}
        />
      ))}
    </View>
  );
}

const styles = {
  row: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, minWidth: 0 },
};

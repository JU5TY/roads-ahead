import { Text, View } from 'react-native';

import { useStyles } from '../../hooks/useTheme';
import { radius, type } from '../../theme';
import { formatDistance } from '../../utils/format';
import SectionHeader from '../ui/SectionHeader';
import Flag from './Flag';

/**
 * "Countries" section: a row per country with its flag, where or when it was
 * driven, and the distance in it. `rows` come from countryRows(); `scope` is
 * "drive" or "trip" for the subtitle ("2 on this drive"). Hidden for one country.
 */
export default function CountriesSection({ rows, units, scope }) {
  const styles = useStyles(makeStyles);
  if (rows.length < 2) return null;
  return (
    <>
      <SectionHeader title="Countries" subtitle={`${rows.length} on this ${scope}`} />
      <View style={styles.group}>
        {rows.map((row, i) => (
          <View key={row.code} style={[styles.row, i < rows.length - 1 && styles.divider]}>
            <Flag flag={row.flag} width={32} />
            <View style={styles.flex}>
              <Text style={[type.bodyStrong, styles.text]} numberOfLines={1}>
                {row.name}
              </Text>
              {row.subtitle ? (
                <Text style={[type.small, styles.muted]} numberOfLines={1}>
                  {row.subtitle}
                </Text>
              ) : null}
            </View>
            <Text style={[type.bodyStrong, styles.text]}>
              {formatDistance(row.distanceM, units, row.distanceM < 16000 ? 1 : 0)}
            </Text>
          </View>
        ))}
      </View>
    </>
  );
}

const makeStyles = (c) => ({
  group: {
    paddingHorizontal: 12,
    borderRadius: radius.card,
    backgroundColor: c.card,
    ...c.cardShadow,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 60,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: c.divider },
  flex: { flex: 1, minWidth: 0 },
  text: { color: c.text },
  muted: { color: c.textMuted },
});

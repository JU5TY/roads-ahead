import { Text, View } from 'react-native';

import { useStyles } from '../../hooks/useTheme';
import { radius, type } from '../../theme';
import { formatDistance } from '../../utils/format';
import SectionHeader from '../ui/SectionHeader';
import Flag from './Flag';

/**
 * The card of country rows: flag, name, a line under it (where or when it was
 * driven) and the distance in it. `rows` are { code, flag, name, subtitle,
 * distanceM }. Shared by a trip's Countries section and Home's Countries card.
 */
export function CountryRows({ rows, units }) {
  const styles = useStyles(makeStyles);
  return (
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
          <Text style={[type.bodyStrong, styles.text]}>{formatDistance(row.distanceM, units)}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * "Countries" section: a row per country with its flag, where or when it was
 * driven, and the distance in it. `rows` come from countryRows(); `scope` is
 * "drive" or "trip" for the subtitle ("2 on this drive"). Hidden for one country.
 */
export default function CountriesSection({ rows, units, scope }) {
  if (rows.length < 2) return null;
  return (
    <>
      <SectionHeader title="Countries" subtitle={`${rows.length} on this ${scope}`} />
      <CountryRows rows={rows} units={units} />
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

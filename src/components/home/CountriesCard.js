import { useMemo } from 'react';
import { Text, View } from 'react-native';

import { useStyles } from '../../hooks/useTheme';
import { radius, type } from '../../theme';
import { summarizeCountries } from '../../utils/countries';
import { formatMonthYear } from '../../utils/format';
import Flag from '../countries/Flag';
import SectionHeader from '../ui/SectionHeader';

/**
 * Home's Countries card: the flags of every country you've driven in, like
 * stamps in a passport, three to a row in the order you first drove them, each
 * with its name and that month ("Jan 2026"). The count is in the title.
 */
export default function CountriesCard({ trips }) {
  const styles = useStyles(makeStyles);
  const countries = useMemo(
    () =>
      summarizeCountries(
        trips
          .flatMap((t) => t.drives)
          .sort((a, b) => a.startedAt - b.startedAt)
          .flatMap((d) => (d.countries ?? []).map((v) => ({ ...v, startedAt: d.startedAt })))
      ),
    [trips]
  );
  // Nothing to show until past drives have been checked.
  if (countries.length === 0) return null;
  return (
    <>
      <SectionHeader title="Countries" count={countries.length} />
      <View style={styles.card}>
        {countries.map((country) => (
          <View key={country.code} style={styles.stamp}>
            <Flag flag={country.flag} width={52} />
            <Text style={[type.label, styles.name]} numberOfLines={1}>
              {country.name}
            </Text>
            <Text style={[type.small, styles.muted]}>{formatMonthYear(country.visits[0].startedAt)}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

const makeStyles = (c) => ({
  card: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 18,
    paddingVertical: 20,
    paddingHorizontal: 12,
    borderRadius: radius.card,
    backgroundColor: c.card,
    ...c.cardShadow,
  },
  // Three to a row.
  stamp: { width: '33.33%', alignItems: 'center', paddingHorizontal: 4 },
  name: { color: c.text, marginTop: 8 },
  muted: { color: c.textMuted, marginTop: 1 },
});

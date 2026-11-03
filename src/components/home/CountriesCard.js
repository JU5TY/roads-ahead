import { useMemo } from 'react';
import { Text, View } from 'react-native';

import { useStyles } from '../../hooks/useTheme';
import { type } from '../../theme';
import { summarizeCountries } from '../../utils/countries';
import Flag from '../countries/Flag';
import SectionHeader from '../ui/SectionHeader';

/** Home's Countries card: how many countries you've driven in, with their flags. */
export default function CountriesCard({ trips }) {
  const styles = useStyles(makeStyles);
  const countries = useMemo(
    () =>
      summarizeCountries(
        trips
          .flatMap((t) => t.drives)
          .sort((a, b) => a.startedAt - b.startedAt)
          .flatMap((d) => d.countries ?? [])
      ),
    [trips]
  );
  // Nothing to show until past drives have been checked.
  if (countries.length === 0) return null;
  return (
    <>
      <SectionHeader variant="overline" title="Countries" />
      <View style={styles.card}>
        <View style={styles.count}>
          <Text style={[type.stat, styles.number]}>{countries.length}</Text>
          <Text style={[type.bodyLarge, styles.muted]}>
            {countries.length === 1 ? 'country driven' : 'countries driven'}
          </Text>
        </View>
        <View style={styles.flags}>
          {countries.map((country) => (
            <View key={country.code} style={styles.flag}>
              <Flag flag={country.flag} width={44} />
              <Text style={[type.small, styles.muted]} numberOfLines={1}>
                {country.name}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </>
  );
}

const makeStyles = (c) => ({
  card: { padding: 20, borderRadius: 12, backgroundColor: c.card, ...c.cardShadow },
  count: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  number: { color: c.text },
  muted: { color: c.textMuted },
  flags: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, rowGap: 14, marginTop: 16 },
  flag: { alignItems: 'center', gap: 6, maxWidth: 96 },
});

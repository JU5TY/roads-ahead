import { useMemo } from 'react';

import { useSettings } from '../../context/SettingsContext';
import { summarizeCountries } from '../../utils/countries';
import { formatMonthYear } from '../../utils/format';
import { CountryRows } from '../countries/CountriesSection';
import SectionHeader from '../ui/SectionHeader';

/**
 * Home's (and a vehicle's) Countries card: every country you've driven in, in
 * the order you first drove there, as the same rows as a trip's Countries:
 * flag, name, "Since Jan 2026" and the distance driven there. Just "Countries"
 * over it: the rows show how many.
 */
export default function CountriesCard({ trips }) {
  const { units } = useSettings();
  const rows = useMemo(() => {
    const drives = trips.flatMap((t) => t.drives).sort((a, b) => a.startedAt - b.startedAt);
    // Scaled to the miles driven, as on a trip, so the rows add up to the total.
    const total = drives.reduce((sum, d) => sum + (d.stats.distanceM ?? 0), 0);
    return summarizeCountries(
      drives.flatMap((d) => (d.countries ?? []).map((v) => ({ ...v, startedAt: d.startedAt }))),
      total
    ).map((country) => ({
      ...country,
      subtitle: `Since ${formatMonthYear(country.visits[0].startedAt)}`,
    }));
  }, [trips]);
  // Nothing to show until past drives have been checked.
  if (rows.length === 0) return null;
  return (
    <>
      <SectionHeader title="Countries" />
      <CountryRows rows={rows} units={units} />
    </>
  );
}

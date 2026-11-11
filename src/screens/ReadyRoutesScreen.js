import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import RoadRow from '../components/roads/RoadRow';
import IconButton from '../components/ui/IconButton';
import SectionHeader from '../components/ui/SectionHeader';
import { useSettings } from '../context/SettingsContext';
import { useRouteStatus } from '../hooks/useRouteStatus';
import { useStyles } from '../hooks/useTheme';
import { spacing, type } from '../theme';
import { formatDateRange, formatDistance } from '../utils/format';
import { READY_ROUTES } from '../utils/readyRoutes';

/**
 * "Scotland · 489 mi · 5 drives", "Scotland · in Scotland 2027" once it's in
 * your plans, or "Scotland · Completed 3–8 Aug 2026".
 */
function routeLine(route, state, units) {
  if (state?.completed) {
    const { from, to } = state.completed;
    return `${route.country} · Completed ${formatDateRange(from, to)}`;
  }
  if (state) return `${route.country} · in ${state.plan.name}`;
  const drives = `${route.drives.length} ${route.drives.length === 1 ? 'drive' : 'drives'}`;
  return `${route.country} · ${formatDistance(route.metres, units, 0)} · ${drives}`;
}

/**
 * Ready-made routes: those completed (about 90% driven), those in your plans
 * (copied), then the rest. A route opens its page, where it's copied. Country
 * chips come once there are routes in more than one country.
 */
export default function ReadyRoutesScreen() {
  const { units } = useSettings();
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const status = useRouteStatus();

  const stateOf = (route) => status?.get(route.id) ?? null;
  const completed = READY_ROUTES.filter((r) => stateOf(r)?.completed);
  const mine = READY_ROUTES.filter((r) => stateOf(r) && !stateOf(r).completed);
  const more = READY_ROUTES.filter((r) => !stateOf(r));
  const row = (route) => (
    <RoadRow
      key={route.id}
      name={route.name}
      subtitle={routeLine(route, stateOf(route), units)}
      line={route.drives.flatMap((d) => d.line)}
      completed={!!stateOf(route)?.completed}
      planned={!!stateOf(route)}
      onPress={() => router.push(`/routes/${route.id}`)}
    />
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.xl },
      ]}
    >
      <IconButton
        icon="arrow_back"
        variant="plain"
        accessibilityLabel="Back"
        onPress={() => router.back()}
        style={styles.back}
      />
      <Text style={[type.headline, styles.h1]} role="heading">
        Ready-made routes
      </Text>
      <Text style={[type.body, styles.intro]}>Copy one to your plans, then drive it a drive at a time</Text>

      {completed.length ? (
        <>
          <SectionHeader variant="label" title={`Completed · ${completed.length}`} style={styles.group} />
          <View style={styles.list}>{completed.map(row)}</View>
        </>
      ) : null}
      {mine.length ? (
        <>
          <SectionHeader variant="label" title={`In your plans · ${mine.length}`} style={styles.group} />
          <View style={styles.list}>{mine.map(row)}</View>
        </>
      ) : null}
      {more.length ? (
        <>
          <SectionHeader variant="label" title={`More routes · ${more.length}`} style={styles.group} />
          <View style={styles.list}>{more.map(row)}</View>
        </>
      ) : null}
    </ScrollView>
  );
}

const makeStyles = (c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  content: { paddingHorizontal: spacing.md },
  back: { alignSelf: 'flex-start', marginLeft: -12 },
  h1: { color: c.text, marginHorizontal: 4 },
  intro: { color: c.textMuted, marginHorizontal: 4, marginTop: 4 },
  group: { marginTop: 24 },
  list: { gap: 8 },
});

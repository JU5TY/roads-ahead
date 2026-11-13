import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import RouteDays from '../components/plan/RouteDays';
import DetailLayout from '../components/detail/DetailLayout';
import StatusCard from '../components/roads/StatusCard';
import RouteMap from '../components/RouteMap';
import FloatingButton from '../components/ui/FloatingButton';
import PremiumTag from '../components/ui/PremiumTag';
import SectionHeader from '../components/ui/SectionHeader';
import StatRow from '../components/ui/StatRow';
import { useSettings } from '../context/SettingsContext';
import { useRouteStatus } from '../hooks/useRouteStatus';
import { useStyles, useTheme } from '../hooks/useTheme';
import { createPlan } from '../storage/planStorage';
import { dayColorFor, floating, type } from '../theme';
import { distanceParts, formatDateRange } from '../utils/format';
import { getReadyRoute, routeDriveFrom, routeLabel, routePlanDrives } from '../utils/readyRoutes';

/**
 * An Iconic Trip, laid out like an Iconic Road: its map (a colour per day),
 * where it starts and the way it goes, Completed once about 90% of it is
 * driven, its miles and days, About, and the route day by day. The floating
 * Copy puts it in your plans (Premium, though free for now); once copied it's
 * Open. Params: `id`.
 */
export default function ReadyRouteScreen() {
  const { id } = useLocalSearchParams();
  const route = getReadyRoute(id);
  const { units } = useSettings();
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const state = useRouteStatus()?.get(id) ?? null;
  const plan = state?.plan ?? null; // its copy in your plans, if any
  const [copying, setCopying] = useState(false);

  const segments = useMemo(
    () =>
      (route?.drives ?? []).map((d, i) => ({
        key: `drive-${i}`,
        coordinates: d.line.map(([latitude, longitude]) => ({ latitude, longitude })),
        color: dayColorFor(c, i + 1),
      })),
    [route, c]
  );

  if (!route) return null;

  // Free for everyone for now, though badged: copying goes behind Premium later.
  const copy = async () => {
    if (copying) return;
    setCopying(true);
    try {
      const planId = await createPlan({ name: route.name, routeId: route.id, drives: routePlanDrives(route) });
      router.replace(`/plans/${planId}`);
    } catch (err) {
      console.warn('[route] copy failed', err);
      setCopying(false);
    }
  };

  const start = route.drives[0].start;
  // Where it ends: the last stop, or the end of the line when an Iconic Road is last.
  // Drawn after the start, so a round trip shows red, as on a driven trip.
  const last = route.drives.at(-1);
  const lastStop = last.stops.at(-1);
  const [endLat, endLng] = last.line.at(-1);
  const finish = lastStop.roadId ? { latitude: endLat, longitude: endLng } : lastStop;
  const markers = [
    { key: 'start', coordinate: start, title: start.name, color: c.start },
    { key: 'finish', coordinate: finish, title: lastStop.name, color: c.finish },
  ];
  const distance = distanceParts(route.metres, units);
  const map = <RouteMap flat segments={segments} markers={markers} />;

  return (
    <DetailLayout
      map={map}
      mapHeight={360}
      floating={
        plan ? (
          <FloatingButton
            icon="bookmark"
            iconColor={c.accent}
            label="Open"
            accessibilityLabel="Open your plan"
            onPress={() => router.push(`/plans/${plan.id}`)}
            style={{ bottom: insets.bottom + floating.recordPill.lift }}
          />
        ) : (
          <FloatingButton
            icon="content_copy"
            iconColor={c.accent}
            label="Copy"
            trailing={<PremiumTag />}
            accessibilityLabel="Copy to my plans"
            onPress={copy}
            style={{ bottom: insets.bottom + floating.recordPill.lift }}
          />
        )
      }
    >
      <Text style={[type.kicker, styles.kicker]}>
        {`${routeDriveFrom(route, 0)} · ${route.country}`.toUpperCase()}
      </Text>
      <Text style={[type.title, styles.title]}>{route.name}</Text>
      <Text style={[type.body, styles.muted, styles.subtitle]}>{routeLabel(route)}</Text>

      <StatusCard
        done={!!state?.completed}
        icon="signpost"
        title={state?.completed ? 'Completed' : 'Not completed yet'}
        detail={
          state?.completed
            ? formatDateRange(state.completed.from, state.completed.to)
            : 'Drive the whole route to complete it'
        }
      />

      <StatRow
        style={styles.stats}
        stats={[
          { icon: 'straighten', ...distance, label: 'Distance' },
          { icon: 'calendar_month', value: String(route.drives.length), label: 'Days' },
        ]}
      />

      <SectionHeader title="About" style={styles.aboutHeader} />
      <Text style={[type.lead, styles.muted, styles.blurb]}>{route.blurb}</Text>

      <SectionHeader title="Route" />
      <RouteDays route={route} />
    </DetailLayout>
  );
}

const makeStyles = (c) => ({
  // As an Iconic Road's page.
  kicker: { color: c.accent, marginHorizontal: 4 },
  title: { color: c.text, marginTop: 4, marginHorizontal: 4 },
  subtitle: { marginTop: 2, marginHorizontal: 4 },
  muted: { color: c.textMuted },
  stats: { marginTop: 20 },
  aboutHeader: { marginBottom: 8 },
  blurb: { marginHorizontal: 4 },
});

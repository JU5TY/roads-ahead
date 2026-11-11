import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import DetailLayout from '../components/detail/DetailLayout';
import RouteMap from '../components/RouteMap';
import Button from '../components/ui/Button';
import Icon from '../components/ui/Icon';
import PremiumTag from '../components/ui/PremiumTag';
import SectionHeader from '../components/ui/SectionHeader';
import StatRow from '../components/ui/StatRow';
import { useSettings } from '../context/SettingsContext';
import { useRouteStatus } from '../hooks/useRouteStatus';
import { useStyles, useTheme } from '../hooks/useTheme';
import { createPlan } from '../storage/planStorage';
import { dayColorFor, spacing, type } from '../theme';
import { distanceParts, formatDateRange } from '../utils/format';
import {
  READY_ROUTES_ATTRIBUTION,
  getReadyRoute,
  routeDriveLine,
  routeDriveTitle,
  routePlanDrives,
} from '../utils/readyRoutes';

/**
 * A ready-made route: its map (a colour per drive), what it is, Completed once
 * about 90% of it is driven, its miles and drives, and Copy to my plans
 * (Premium, though free for now), or Open your plan once it's copied. Params: `id`.
 */
export default function ReadyRouteScreen() {
  const { id } = useLocalSearchParams();
  const route = getReadyRoute(id);
  const { units } = useSettings();
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
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
  const distance = distanceParts(route.metres, units);
  const map = <RouteMap flat segments={segments} markers={[{ key: 'start', coordinate: start, title: start.name, color: c.start }]} />;

  return (
    <DetailLayout
      map={map}
      mapHeight={360}
      footer={
        plan ? (
          <Button label="Open your plan" icon="bookmark" onPress={() => router.push(`/plans/${plan.id}`)} />
        ) : (
          <View>
            <Button label="Copy to my plans" icon="content_copy" onPress={copy} disabled={copying} />
            <View style={styles.premium} pointerEvents="none">
              <PremiumTag />
            </View>
          </View>
        )
      }
    >
      <Text style={[type.kicker, styles.kicker]}>{`${route.country} · Ready-made route`.toUpperCase()}</Text>
      <Text style={[type.title, styles.text]}>{route.name}</Text>
      <Text style={[type.lead, styles.muted, styles.blurb]}>{route.blurb}</Text>

      {state?.completed ? (
        <View style={styles.done}>
          <View style={styles.doneWell}>
            <Icon name="verified" filled size={26} color={c.onRoadBadge} />
          </View>
          <View style={styles.flex}>
            <Text style={[type.bodyStrong, styles.onDone]}>Completed</Text>
            <Text style={[type.small, styles.doneMuted]}>
              {formatDateRange(state.completed.from, state.completed.to)}
            </Text>
          </View>
        </View>
      ) : null}

      <StatRow
        style={styles.stats}
        stats={[
          { icon: 'straighten', ...distance, label: 'Distance' },
          { icon: 'route', value: String(route.drives.length), label: 'Drives' },
        ]}
      />

      <SectionHeader title="Drives" />
      <View style={styles.group}>
        {route.drives.map((d, i) => (
          <View key={i} style={[styles.drive, i > 0 && styles.divider]}>
            <View style={[styles.dot, { backgroundColor: dayColorFor(c, i + 1) }]} />
            <View style={styles.flex}>
              <Text style={[type.bodyStrong, styles.text]}>{routeDriveTitle(route, i)}</Text>
              <Text style={[type.bodySmall, styles.muted]}>{routeDriveLine(route, i, units)}</Text>
            </View>
            {d.stops.some((s) => s.roadId) ? (
              <Icon name="verified" filled size={20} color={c.roadBadge} />
            ) : null}
          </View>
        ))}
      </View>

      <Text style={[type.small, styles.muted, styles.credit]}>{READY_ROUTES_ATTRIBUTION}</Text>
    </DetailLayout>
  );
}

const makeStyles = (c) => ({
  kicker: { color: c.accent, marginHorizontal: 4 },
  text: { color: c.text },
  muted: { color: c.textMuted },
  blurb: { marginTop: spacing.sm, marginHorizontal: 4 },
  stats: { marginTop: 20 },
  group: { backgroundColor: c.card, borderRadius: 12, paddingHorizontal: 12, ...c.cardShadow },
  drive: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 64, paddingVertical: 10, paddingHorizontal: 4 },
  divider: { borderTopWidth: 1, borderTopColor: c.divider },
  dot: { width: 12, height: 12, borderRadius: 6 },
  flex: { flex: 1, minWidth: 0 },
  // As an Iconic Road's Completed box.
  done: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: c.roadContainer,
  },
  doneWell: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.roadBadge,
  },
  onDone: { color: c.onRoadContainer },
  doneMuted: { color: c.roadContainerMuted },
  premium: { position: 'absolute', right: 16, top: 0, bottom: 0, justifyContent: 'center' },
  credit: { marginTop: spacing.lg, marginHorizontal: 4 },
});

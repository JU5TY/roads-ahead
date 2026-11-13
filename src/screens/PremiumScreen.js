import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import RouteThumb from '../components/RouteThumb';
import Button from '../components/ui/Button';
import Icon from '../components/ui/Icon';
import IconButton from '../components/ui/IconButton';
import { PREMIUM_PRICE, PREMIUM_TAGLINE } from '../hooks/usePremium';
import { useStyles, useTheme } from '../hooks/useTheme';
import { dayColorFor, radius, spacing, type } from '../theme';
import { comingSoon } from '../utils/comingSoon';
import { READY_ROUTES } from '../utils/readyRoutes';

// In pairs, as the grid shows them: photos first, the trip's data last.
const FEATURES = [
  ['share', 'Photo sharing', 'Your route and stats on your own photos'],
  ['wall_art', 'Photo wall art', 'Your own trip photo on your gallery print'],
  ['map', 'Satellite maps', 'See every trip from above, hills and all'],
  ['garage', 'More vehicles', 'Every car, each with its own stats'],
  ['save', 'Backup file', 'Keep a copy, or move to any phone'],
  ['download', 'GPX export', 'Your routes in other map apps'],
];

/** The headline, above the pairs: Iconic Trips, with the first trip drawn in its day colours. */
function TripsTile() {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const segments = useMemo(
    () =>
      READY_ROUTES[0].drives.map((d, i) => ({
        key: `drive-${i}`,
        coordinates: d.line.map(([latitude, longitude]) => ({ latitude, longitude })),
        color: dayColorFor(c, i + 1),
      })),
    [c]
  );
  return (
    <View style={styles.headline}>
      <View style={styles.flex}>
        <View style={styles.tileIcon}>
          <Icon name="signpost" size={24} color={c.onAccentContainer} />
        </View>
        <Text style={[type.section, styles.text, styles.tileTitle]}>Iconic Trips</Text>
        <Text style={[type.label, styles.muted, styles.headlineText]}>
          Ready-made road trips, copied into your plans, day by day
        </Text>
      </View>
      <RouteThumb segments={segments} size={88} />
    </View>
  );
}

function FeatureTile({ icon, title, description }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.tile}>
      <View style={styles.tileIcon}>
        <Icon name={icon} size={24} color={c.onAccentContainer} />
      </View>
      <Text style={[type.bodyStrong, styles.text, styles.tileTitle]}>{title}</Text>
      <Text style={[type.small, styles.muted, styles.tileText]}>{description}</Text>
    </View>
  );
}

/**
 * Roads Ahead Premium: what it adds and the yearly price. Opens from You and from
 * any Premium badge. Payments aren't connected yet, so Sign up says it's coming.
 */
export default function PremiumScreen() {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <IconButton
            icon="arrow_back"
            variant="plain"
            accessibilityLabel="Back"
            onPress={() => (router.canGoBack() ? router.back() : router.navigate('/settings'))}
            style={styles.back}
          />
          <View style={styles.badge}>
            <Icon name="workspace_premium" filled size={40} color={c.accent} />
          </View>
          <Text style={[type.title, styles.text, styles.title]} role="heading">
            Premium
          </Text>
          <Text style={[type.lead, styles.muted, styles.tagline]}>{PREMIUM_TAGLINE}</Text>
        </View>

        <TripsTile />
        <View style={styles.grid}>
          {FEATURES.map(([icon, title, description]) => (
            <FeatureTile key={title} icon={icon} title={title} description={description} />
          ))}
        </View>
        <View style={styles.free}>
          <Icon name="check_circle" size={18} color={c.textMuted} />
          <Text style={[type.label, styles.muted, styles.freeText]}>
            Everything else stays free: recording, trips, planning, charts, Iconic Roads and sharing.
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.bar, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.price}>
          <Text style={[type.section, styles.text, styles.priceValue]}>{PREMIUM_PRICE}</Text>
          <Text style={[type.body, styles.muted]}>a year</Text>
        </View>
        <Button label="Sign up" style={styles.signUp} onPress={() => comingSoon('Premium')} />
        <View style={styles.small}>
          <Text style={[type.small, styles.muted]}>Cancel anytime</Text>
          <Text style={[type.small, styles.muted]} aria-hidden>
            ·
          </Text>
          <Pressable
            onPress={() => comingSoon('Restoring a purchase')}
            accessibilityRole="button"
            hitSlop={12}
          >
            <Text style={[type.smallStrong, { color: c.accent }]}>Restore purchase</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  content: { paddingHorizontal: spacing.md, paddingBottom: 32 },
  text: { color: c.text },
  muted: { color: c.textMuted },
  header: {
    marginHorizontal: -spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: 24,
    alignItems: 'center',
    backgroundColor: c.card,
  },
  back: { alignSelf: 'flex-start' },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.accentContainer,
  },
  title: { marginTop: 14 },
  tagline: { marginTop: 8, textAlign: 'center' },
  flex: { flex: 1, minWidth: 0 },
  // The headline: wider and taller than the pairs, with a picture.
  headline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: 20,
    paddingVertical: 20,
    paddingLeft: 18,
    paddingRight: spacing.md,
    borderRadius: radius.card,
    backgroundColor: c.card,
    ...c.cardShadow,
  },
  headlineText: { marginTop: 2, fontFamily: type.body.fontFamily },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  // Two columns: each starts just under half and grows to fill its share of the row.
  tile: {
    flexBasis: '48%',
    flexGrow: 1,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: radius.card,
    backgroundColor: c.card,
    ...c.cardShadow,
  },
  tileIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.accentContainer,
  },
  tileTitle: { marginTop: 12 },
  tileText: { marginTop: 2 },
  free: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, marginHorizontal: 4 },
  freeText: { flexShrink: 1, fontFamily: type.body.fontFamily },
  bar: {
    paddingTop: 14,
    paddingHorizontal: spacing.md,
    backgroundColor: c.card,
    shadowColor: c.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: -1 },
    elevation: 8,
  },
  price: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 6 },
  priceValue: { fontSize: 22, lineHeight: 28 },
  signUp: { marginTop: 10, height: 52 },
  small: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 },
});

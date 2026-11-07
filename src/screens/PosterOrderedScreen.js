import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PosterCard from '../components/poster/PosterCard';
import Button from '../components/ui/Button';
import Icon from '../components/ui/Icon';
import { useStyles, useTheme } from '../hooks/useTheme';
import { getPosterOrder, pendingPosterOrder } from '../services/posterService';
import { spacing, type } from '../theme';
import { SIZES } from '../utils/posterLayout';

const POSTER_WIDTH = 179;
const TICK = 56;

/**
 * After paying on Stripe's page: the poster that's being printed and the order's
 * details. Opened by the print server's link back into the app. Param: `order`.
 */
export default function PosterOrderedScreen() {
  const { order: orderId } = useLocalSearchParams();
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  // Still in memory unless the phone closed the app while Stripe's page was open.
  const pending = pendingPosterOrder()?.orderId === orderId ? pendingPosterOrder() : null;
  const [order, setOrder] = useState(
    pending ? { ref: pending.ref, size: pending.spec.size, title: pending.spec.lines.title.text } : null
  );

  useEffect(() => {
    if (pending || !orderId) return;
    let cancelled = false;
    getPosterOrder(orderId)
      .then((o) => !cancelled && setOrder(o))
      .catch((err) => console.warn('[poster] order lookup failed', err));
    return () => {
      cancelled = true;
    };
  }, [orderId, pending]);

  const done = () => {
    if (pending?.tripId) router.dismissTo(`/trips/${pending.tripId}`);
    else router.navigate('/');
  };
  const rows = order
    ? [
        ['Order', order.ref],
        ['Poster', [order.size, order.title].filter(Boolean).join(' · ')],
        ['Paid', SIZES[order.size]?.price],
      ].filter(([, value]) => value)
    : [];

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
        bounces={false}
      >
        <View style={styles.hero}>
          {pending ? (
            <View>
              <View style={styles.poster}>
                <PosterCard spec={pending.spec} width={POSTER_WIDTH} />
              </View>
              <View style={[styles.tick, styles.tickOnPoster]}>
                <Icon name="check" size={32} color={c.onAccent} />
              </View>
            </View>
          ) : (
            <View style={styles.tick}>
              <Icon name="check" size={32} color={c.onAccent} />
            </View>
          )}
        </View>
        <Text style={[type.title, styles.heading]} role="heading">
          Order placed
        </Text>
        <Text style={[type.lead, styles.lead]}>
          Your poster is being printed. We&apos;ll email you a tracking link when it&apos;s on its
          way, usually in 3 to 5 working days.
        </Text>
        {rows.length ? (
          <View style={styles.card}>
            {rows.map(([label, value], i) => (
              <View key={label} style={[styles.row, i < rows.length - 1 && styles.rowDivider]}>
                <Text style={[type.body, styles.muted]}>{label}</Text>
                <Text style={[type.bodyStrong, styles.text]}>{value}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
        <Button label="Done" onPress={done} />
      </View>
    </View>
  );
}

const makeStyles = (c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg },
  hero: { alignItems: 'center' },
  // Paper casts a shadow in dark mode too.
  poster: {
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  tick: {
    width: TICK,
    height: TICK,
    borderRadius: TICK / 2,
    backgroundColor: c.start,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickOnPoster: {
    position: 'absolute',
    right: -20,
    bottom: -20,
    borderWidth: 4,
    borderColor: c.background,
    width: TICK + 8,
    height: TICK + 8,
    borderRadius: TICK / 2 + 4,
  },
  heading: { color: c.text, textAlign: 'center', marginTop: 44 },
  lead: { color: c.textMuted, textAlign: 'center', marginTop: 10 },
  card: {
    marginTop: 24,
    borderRadius: 12,
    backgroundColor: c.card,
    paddingHorizontal: 16,
    ...c.cardShadow,
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: c.divider },
  muted: { color: c.textMuted },
  text: { color: c.text, flexShrink: 1, textAlign: 'right' },
  footer: { paddingHorizontal: spacing.md, paddingTop: 12 },
});

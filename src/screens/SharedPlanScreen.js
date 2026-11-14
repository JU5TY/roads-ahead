import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { useStyles, useTheme } from '../hooks/useTheme';
import { createPlan, getSharedPlanId } from '../storage/planStorage';
import { type } from '../theme';
import { decodePlan, linkKey } from '../utils/planLink';

/**
 * Where a shared plan's link lands (`p`, utils/planLink.js): saved as your own
 * copy, date and all, and opened on its plan page. The same link again opens
 * that copy rather than adding another.
 */
export default function SharedPlanScreen() {
  const { p } = useLocalSearchParams();
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const text = typeof p === 'string' ? p : null;
      const plan = text ? decodePlan(text) : null;
      if (!plan) {
        setFailed(true);
        return;
      }
      const key = linkKey(text);
      const id = (await getSharedPlanId(key)) ?? (await createPlan({ ...plan, sharedKey: key }));
      if (!cancelled) router.replace(`/plans/${id}`);
    })().catch((err) => {
      console.warn('[shared] open failed', err);
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [p]);

  return (
    <View style={styles.screen}>
      {failed ? (
        <Text style={[type.body, styles.muted]}>
          This plan link can’t be opened. It may need a newer version of the app.
        </Text>
      ) : (
        <ActivityIndicator color={c.accent} />
      )}
    </View>
  );
}

const makeStyles = (c) => ({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: c.background },
  muted: { color: c.textMuted, textAlign: 'center' },
});

import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppLogo from '../components/AppLogo';
import FeatureList from '../components/FeatureList';
import Button from '../components/ui/Button';
import Halo from '../components/ui/Halo';
import { useStyles } from '../hooks/useTheme';
import { type } from '../theme';

const LOGO_SIZE = 160;

// One line each under the title, so the list reads evenly.
const FEATURES = [
  ['route', 'Record every drive', 'Keeps recording with the screen off'],
  ['auto_stories', 'Relive every trip', 'Day by day, with stops and photos'],
  ['map', 'See everywhere you’ve been', 'Every road you’ve driven, on one map'],
  ['verified', 'Complete Iconic Roads', '20 of Europe’s greatest driving roads'],
];

/** First launch: what the app does, then on to the location explainer. */
export default function WelcomeScreen() {
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
    >
      <View style={[styles.top, { paddingTop: insets.top + 40 }]}>
        <Halo size={LOGO_SIZE + 40} grow>
          <AppLogo size={LOGO_SIZE} />
        </Halo>
      </View>
      <View style={styles.body}>
        <Text style={[type.headline, styles.text]} role="heading">
          Every road trip, mapped
        </Text>
        <FeatureList items={FEATURES} style={styles.features} />
        <View style={styles.gap} />
        <Button label="Get started" onPress={() => router.push('/permission')} />
      </View>
    </ScrollView>
  );
}

const makeStyles = (c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  content: { flexGrow: 1 },
  top: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 8, // 32 to the headline, with the body's 24
  },
  body: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 24 },
  features: { marginTop: 24 },
  text: { color: c.text },
  gap: { flex: 1, minHeight: 24 },
});

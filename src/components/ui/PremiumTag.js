import { Text, View } from 'react-native';

import { usePremium } from '../../hooks/usePremium';
import { useStyles, useTheme } from '../../hooks/useTheme';
import { type } from '../../theme';
import Icon from './Icon';

/** The small blue "Premium" tag on things that need Premium (hidden once it's active). */
export default function PremiumTag() {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  if (usePremium()) return null;
  return (
    <View style={styles.tag}>
      <Icon name="workspace_premium" size={14} color={c.onAccentContainer} />
      <Text style={[type.caps, styles.text]}>Premium</Text>
    </View>
  );
}

const makeStyles = (c) => ({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingLeft: 6,
    paddingRight: 8,
    borderRadius: 6,
    backgroundColor: c.accentContainer,
  },
  text: { color: c.onAccentContainer, letterSpacing: 0 },
});

import { Pressable, Text, View } from 'react-native';

import { useStyles } from '../../hooks/useTheme';
import { type } from '../../theme';

/**
 * Section heading.
 * variant 'title': 18px, for a section of content on a page (Home's "Latest
 *   trip", the Trip page's "Details"), with an optional grey `subtitle` line
 *   under it ("Whole trip").
 * variant 'overline': uppercase 14px, a label over a group of rows or cards in
 *   a list (Trips' month headers, "COMPLETED · 2" on Iconic Roads). 'label' is
 *   the same with less space under it, for the You screen's groups of rows.
 * `actionLabel` adds a blue link on the right ("All trips").
 */
export default function SectionHeader({
  title,
  subtitle,
  variant = 'title',
  actionLabel,
  onAction,
  style,
}) {
  const styles = useStyles(makeStyles);
  const isTitle = variant === 'title';
  return (
    <View
      style={[
        styles.row,
        !isTitle && styles.overlineRow,
        variant === 'label' && styles.labelRow,
        style,
      ]}
    >
      <View style={styles.text}>
        <Text
          style={isTitle ? [type.section, styles.title] : [type.overline, styles.overline]}
          role="heading"
        >
          {isTitle ? title : title.toUpperCase()}
        </Text>
        {subtitle ? <Text style={[type.label, styles.subtitle]}>{subtitle}</Text> : null}
      </View>
      {actionLabel ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="link"
          hitSlop={12}
          style={styles.actionWrap}
        >
          <Text style={[type.label, styles.action]} numberOfLines={1}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const makeStyles = (c) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 28,
    marginBottom: 10,
    marginHorizontal: 4,
  },
  overlineRow: { marginBottom: 12 },
  labelRow: { marginBottom: 4 },
  text: { flexShrink: 1 },
  title: { color: c.text },
  overline: { color: c.text },
  subtitle: { color: c.textMuted, fontFamily: type.body.fontFamily, marginTop: 2 },
  // Android measures letter-spaced custom fonts a little short, which wrapped
  // "All roads" onto a hidden second line; no spacing and no shrinking here.
  actionWrap: { flexShrink: 0, marginLeft: 12 },
  action: { color: c.accent, letterSpacing: 0 },
});

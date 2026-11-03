import { Pressable, Text, View } from 'react-native';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { pressedOpacity, type } from '../../theme';
import Icon from './Icon';

/**
 * Settings / Details row: green icon, title (+ optional subtitle), value on the
 * right, chevron when tappable. `right` replaces value + chevron (e.g. a Switch).
 * `divider` draws the hairline under all but the last row of a group.
 * `strongValue` shows the value as a stat (dark, semibold) rather than a setting.
 * `leading` replaces the icon (e.g. the Garage's round icon well); `titleStyle`
 * restyles the title; `dense` is the 52px row of Details cards.
 */
export default function ListRow({
  icon,
  title,
  subtitle,
  value,
  strongValue = false,
  right,
  onPress,
  chevron = !!onPress,
  divider = false,
  accessibilityRole,
  accessibilityState,
  leading,
  titleStyle,
  dense = false,
  style,
}) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);

  const content = (
    <>
      {leading ?? (icon ? <Icon name={icon} size={22} color={c.accent} /> : null)}
      <View style={styles.text}>
        <Text style={[type.bodyLarge, styles.title, titleStyle]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[type.small, styles.muted]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? (
        <>
          {value != null ? (
            <Text style={strongValue ? [type.bodyStrong, styles.title] : [type.body, styles.muted]}>
              {value}
            </Text>
          ) : null}
          {chevron ? <Icon name="chevron_right" size={22} color={c.textMuted} /> : null}
        </>
      )}
    </>
  );

  const rowStyle = [styles.row, dense && styles.dense, divider && styles.divider, style];
  if (!onPress) return <View style={rowStyle}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={accessibilityRole ?? 'button'}
      accessibilityState={accessibilityState}
      style={({ pressed }) => [rowStyle, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const makeStyles = (c) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 56,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  dense: { minHeight: 52, paddingVertical: 0 },
  divider: { borderBottomWidth: 1, borderBottomColor: c.divider },
  text: { flex: 1, minWidth: 0 },
  title: { color: c.text },
  muted: { color: c.textMuted },
  pressed: { opacity: pressedOpacity },
});

import * as flags from 'country-flag-icons/string/3x2';
import { Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { type } from '../../theme';
import Icon from '../ui/Icon';

const SIZE = 36;
const MAX_SHOWN = 5; // more than this: the first 4 and a "+n" circle

/** "England", "England and Wales", "England, Wales and France". */
const listOf = (names) =>
  names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];

/**
 * Round, overlapping flags for the countries driven, most distance first:
 * `countries` is [{ code, name, flag }] in that order. Up to five are shown,
 * then four and a "+n" circle for the rest. `colors` ({ ring, more, onMore })
 * replaces the theme's on a surface that doesn't follow it, like a share card.
 */
export default function FlagStack({ countries, size = SIZE, colors }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const circle = { width: size, height: size, borderRadius: size / 2 };
  const overlap = { marginLeft: (-size * 10) / SIZE };
  if (countries.length === 0) return null;
  const shown = countries.length > MAX_SHOWN ? countries.slice(0, MAX_SHOWN - 1) : countries;
  const rest = countries.length - shown.length;
  const names = listOf(shown.map((country) => country.name));
  const label =
    rest > 0
      ? `Countries driven: ${countries.length}, including ${names}`
      : `Countries driven: ${names}`;

  return (
    <View style={styles.row} accessible accessibilityLabel={label}>
      {shown.map((country, i) => {
        // Looked up by name, so the import rule can't check it.
        // eslint-disable-next-line import/namespace
        const xml = country.flag ? flags[country.flag] : null;
        return (
          <View key={country.code} style={[styles.hairline, circle, i > 0 && overlap]}>
            <View style={[styles.ring, colors && { borderColor: colors.ring }]}>
              {xml ? (
                <SvgXml xml={xml} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" />
              ) : (
                <Icon name="public" size={22} color={c.textMuted} />
              )}
            </View>
          </View>
        );
      })}
      {rest > 0 ? (
        <View style={[styles.hairline, circle, overlap]}>
          <View
            style={[
              styles.ring,
              styles.more,
              colors && { borderColor: colors.ring, backgroundColor: colors.more },
            ]}
          >
            <Text
              allowFontScaling={!colors}
              style={[
                styles.moreText,
                colors && {
                  color: colors.onMore,
                  fontSize: (type.smallStrong.fontSize * size) / SIZE,
                  lineHeight: (type.smallStrong.lineHeight * size) / SIZE,
                },
              ]}
            >
              +{rest}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (c) => ({
  row: { flexDirection: 'row' },
  // A 1dp hairline round a 2dp ring in the panel colour, so overlapping flags separate.
  hairline: {
    padding: 1,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  ring: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: c.card,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  more: { backgroundColor: c.accentContainer },
  moreText: { ...type.smallStrong, color: c.onAccentContainer },
});

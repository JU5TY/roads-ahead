import { Text, View } from 'react-native';

import { useStyles } from '../hooks/useTheme';
import { radius, spacing, type } from '../theme';
import FadeUp from './ui/FadeUp';
import IconButton from './ui/IconButton';
import MapDot from './MapDot';

export const MAP_CARD_ROOM = 88; // the card's height and gap: map padding while it shows

const KIND_LABELS = { start: 'Start', finish: 'Finish', stop: 'Rest stop' };

/**
 * The card for a map marker that's been tapped, floating over the bottom of the
 * map in place of a callout: its mark, its name, then what it is and any
 * description ("Rest stop · 25 min"). `marker` is one of RouteMap's markers.
 */
export default function MapCard({ marker, onClose }) {
  const styles = useStyles(makeStyles);
  const kindLabel = KIND_LABELS[marker.kind];
  // A stop with no place name is already titled "Rest stop".
  const detail = [kindLabel !== marker.title && kindLabel, marker.description]
    .filter(Boolean)
    .join(' · ');
  return (
    <FadeUp key={marker.key} style={styles.wrap}>
      <View style={styles.card} accessible accessibilityLabel={`${marker.title}. ${detail}`}>
        <MapDot kind={marker.kind} color={marker.color} />
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {marker.title}
          </Text>
          {detail ? (
            <Text style={styles.detail} numberOfLines={1}>
              {detail}
            </Text>
          ) : null}
        </View>
        <IconButton
          icon="close"
          variant="plain"
          size={36}
          iconSize={20}
          accessibilityLabel="Close"
          onPress={onClose}
        />
      </View>
    </FadeUp>
  );
}

const makeStyles = (c) => ({
  wrap: { position: 'absolute', left: spacing.md, right: spacing.md, bottom: spacing.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MAP_CARD_ROOM - spacing.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    borderRadius: radius.card,
    backgroundColor: c.card,
    ...c.cardShadow,
  },
  text: { flex: 1 },
  title: { ...type.bodyStrong, color: c.text },
  detail: { ...type.small, color: c.textMuted },
});

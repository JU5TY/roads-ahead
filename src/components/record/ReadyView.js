import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStyles, useTheme } from '../../hooks/useTheme';
import { spacing, type } from '../../theme';
import { dayNumberFor, tripTitle } from '../../utils/tripSummary';
import Icon from '../ui/Icon';
import IconButton from '../ui/IconButton';
import LiveMap from './LiveMap';

/** Radio card for picking the trip: icon, one-line title, radio. */
function TripOption({ icon, title, selected, onPress }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      style={[styles.option, selected && styles.optionOn]}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
    >
      <Icon name={icon} filled size={24} color={selected ? c.onAccentContainer : c.textMuted} />
      <View style={styles.flex}>
        <Text
          style={[type.bodyStrong, selected ? styles.onContainer : styles.text]}
          numberOfLines={1}
        >
          {title}
        </Text>
      </View>
      <Icon
        name={selected ? 'radio_button_checked' : 'radio_button_unchecked'}
        filled={selected}
        size={24}
        color={selected ? c.accent : c.textMuted}
      />
    </Pressable>
  );
}

/**
 * Record's "Ready to go": a map on the phone's position (`here`), then Continue
 * `recent` (a trip within the continue window, or null) or a new trip, and Start.
 * onStart(tripId) starts recording into that trip, or a new one when null.
 */
export default function ReadyView({ here, recent, now, busy, onStart }) {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const [choice, setChoice] = useState('continue'); // 'continue' | 'new'
  const [centreKey, setCentreKey] = useState(0);
  const canContinue = Boolean(recent);
  const continuing = canContinue && choice === 'continue';

  return (
    <>
      <View style={[styles.map, { flexBasis: 380 + insets.top }]}>
        <LiveMap position={here} centreKey={centreKey} />
        <IconButton
          icon="close"
          variant="floating"
          accessibilityLabel="Close"
          onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))}
          style={[styles.mapButtonLeft, { top: insets.top + 12 }]}
        />
        {here ? (
          <IconButton
            icon="my_location"
            variant="floating"
            accessibilityLabel="Centre on my position"
            onPress={() => setCentreKey((k) => k + 1)}
            style={[styles.mapButtonRight, { top: insets.top + 12 }]}
          />
        ) : null}
      </View>
      <View style={styles.body}>
        <View>
          <Text style={[type.title, styles.text, styles.title]}>Ready to go</Text>
          <Text style={[type.body, styles.muted, styles.title]}>
            {canContinue
              ? 'Pick up your trip or start a new one'
              : 'Your drive will start a new trip'}
          </Text>
        </View>
        {canContinue ? (
          <View style={styles.options} role="radiogroup">
            <TripOption
              icon="play_arrow"
              title={`Continue ${tripTitle(recent) ?? 'last trip'}`}
              selected={continuing}
              onPress={() => setChoice('continue')}
            />
            <TripOption
              icon="add_location_alt"
              title="New trip"
              selected={!continuing}
              onPress={() => setChoice('new')}
            />
          </View>
        ) : null}
        <View style={styles.startWrap}>
          {busy ? (
            <ActivityIndicator color={c.accent} style={styles.startBusy} />
          ) : (
            <IconButton
              icon="play_arrow"
              filled
              variant="filled"
              size={80}
              iconSize={40}
              label="Start"
              labelStyle={styles.startLabel}
              accessibilityLabel={
                continuing ? `Start day ${dayNumberFor(recent.drives, now)}` : 'Start a new trip'
              }
              onPress={() => onStart(continuing ? recent.id : null)}
            />
          )}
        </View>
      </View>
    </>
  );
}

const makeStyles = (c) => ({
  // Design height, but the map gives way on shorter screens so Start keeps its spacing.
  map: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 180,
    borderBottomWidth: 1,
    borderBottomColor: c.outline,
    backgroundColor: c.card,
  },
  mapButtonLeft: { position: 'absolute', left: 12 },
  mapButtonRight: { position: 'absolute', right: 12 },
  flex: { flex: 1, minWidth: 0 },
  text: { color: c.text },
  muted: { color: c.textMuted },
  onContainer: { color: c.onAccentContainer },
  body: {
    flexGrow: 1,
    flexShrink: 0,
    gap: 24, // minimum spacing when space-between has nothing to share
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 20,
  },
  title: { marginHorizontal: 4 },
  options: { gap: 8 },
  option: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.outline,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  optionOn: {
    backgroundColor: c.accentContainer,
    borderWidth: 2,
    borderColor: c.accent,
    paddingVertical: 13,
    paddingHorizontal: 15,
  },
  startWrap: { alignItems: 'center' },
  startBusy: { height: 108 },
  startLabel: { fontSize: 14, lineHeight: 20 },
});

import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog, showMessage } from '../components/ui/DialogHost';
import ActionSheet from '../components/ActionSheet';
import VehicleSheet from '../components/VehicleSheet';
import Icon from '../components/ui/Icon';
import ListRow from '../components/ui/ListRow';
import PremiumTag from '../components/ui/PremiumTag';
import Switch from '../components/ui/Switch';
import SectionHeader from '../components/ui/SectionHeader';
import { useSettings } from '../context/SettingsContext';
import { PREMIUM_TAGLINE, openPremium, usePremium } from '../hooks/usePremium';
import { useRoadTotals } from '../hooks/useRoadTotals';
import { useStyles, useTheme } from '../hooks/useTheme';
import { useVehicles } from '../hooks/useVehicles';
import { exportAllTrips, showExportFailed } from '../services/exportService';
import { countSavedPoints } from '../storage/driveStorage';
import { getExampleTripId } from '../storage/exampleTrip';
import { BREAK_REMINDER_OPTIONS } from '../storage/settingsStorage';
import { listTrips } from '../storage/tripStorage';
import { addVehicle, deleteVehicle, updateVehicle } from '../storage/vehicleStorage';
import { pressedOpacity, radius, spacing, type } from '../theme';
import { comingSoon } from '../utils/comingSoon';
import { distanceParts, formatBreakReminder } from '../utils/format';
import { COUNTRIES_ATTRIBUTION } from '../utils/countries';
import { ICONIC_ROADS, ROADS_ATTRIBUTION } from '../utils/iconicRoads';
import { GPX_ZIPPED_BYTES_PER_POINT } from '../utils/gpx';
import { hasTwin } from '../utils/vehicles';

const UNIT_LABELS = { metric: 'Kilometres', imperial: 'Miles' };
const THEMES = [
  ['system', 'System default'],
  ['light', 'Light'],
  ['dark', 'Dark'],
];

/** The blue Premium card near the top of You (until Premium is bought); opens the Premium screen. */
function PremiumRow() {
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <Pressable
      onPress={openPremium}
      accessibilityRole="button"
      accessibilityLabel={`Premium. ${PREMIUM_TAGLINE}`}
      style={({ pressed }) => [styles.premium, pressed && styles.pressed]}
    >
      <View style={styles.premiumWell}>
        <Icon name="workspace_premium" filled size={26} color={c.onAccentContainer} />
      </View>
      <View style={styles.flex}>
        <Text style={[type.bodyStrong, styles.premiumTitle]}>Premium</Text>
        <Text style={[type.small, styles.premiumText]}>{PREMIUM_TAGLINE}</Text>
      </View>
      <View style={styles.view}>
        <Text style={[type.label, styles.viewText]}>View</Text>
      </View>
    </Pressable>
  );
}

/**
 * "Default · 1,020 mi · 6 trips", led by the registration ("AB12 CDE · …")
 * when another vehicle has the same make and model, to tell them apart.
 */
function vehicleSubtitle(v, vehicles, units) {
  const d = distanceParts(v.distanceM, units);
  return [
    ...(v.registration && hasTwin(v, vehicles) ? [v.registration] : []),
    ...(v.isDefault ? ['Default'] : []),
    `${d.value} ${d.unit}`,
    `${v.tripCount} ${v.tripCount === 1 ? 'trip' : 'trips'}`,
  ].join(' · ');
}

/** The "You" tab: preferences and about. Every setting is the same row style. */
export default function SettingsScreen() {
  const {
    units,
    setUnits,
    breakReminderMinutes,
    setBreakReminderMinutes,
    showIconicRoads,
    setShowIconicRoads,
    theme,
    setTheme,
    replayOnboarding,
  } = useSettings();
  const { c } = useTheme();
  const totals = useRoadTotals();
  const completed = totals ? ICONIC_ROADS.filter((r) => totals.has(r.id)).length : 0;
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const [picking, setPicking] = useState(false);
  const version = Constants.expoConfig?.version ?? '—';
  const [vehicles, reloadVehicles] = useVehicles();
  const [editing, setEditing] = useState(null); // null | 'new' | vehicle
  const premium = usePremium();
  // Free: one vehicle in the Garage; Premium: as many as you like.
  const canAddVehicle = premium || !vehicles?.length;
  const [exporting, setExporting] = useState(null); // null | "Exporting trip 3 of 12"

  const confirmExport = async () => {
    if (exporting) return;
    const exampleId = getExampleTripId();
    let trips;
    let points;
    try {
      trips = (await listTrips()).filter((trip) => trip.id !== exampleId);
      points = await countSavedPoints();
    } catch (err) {
      console.warn('Export failed', err);
      showExportFailed();
      return;
    }
    if (!trips.length) {
      showMessage('Nothing to export yet', 'Your trips can be exported once you have recorded a drive.');
      return;
    }
    const mb = Math.ceil((points * GPX_ZIPPED_BYTES_PER_POINT) / 1e6) || 1;
    showDialog({
      title: trips.length === 1 ? 'Export your trip?' : `Export all ${trips.length} trips?`,
      message: `This makes a zip file of about ${mb} MB, with a GPX file for each trip.`,
      confirmLabel: 'Export',
      onConfirm: async () => {
        await exportAllTrips(trips, (done, total) => setExporting(`Exporting trip ${done} of ${total}`));
        setExporting(null);
      },
    });
  };

  const saveVehicle = async (fields) => {
    try {
      if (editing === 'new') await addVehicle(fields);
      else await updateVehicle(editing.id, fields);
    } catch (err) {
      console.warn('[garage] save failed', err);
    }
    setEditing(null);
    reloadVehicles();
  };
  const removeVehicle = async () => {
    try {
      await deleteVehicle(editing.id);
    } catch (err) {
      console.warn('[garage] delete failed', err);
    }
    setEditing(null);
    reloadVehicles();
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
    >
      <ActionSheet
        visible={picking}
        message="On Record, a break bar appears 30 minutes before this much driving without a break, then turns orange. A stop or pause of 15 minutes or more counts as a break."
        actions={BREAK_REMINDER_OPTIONS.map((minutes) => ({
          key: String(minutes),
          label: formatBreakReminder(minutes),
          selected: minutes === breakReminderMinutes,
          onPress: () => {
            setBreakReminderMinutes(minutes);
            setPicking(false);
          },
        }))}
        onClose={() => setPicking(false)}
      />
      <VehicleSheet
        visible={editing !== null}
        vehicle={editing === 'new' ? null : editing}
        others={(vehicles ?? []).filter((v) => v !== editing)}
        onSave={saveVehicle}
        onDelete={removeVehicle}
        onClose={() => setEditing(null)}
      />

      <Text style={[type.headline, styles.h1]} role="heading">
        You
      </Text>
      {premium ? null : <PremiumRow />}

      <SectionHeader variant="label" title="Garage" />
      {(vehicles ?? []).map((v) => (
        <ListRow
          key={v.id}
          leading={
            <View style={styles.well}>
              <Icon name="directions_car" filled size={22} color={c.onAccentContainer} />
            </View>
          }
          // Just make and model here; the nickname and registration show on drives.
          title={`${v.make} ${v.model}`.trim()}
          subtitle={vehicleSubtitle(v, vehicles, units)}
          onPress={() => setEditing(v)}
          style={styles.vehicleRow}
          divider
        />
      ))}
      {vehicles ? (
        <ListRow
          leading={
            <View style={styles.addIcon}>
              <Icon name="add" size={24} color={c.accent} />
            </View>
          }
          title={vehicles.length ? 'Add vehicle' : 'Add your vehicle'}
          titleStyle={styles.addTitle}
          right={vehicles.length ? <PremiumTag /> : null}
          onPress={canAddVehicle ? () => setEditing('new') : openPremium}
        />
      ) : null}

      <SectionHeader variant="label" title="Iconic Roads" />
      <ListRow
        icon="verified"
        title="Show Iconic Roads"
        onPress={() => setShowIconicRoads(!showIconicRoads)}
        accessibilityRole="switch"
        accessibilityState={{ checked: showIconicRoads }}
        divider={showIconicRoads}
        right={
          <Switch
            value={showIconicRoads}
            onValueChange={setShowIconicRoads}
            accessibilityLabel="Show Iconic Roads"
          />
        }
      />
      {showIconicRoads ? (
        <ListRow
          icon="emoji_events"
          title="Completed"
          value={`${completed} of ${ICONIC_ROADS.length}`}
          onPress={() => router.push('/roads')}
        />
      ) : (
        <Text style={[type.small, styles.note]}>
          Iconic Roads are hidden. Roads you drive still count, so they’ll be there if you turn
          this back on.
        </Text>
      )}

      <SectionHeader variant="label" title="Preferences" />
      <ListRow
        icon="straighten"
        title="Units"
        value={UNIT_LABELS[units]}
        onPress={() => setUnits(units === 'imperial' ? 'metric' : 'imperial')}
        divider
      />
      <ListRow
        icon="contrast"
        title="Theme"
        value={THEMES.find(([k]) => k === theme)?.[1]}
        onPress={() => {
          const i = THEMES.findIndex(([k]) => k === theme);
          setTheme(THEMES[(i + 1) % THEMES.length][0]);
        }}
        divider
      />
      <ListRow
        icon="local_cafe"
        title="Break reminder"
        value={formatBreakReminder(breakReminderMinutes)}
        onPress={() => setPicking(true)}
      />

      <SectionHeader variant="label" title="Backup" />
      <ListRow
        icon="cloud_upload"
        title="Back up and restore"
        right={<PremiumTag />}
        onPress={premium ? () => comingSoon('Back up and restore') : openPremium}
        divider
      />
      <ListRow
        icon="download"
        title="Export all"
        subtitle={exporting}
        right={<PremiumTag />}
        // Free for everyone for now, though still badged: it goes behind Premium later.
        onPress={confirmExport}
      />

      <SectionHeader variant="label" title="About" />
      {/* Once bought, Premium is a quiet row here rather than a sales card at the top. */}
      {premium ? (
        <ListRow
          icon="workspace_premium"
          title="Premium"
          value="Active"
          onPress={openPremium}
          divider
        />
      ) : null}
      <ListRow
        icon="lock"
        title="Privacy"
        onPress={() =>
          showMessage(
            'Privacy',
            'Your trips stay on this phone. Only if you order a printed poster is it sent to us: its route, words and photo, which go to our printer and are deleted 14 days later. Maps and place names come from Apple or Google.'
          )
        }
        divider
      />
      <ListRow
        icon="info"
        title="Version"
        value={version}
        chevron={false}
        onPress={() =>
          showMessage(`Roads Ahead ${version}`, `${ROADS_ATTRIBUTION}\n${COUNTRIES_ATTRIBUTION}`)
        }
        divider={__DEV__}
      />
      {__DEV__ ? (
        <ListRow
          icon="repeat"
          title="Show Welcome again"
          subtitle="Development builds only"
          onPress={replayOnboarding}
        />
      ) : null}
    </ScrollView>
  );
}

const makeStyles = (c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  h1: { color: c.text, marginHorizontal: 4, marginTop: 8, height: 56, textAlignVertical: 'center' },
  note: { color: c.textMuted, marginHorizontal: 4, marginTop: 4 },
  well: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.accentContainer,
  },
  addIcon: { width: 40, alignItems: 'center' },
  vehicleRow: { minHeight: 64 },
  addTitle: { color: c.accent, fontFamily: type.bodyStrong.fontFamily },
  flex: { flex: 1, minWidth: 0 },
  premium: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 12,
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 14,
    borderRadius: radius.card,
    backgroundColor: c.accentContainer,
  },
  premiumWell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.accentWell,
  },
  premiumTitle: { color: c.onAccentContainer },
  premiumText: { color: c.accentContainerMuted },
  view: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    justifyContent: 'center',
    backgroundColor: c.accent,
  },
  viewText: { color: c.onAccent },
  pressed: { opacity: pressedOpacity },
});

import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BannerCard from '../components/ui/BannerCard';
import { showDialog, showMessage } from '../components/ui/DialogHost';
import ActionSheet from '../components/ActionSheet';
import NavAppSheet from '../components/NavAppSheet';
import PriceSheet from '../components/PriceSheet';
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
import { restoreBackup, saveBackup } from '../services/backupService';
import { exportAllTrips, showExportFailed } from '../services/exportService';
import { countSavedPoints } from '../storage/driveStorage';
import { getExampleTripId } from '../storage/exampleTrip';
import { BREAK_REMINDER_OPTIONS } from '../storage/settingsStorage';
import { listTrips } from '../storage/tripStorage';
import { addVehicle, deleteVehicle, updateVehicle } from '../storage/vehicleStorage';
import { spacing, type } from '../theme';
import { distanceParts, formatBreakReminder } from '../utils/format';
import { COUNTRIES_ATTRIBUTION } from '../utils/countries';
import { formatChargePrice, formatEfficiency, formatFuelPrice } from '../utils/fuel';
import { ICONIC_ROADS, ROADS_ATTRIBUTION } from '../utils/iconicRoads';
import { GPX_ZIPPED_BYTES_PER_POINT } from '../utils/gpx';
import { NAV_APPS } from '../utils/navLinks';
import { READY_ROUTES_ATTRIBUTION } from '../utils/readyRoutes';
import { hasTwin } from '../utils/vehicles';

const UNIT_LABELS = { metric: 'Kilometres', imperial: 'Miles' };
const THEMES = [
  ['system', 'System default'],
  ['light', 'Light'],
  ['dark', 'Dark'],
];

/** The Premium card near the top of You (until Premium is bought); opens the Premium screen. */
function PremiumRow() {
  const styles = useStyles(makeStyles);
  return (
    <BannerCard
      icon="workspace_premium"
      filled
      title="Premium"
      subtitle={PREMIUM_TAGLINE}
      onPress={openPremium}
      accessibilityLabel={`Premium. ${PREMIUM_TAGLINE}`}
      style={styles.premium}
    />
  );
}

/**
 * "Default · 40 mpg · 1,020 mi · 6 trips" (or "3.5 mi/kWh"), led by the registration
 * ("AB12 CDE · …") when another vehicle has the same make and model, to tell
 * them apart.
 */
function vehicleSubtitle(v, vehicles, units) {
  const d = distanceParts(v.distanceM, units);
  return [
    ...(v.registration && hasTwin(v, vehicles) ? [v.registration] : []),
    ...(v.isDefault ? ['Default'] : []),
    ...(formatEfficiency(v) ? [formatEfficiency(v)] : []),
    `${d.value} ${d.unit}`,
    `${v.tripCount} ${v.tripCount === 1 ? 'trip' : 'trips'}`,
  ].join(' · ');
}

/** "£1.46 · set 14 Oct" or "24.5p · set 14 Oct"; "Not set" until then. */
function priceValue(saved, format) {
  if (!saved) return 'Not set';
  const day = new Date(saved.setAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `${format(saved.price)} · set ${day}`;
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
    prices,
    setPrice,
    navApp,
    replayOnboarding,
  } = useSettings();
  const { c } = useTheme();
  const totals = useRoadTotals();
  const completed = totals ? ICONIC_ROADS.filter((r) => totals.has(r.id)).length : 0;
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const [picking, setPicking] = useState(false);
  const [pricing, setPricing] = useState(null); // null | 'fuel' | 'charge'
  const [pickingNav, setPickingNav] = useState(false);
  const version = Constants.expoConfig?.version ?? '—';
  const [vehicles, reloadVehicles] = useVehicles();
  const [editing, setEditing] = useState(null); // null | 'new' | vehicle
  const premium = usePremium();
  // Charging price once there's an electric car; fuel price unless every car is electric.
  const hasElectricCar = !!vehicles?.some((v) => v.electric);
  const hasFuelCar = !vehicles?.length || vehicles.some((v) => !v.electric);
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
      message: `This makes a zip file of about ${mb} MB, with a GPX file for each trip. GPX files hold your routes only. To keep everything, save a backup file.`,
      confirmLabel: 'Export',
      onConfirm: async () => {
        await exportAllTrips(trips, (done, total) => setExporting(`Exporting trip ${done} of ${total}`));
        setExporting(null);
      },
    });
  };

  const [saving, setSaving] = useState(false);

  const confirmBackup = () => {
    if (saving) return;
    showDialog({
      title: 'Save a backup file?',
      message:
        'This saves everything in Roads Ahead to one file: your trips, routes, vehicles and settings. Keep it somewhere safe, like Google Drive or email.',
      confirmLabel: 'Save',
      onConfirm: async () => {
        setSaving(true);
        await saveBackup();
        setSaving(false);
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
      <NavAppSheet visible={pickingNav} onClose={() => setPickingNav(false)} />
      <PriceSheet
        visible={pricing !== null}
        kind={pricing ?? 'fuel'}
        price={prices[pricing]?.price}
        onSave={(price) => {
          setPrice(pricing, price);
          setPricing(null);
        }}
        onClose={() => setPricing(null)}
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
          // Just make and model here; the registration shows on drives.
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
      {/* "£1.46 · set 14 Oct": when it was set, so an old price is noticed. */}
      {hasFuelCar ? (
        <ListRow
          icon="local_gas_station"
          title="Fuel price"
          value={priceValue(prices.fuel, formatFuelPrice)}
          onPress={() => setPricing('fuel')}
          divider
        />
      ) : null}
      {hasElectricCar ? (
        <ListRow
          icon="ev_station"
          title="Charging price"
          value={priceValue(prices.charge, formatChargePrice)}
          onPress={() => setPricing('charge')}
          divider
        />
      ) : null}
      {/* The sat nav app planned drives are handed to. */}
      <ListRow
        icon="map"
        title="Navigate with"
        value={NAV_APPS[navApp]}
        onPress={() => setPickingNav(true)}
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

      {/* The phone's own backup (Android Auto Backup, iCloud) needs no row: the file is what's extra. */}
      <SectionHeader variant="label" title="Backup" />
      <ListRow
        icon="save"
        title="Save a backup file"
        subtitle={saving ? 'Saving…' : null}
        right={<PremiumTag />}
        // Free for everyone for now, though still badged: it goes behind Premium later.
        onPress={confirmBackup}
        divider
      />
      {/* Never behind Premium: nobody should lose their trips when it ends. */}
      <ListRow icon="settings_backup_restore" title="Restore from a file" onPress={restoreBackup} />

      <SectionHeader variant="label" title="Export" />
      <ListRow
        icon="download"
        title="Export routes as GPX"
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
            "Your trips stay on this phone and in your phone's own backup. Only if you order a print is it sent to us: its route, words and photo, which go to our printer and are deleted 14 days later. Maps and place names come from Apple or Google."
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
          showMessage(
            `Roads Ahead ${version}`,
            `${ROADS_ATTRIBUTION}\n${COUNTRIES_ATTRIBUTION}\n${READY_ROUTES_ATTRIBUTION}`
          )
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
  premium: { marginTop: 16 }, // 24 under the title (8 of it inside h1), as on Trips
});

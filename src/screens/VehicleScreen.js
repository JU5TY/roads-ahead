import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import FuelCostRow from '../components/detail/FuelCostRow';
import CountriesCard from '../components/home/CountriesCard';
import IconicCard from '../components/home/IconicCard';
import TripCard from '../components/TripCard';
import VehicleSheet from '../components/VehicleSheet';
import Icon from '../components/ui/Icon';
import IconButton from '../components/ui/IconButton';
import ListRow from '../components/ui/ListRow';
import SectionHeader from '../components/ui/SectionHeader';
import StatRow from '../components/ui/StatRow';
import { useSettings } from '../context/SettingsContext';
import { useRoadCounts } from '../hooks/useRoadCounts';
import { useRouteStatus } from '../hooks/useRouteStatus';
import { useStyles, useTheme } from '../hooks/useTheme';
import { useVehicles } from '../hooks/useVehicles';
import { getVehicleRoadIds } from '../storage/roadStorage';
import { listTrips } from '../storage/tripStorage';
import { deleteVehicle, updateVehicle } from '../storage/vehicleStorage';
import { fonts, pressedOpacity, radius, spacing, type } from '../theme';
import { distanceParts, formatDistance, formatDurationShort, formatElevation } from '../utils/format';
import { driveCost } from '../utils/fuel';
import { READY_ROUTES } from '../utils/readyRoutes';
import { groupIntoDays, summarizeDrives } from '../utils/tripSummary';
import { vehicleLabel } from '../utils/vehicles';

const EVEREST_M = 8849;
const TRIPS_SHOWN = 3; // then "All trips" shows the rest

/** "2.1 Everests" once the climb is one or more; "4,850 m" under that. */
function climbValue(m, units) {
  const everests = Number((m / EVEREST_M).toFixed(1));
  if (everests < 1) return formatElevation(m, units);
  return `${everests} ${everests === 1 ? 'Everest' : 'Everests'}`;
}

/** "29" or "3.5": the car's own figure, null when it isn't set. */
function efficiencyValue(vehicle) {
  const figure = vehicle.electric ? vehicle.milesPerKwh : vehicle.mpg;
  return figure != null ? String(Number(figure.toFixed(1))) : null;
}

/**
 * A vehicle's page, opened from the Garage on You or a trip's Vehicle card:
 * its name and number plate (no map, so it can't be taken for Home), then its
 * totals, Iconic Roads and Trips, countries, highlights, trips and details.
 * The pencil edits it (and removes it).
 */
export default function VehicleScreen() {
  const { id } = useLocalSearchParams();
  const vehicleId = Number(id);
  const { units, prices } = useSettings();
  const { c } = useTheme();
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const [vehicles, reloadVehicles] = useVehicles();
  const routes = useRouteStatus();
  const roadCounts = useRoadCounts();
  const [data, setData] = useState(null); // { trips, roadIds }: only this vehicle's drives
  const [editing, setEditing] = useState(null); // null | 'vehicle' | 'efficiency'
  const [allTrips, setAllTrips] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([listTrips(), getVehicleRoadIds(vehicleId)])
        .then(([all, roadIds]) => {
          if (cancelled) return;
          // A trip driven partly in another vehicle keeps only the drives in this one.
          const trips = all
            .map((t) => ({ ...t, drives: t.drives.filter((d) => d.vehicleId === vehicleId) }))
            .filter((t) => t.drives.length > 0);
          setData({ trips, roadIds });
        })
        .catch((err) => console.warn('[vehicle] load failed', err));
      return () => {
        cancelled = true;
      };
    }, [vehicleId])
  );

  const vehicle = vehicles?.find((v) => v.id === vehicleId) ?? null;
  if (!vehicle || !data) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  const { trips, roadIds } = data;
  const drives = trips.flatMap((t) => t.drives);
  const summary = summarizeDrives(drives);
  const distance = distanceParts(summary.distanceM, units, { whole: true });
  // Drives whose times are hidden (just an Iconic Road) are left out of the time.
  const timed = drives.filter((d) => !d.stats.timesHidden);
  const movingMs = timed.reduce((sum, d) => sum + (d.stats.movingTimeMs ?? 0), 0);
  // Each drive at today's price; null until the car's figure and the price are set.
  const costs = drives.map((d) =>
    driveCost(d.stats.distanceM, vehicle, { fuel: prices.fuel?.price, charge: prices.charge?.price })
  );
  const fuelPounds = costs.every((p) => p != null) ? costs.reduce((sum, p) => sum + p, 0) : null;
  const tripIds = new Set(trips.map((t) => t.id));
  const tripsDone = routes
    ? READY_ROUTES.filter((r) => {
        const status = routes.get(r.id);
        return status?.completed && tripIds.has(status.tripId);
      }).length
    : 0;
  const longestDayM = Math.max(
    0,
    ...trips.flatMap((t) => groupIntoDays(t.drives).map((day) => day.summary.distanceM))
  );
  const efficiency = efficiencyValue(vehicle);
  const shownTrips = allTrips ? trips : trips.slice(0, TRIPS_SHOWN);

  const save = async (fields) => {
    try {
      await updateVehicle(vehicle.id, fields);
    } catch (err) {
      console.warn('[garage] save failed', err);
    }
    setEditing(null);
    reloadVehicles();
  };
  const remove = async () => {
    try {
      await deleteVehicle(vehicle.id);
    } catch (err) {
      console.warn('[garage] delete failed', err);
    }
    router.back();
  };

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + spacing.xl },
        ]}
      >
        <View style={styles.bar}>
          <IconButton
            icon="arrow_back"
            variant="floating"
            accessibilityLabel="Back"
            onPress={() => router.back()}
          />
          <IconButton
            icon="edit"
            variant="floating"
            accessibilityLabel="Edit vehicle"
            onPress={() => setEditing('vehicle')}
          />
        </View>
        <Text style={[type.title, styles.name]} numberOfLines={2} role="heading">
          {vehicleLabel(vehicle)}
        </Text>
        {vehicle.registration ? (
          <View style={styles.plate} accessibilityLabel={`Registration ${vehicle.registration}`}>
            <Text style={styles.plateText} numberOfLines={1}>
              {vehicle.registration}
            </Text>
          </View>
        ) : null}

        <StatRow
          style={styles.first}
          stats={[
            { icon: 'conversion_path', label: 'Distance', value: distance.value, unit: distance.unit },
            {
              icon: 'timer',
              label: 'Driving time',
              value: timed.length ? formatDurationShort(movingMs) : '—',
            },
          ]}
        />
        <View style={[styles.group, styles.under]}>
          <ListRow icon="route" title="Trips" value={String(trips.length)} strongValue dense divider />
          <ListRow icon="directions_car" title="Drives" value={String(drives.length)} strongValue dense divider />
          <ListRow
            icon="trending_up"
            title="Climb"
            value={climbValue(summary.elevationGainM, units)}
            strongValue
            dense
            divider={drives.length > 0}
          />
          {drives.length > 0 ? (
            <FuelCostRow
              pounds={fuelPounds}
              vehicle={vehicle}
              vehicles={vehicles}
              onVehiclesChanged={reloadVehicles}
            />
          ) : null}
        </View>

        <IconicCard roadsDone={roadIds.size} tripsDone={tripsDone} />
        <CountriesCard trips={trips} />

        {drives.length > 0 ? (
          <>
            <SectionHeader title="Highlights" />
            <View style={styles.group}>
              <ListRow
                icon="calendar_month"
                title="Longest day"
                value={formatDistance(longestDayM, units)}
                strongValue
                dense
                divider={summary.maxAltitudeM != null}
              />
              {summary.maxAltitudeM != null ? (
                <ListRow
                  icon="altitude"
                  title="Highest point"
                  value={formatElevation(summary.maxAltitudeM, units)}
                  strongValue
                  dense
                />
              ) : null}
            </View>

            <SectionHeader title="Trips" />
            <View style={styles.trips}>
              {shownTrips.map((t) => (
                <TripCard key={t.id} trip={t} units={units} roadCount={roadCounts.get(t.id) ?? 0} />
              ))}
            </View>
            {trips.length > shownTrips.length ? (
              <Pressable
                onPress={() => setAllTrips(true)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.more, pressed && styles.pressed]}
              >
                <Text style={[type.bodyStrong, styles.accent]}>All trips</Text>
                <Icon name="chevron_right" size={20} color={c.accent} />
              </Pressable>
            ) : null}
          </>
        ) : null}

        <SectionHeader title="Details" />
        <View style={styles.group}>
          <ListRow
            icon={vehicle.electric ? 'ev_station' : 'local_gas_station'}
            title={vehicle.electric ? 'Miles per kWh' : 'Mpg'}
            dense
            onPress={() => setEditing('efficiency')}
            {...(efficiency
              ? { value: efficiency, strongValue: true }
              : { chevron: false, right: <Text style={[type.bodyStrong, styles.accent]}>Add</Text> })}
          />
        </View>
      </ScrollView>

      <VehicleSheet
        visible={editing !== null}
        vehicle={vehicle}
        others={vehicles.filter((v) => v !== vehicle)}
        focusEfficiency={editing === 'efficiency'}
        onSave={save}
        onDelete={remove}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

const makeStyles = (c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.md },
  accent: { color: c.accent },
  bar: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: -4 },
  // A number plate, white in both themes, centred under the name.
  plate: {
    alignSelf: 'center',
    minWidth: 120, // fits its reg, so a short private plate stays a plate
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginTop: 16,
    borderRadius: 8,
    backgroundColor: c.plate,
    ...c.cardShadow,
  },
  plateText: {
    fontFamily: fonts.semibold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: 1.5,
    textAlign: 'center',
    color: c.onPlate,
  },
  name: { marginTop: 12, textAlign: 'center', color: c.text },
  first: { marginTop: 20 }, // under the plate, or the name without one
  under: { marginTop: 12 },
  group: { paddingHorizontal: 12, borderRadius: radius.card, backgroundColor: c.card, ...c.cardShadow },
  trips: { gap: spacing.sm },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    minHeight: 48,
    marginTop: spacing.xs,
    paddingHorizontal: 4,
  },
  pressed: { opacity: pressedOpacity },
});

// What a share card says about a whole trip or one of its drives.
import { countryRows } from './countries';
import { formatDate, tripKicker } from './format';
import { driveNumberFor, groupIntoDays, oneWayLabel, summarizeDrives, tripOneWayLabel, tripTitle } from './tripSummary';
import { vehicleLabel } from './vehicles';

const dayWithYear = (ts) =>
  new Date(ts)
    .toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    .toUpperCase();

/**
 * { kicker, title, subtitle, stats, drivingMs, countries } for the card. `drive` is set when
 * one drive of a longer trip is shared; flags only show for two or more countries,
 * and `drivingMs` is null when every drive's times are hidden. The subtitle starts with
 * the one vehicle driven, if there is one, from the Garage's `vehicles`.
 */
export function shareCardContent(trip, drive = null, vehicles = []) {
  const drives = drive ? [drive] : trip.drives;
  const multiDay = groupIntoDays(trip.drives).length > 1;
  const name = tripTitle(trip);
  const title = name ?? formatDate(drives[0].startedAt);

  let kicker;
  if (drive) {
    const number = driveNumberFor(trip.drives, drive.startedAt);
    kicker =
      trip.drives.length > 1
        ? `${dayWithYear(drive.startedAt)} · DRIVE ${number}`
        : dayWithYear(drive.startedAt);
  } else if (multiDay) {
    const days = groupIntoDays(trip.drives).length;
    kicker = tripKicker(drives[0].startedAt, drives.at(-1).endedAt, days, { withYear: true });
  } else {
    kicker = dayWithYear(drives[0].startedAt);
  }

  const route = drive ? oneWayLabel(drive.places) : tripOneWayLabel(trip);
  const countries = countryRows(drives);
  const timed = drives.filter((d) => !d.stats.timesHidden);
  const usedVehicleIds = [...new Set(drives.map((d) => d.vehicleId).filter((v) => v != null))];
  const vehicle = usedVehicleIds.length === 1 ? vehicles.find((v) => v.id === usedVehicleIds[0]) : null;
  return {
    kicker,
    title,
    // An unnamed trip is already titled by its route, so don't say it twice.
    subtitle:
      [vehicle ? vehicleLabel(vehicle) : null, route === title ? null : route]
        .filter(Boolean)
        .join(' · ') || null,
    stats: summarizeDrives(drives),
    drivingMs: timed.length ? summarizeDrives(timed).movingTimeMs : null,
    countries: countries.length > 1 ? countries : [],
  };
}

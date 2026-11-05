// What a share card says about a whole trip or one of its drives.
import { countryRows } from './countries';
import { formatDate, tripKicker } from './format';
import { dayNumberFor, groupIntoDays, routeLabel, summarizeDrives, tripRouteLabel, tripTitle } from './tripSummary';

const dayWithYear = (ts) =>
  new Date(ts)
    .toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    .toUpperCase();

/**
 * { kicker, title, subtitle, stats, drivingMs, countries } for the card. `drive` is set when
 * one drive of a longer trip is shared; flags only show for two or more countries,
 * and `drivingMs` is null when every drive's times are hidden.
 */
export function shareCardContent(trip, drive = null) {
  const drives = drive ? [drive] : trip.drives;
  const multiDay = groupIntoDays(trip.drives).length > 1;
  const name = tripTitle(trip);
  const title = name ?? formatDate(drives[0].startedAt);

  let kicker;
  if (drive) {
    const day = dayNumberFor(
      trip.drives.filter((d) => d.startedAt < drive.startedAt),
      drive.startedAt
    );
    kicker = multiDay ? `${dayWithYear(drive.startedAt)} · DAY ${day}` : dayWithYear(drive.startedAt);
  } else if (multiDay) {
    const days = groupIntoDays(trip.drives).length;
    kicker = tripKicker(drives[0].startedAt, drives.at(-1).endedAt, days, { withYear: true });
  } else {
    kicker = dayWithYear(drives[0].startedAt);
  }

  const route = drive ? routeLabel(drive.places) : tripRouteLabel(trip);
  const countries = countryRows(drives);
  const timed = drives.filter((d) => !d.stats.timesHidden);
  return {
    kicker,
    title,
    // An unnamed trip is already titled by its route, so don't say it twice.
    subtitle: route === title ? null : route,
    stats: summarizeDrives(drives),
    drivingMs: timed.length ? summarizeDrives(timed).movingTimeMs : null,
    countries: countries.length > 1 ? countries : [],
  };
}

// Registration lookups, through the app's server (server/app, POST
// /vehicle-lookup), which asks DVLA and DVSA. The only file that talks to it.
// Offered on UK phones only: a lookup can only find UK vehicles, so everyone
// else goes straight to entering the details by hand.

import { onUkPhone } from '../utils/region';

// Set per build or update, as for fuel prices (services/fuelPriceService.js).
const API = process.env.EXPO_PUBLIC_SERVER_URL;

/** Whether Add vehicle starts with the registration and Edit offers Look up. */
export const lookupOffered = !!API && onUkPhone;

/**
 * What the registration finds: { vehicle } (utils/vehicleLookup.js
 * mergeVehicle), { notFound: true }, or { error } with a message to show as it is.
 */
export async function lookUpRegistration(registration) {
  let res;
  try {
    res = await fetch(`${API}/vehicle-lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registration }),
    });
  } catch {
    return { error: "Couldn't look it up. Check your connection and try again." };
  }
  const body = await res.json().catch(() => ({}));
  if (res.ok && body.vehicle) return { vehicle: body.vehicle };
  if (res.status === 404) return { notFound: true };
  if (res.status === 400 || res.status === 429) return { error: body.message ?? 'Please try again.' };
  return { error: "Vehicle details can't be looked up right now. Try again later, or enter the details yourself." };
}

// Ordering a printed poster: the print server (server/poster) takes the poster's
// spec and, for a photo poster, the photo, then hands back a Stripe page for the
// address and payment. Nothing else about the trip is sent.
import { File } from 'expo-file-system';
import { Asset } from 'expo-media-library';
import { Linking } from 'react-native';

// Set per build or update; without it the print page shows but can't take orders.
const API = process.env.EXPO_PUBLIC_POSTER_API;
export const printingOpen = !!API;

// Formats the print server can put on paper as they are.
const PHOTO_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };

/** An error whose message can be shown as it is. */
export class PosterOrderError extends Error {}

async function call(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
  } catch {
    throw new PosterOrderError("Couldn't reach the printer. Check your connection and try again.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.warn('[poster] request failed', path, res.status, body.error);
    throw new PosterOrderError(body.message ?? 'Something went wrong. Please try again.');
  }
  return body;
}

/** The photo's file and its content type, or an error for a format we can't print. */
async function photoFile(photoId) {
  const asset = new Asset(photoId);
  const [uri, filename] = await Promise.all([asset.getUri(), asset.getFilename()]);
  const type = PHOTO_TYPES[filename.split('.').pop()?.toLowerCase()];
  if (!type) {
    throw new PosterOrderError(
      "This photo's format can't be printed yet. Please choose another photo."
    );
  }
  return { file: new File(uri), type };
}

// The order waiting on Stripe, for the Order placed screen when the app comes back.
let pending = null;
export const pendingPosterOrder = () => pending;

/**
 * Start an order for `spec` (from posterSpec()), with `photoId` for a photo poster,
 * and open Stripe's checkout. Resolves once the page is open. `tripId` is where Done
 * goes back to.
 */
export async function startPosterOrder({ spec, photoId, tripId }) {
  const photo = photoId ? await photoFile(photoId) : null;
  const { orderId, ref, uploadUrl } = await call('/orders', {
    method: 'POST',
    body: JSON.stringify({ spec }),
  });
  if (photo) {
    const res = await photo.file
      .upload(`${API}${uploadUrl}`, { httpMethod: 'PUT', headers: { 'Content-Type': photo.type } })
      .catch(() => null);
    if (!res || res.status >= 300) {
      console.warn('[poster] photo upload failed', res?.status, res?.body);
      throw new PosterOrderError("Couldn't send the photo. Check your connection and try again.");
    }
  }
  const { checkoutUrl } = await call(`/orders/${orderId}/checkout`, { method: 'POST' });
  pending = { orderId, ref, tripId, spec };
  await Linking.openURL(checkoutUrl);
}

/** What the server knows about an order: { ref, size, title, status, amount }. */
export const getPosterOrder = (orderId) => call(`/orders/${orderId}`);

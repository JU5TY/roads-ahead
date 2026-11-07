// Ordering a printed poster. The phone draws the print-ready PDF and sends it to the
// print server (server/poster), which hands back a Stripe page for the address and
// payment. Nothing else about the trip is sent.
import { Asset as BundledAsset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import { Asset as PhotoAsset } from 'expo-media-library';
import { Linking } from 'react-native';

import { fontFiles, fonts } from '../theme';
import { renderPoster } from '../utils/posterPdf';

// Set per build or update; without it the print page shows but can't take orders.
const API = process.env.EXPO_PUBLIC_POSTER_API;
export const printingOpen = !!API;

// Formats that can go into the PDF as they are.
const PHOTO_TYPES = { jpg: 'jpg', jpeg: 'jpg', png: 'png' };

/** An error whose message can be shown as it is. */
export class PosterOrderError extends Error {}

/** A file bundled with the app, such as a font, as bytes. */
async function bundledBytes(module) {
  const asset = BundledAsset.fromModule(module);
  await asset.downloadAsync();
  return new File(asset.localUri).bytes();
}

/** The gallery photo as { bytes, type }, or an error for a format that can't be printed. */
async function photoBytes(photoId) {
  const asset = new PhotoAsset(photoId);
  const [uri, filename] = await Promise.all([asset.getUri(), asset.getFilename()]);
  const type = PHOTO_TYPES[filename.split('.').pop()?.toLowerCase()];
  if (!type) {
    throw new PosterOrderError(
      "This photo's format can't be printed yet. Please choose another photo."
    );
  }
  return { bytes: await new File(uri).bytes(), type };
}

// The order waiting on Stripe, for the Order placed screen when the app comes back.
let pending = null;
export const pendingPosterOrder = () => pending;

/**
 * Draw `spec` (from posterSpec()) as a PDF, with `photoId` for a photo poster, send
 * it, and open Stripe's checkout. Resolves once the page is open. `tripId` is where
 * Done goes back to.
 */
export async function startPosterOrder({ spec, photoId, tripId }) {
  const [light, regular, photo] = await Promise.all([
    bundledBytes(fontFiles[fonts.light]),
    bundledBytes(fontFiles[fonts.regular]),
    photoId ? photoBytes(photoId) : null,
  ]);
  const pdf = await renderPoster({ spec, fonts: { light, regular }, photo });

  const file = new File(Paths.cache, `poster-${Date.now()}.pdf`);
  try {
    await file.write(pdf);
    const query = new URLSearchParams({ size: spec.size, title: spec.lines.title.text });
    const res = await file
      .upload(`${API}/orders?${query}`, {
        httpMethod: 'POST',
        headers: { 'Content-Type': 'application/pdf' },
      })
      .catch(() => null);
    if (!res) {
      throw new PosterOrderError("Couldn't reach the printer. Check your connection and try again.");
    }
    let body = {};
    try {
      body = JSON.parse(res.body);
    } catch {
      // Not the server's JSON: reported below.
    }
    if (res.status >= 300 || !body.checkoutUrl) {
      console.warn('[poster] order failed', res.status, res.body);
      throw new PosterOrderError(body.message ?? 'Something went wrong. Please try again.');
    }
    pending = { orderId: body.orderId, ref: body.ref, tripId, spec };
    await Linking.openURL(body.checkoutUrl);
  } finally {
    if (file.exists) file.delete();
  }
}

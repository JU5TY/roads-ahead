// Share a card: capture the view as a PNG, then open the share sheet.
import * as Sharing from 'expo-sharing';
import { captureRef, releaseCapture } from 'react-native-view-shot';

import { showMessage } from '../components/ui/DialogHost';
import { getShareCardFile, setShareCardFile } from '../storage/settingsStorage';

let sharing = false;

/**
 * Delete the last shared image. Not done straight after sharing, as the receiving app
 * may still be reading it: on leaving the Share screen, before the next image, and on
 * launch for when the app was killed while another app was open.
 */
export function clearShareCard() {
  try {
    const uri = getShareCardFile();
    if (!uri) return;
    releaseCapture(uri);
    setShareCardFile(null);
  } catch (err) {
    console.warn('Could not remove the shared image', err);
  }
}

/** Capture `viewRef` and share it. Errors end in a message rather than a throw. */
export async function shareCardImage(viewRef) {
  if (sharing) return;
  sharing = true;
  try {
    clearShareCard();
    const uri = await captureRef(viewRef, { format: 'png', result: 'tmpfile' });
    setShareCardFile(uri);
    // Released first: a share that never returns mustn't block the next one.
    sharing = false;
    await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share' });
  } catch (err) {
    console.warn('Share failed', err);
    showMessage("Couldn't share", 'Something went wrong making the image. Please try again.');
  } finally {
    sharing = false;
  }
}

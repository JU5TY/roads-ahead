// Share a card: capture the view as a PNG, then open the share sheet.
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

import { showMessage } from '../components/ui/DialogHost';

let sharing = false;

/** Capture `viewRef` and share it. Errors end in a message rather than a throw. */
export async function shareCardImage(viewRef) {
  if (sharing) return;
  sharing = true;
  try {
    const uri = await captureRef(viewRef, { format: 'png', result: 'tmpfile' });
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

// Export: one trip as a GPX file, or every trip as a zip with a GPX file each.
// Written to the cache folder, then the share sheet sends it to another app, Drive,
// email and so on. Drives are read and written one at a time, so even hundreds of
// trips never sit in memory together.
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { showMessage } from '../components/ui/DialogHost';
import { getDrivePoints } from '../storage/driveStorage';
import { formatDate } from '../utils/format';
import { gpxEnd, gpxFileName, gpxSegment, gpxStart, gpxTrackEnd, gpxTrackStart } from '../utils/gpx';
import { tripTitle } from '../utils/tripSummary';
import { createZipWriter } from '../utils/zipWriter';

// Exports share a folder, so a second one mustn't start while a file is being made.
let making = false;

const titleOf = (trip) => tripTitle(trip) ?? formatDate(trip.drives[0].startedAt);

export const showExportFailed = () =>
  showMessage("Couldn't export", 'Something went wrong making the file. Please try again.');

/** Write one trip's whole GPX document through `write(text)`. */
async function writeTripGpx(trip, write) {
  await write(gpxStart());
  await write(gpxTrackStart(titleOf(trip), trip.notes));
  for (const drive of trip.drives) {
    await write(gpxSegment(await getDrivePoints(drive.id)));
  }
  await write(gpxTrackEnd());
  await write(gpxEnd());
}

/** Make a file with `fill(append)`, then share it. Errors end in a message rather than a throw. */
async function makeAndShare(fileName, mimeType, fill) {
  if (making) {
    showMessage('Export already running', 'Please wait for it to finish, then try again.');
    return;
  }
  making = true;
  let file = null;
  try {
    // The last export is cleared here, not after sharing: the receiving app may still be reading it.
    const folder = new Directory(Paths.cache, 'exports');
    if (folder.exists) folder.delete();
    folder.create();
    file = new File(folder, fileName);
    file.create();
    await fill((content) => file.write(content, { append: true }));
    // Released first: the file is finished, and a share that never returns mustn't block exports.
    making = false;
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: 'Export' });
  } catch (err) {
    console.warn('Export failed', err);
    showExportFailed();
    try {
      if (file?.exists) file.delete();
    } catch (cleanupErr) {
      console.warn('Could not remove the failed export', cleanupErr);
    }
  } finally {
    making = false;
  }
}

/** A name no earlier file in the zip has: two "scotland.gpx" become "scotland.gpx" and "scotland-2.gpx". */
function uniqueFileName(fileName, taken) {
  let name = fileName;
  for (let n = 2; taken.has(name); n++) {
    name = fileName.replace(/\.gpx$/, `-${n}.gpx`);
  }
  taken.add(name);
  return name;
}

/** Export one trip as a GPX file named after it. */
export const exportTrip = (trip) =>
  makeAndShare(gpxFileName(titleOf(trip)), 'application/gpx+xml', (append) =>
    writeTripGpx(trip, append)
  );

/** Export `trips` as a zip with a GPX file each; `onProgress(done, total)` follows along. */
export const exportAllTrips = (trips, onProgress) =>
  makeAndShare('trips.zip', 'application/zip', async (append) => {
    const zip = createZipWriter(append);
    const taken = new Set();
    for (const [i, trip] of trips.entries()) {
      onProgress?.(i + 1, trips.length);
      const entry = zip.addFile(uniqueFileName(gpxFileName(titleOf(trip)), taken));
      await writeTripGpx(trip, entry.write);
      await entry.end();
    }
    await zip.end();
  });

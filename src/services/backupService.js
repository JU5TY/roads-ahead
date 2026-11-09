// Backup file: everything in Roads Ahead (trips, drives, routes, vehicles, Iconic
// Roads and settings) as one file the person keeps wherever they like, to restore
// on this phone or another, Android or iPhone. It's a copy of the database plus a
// backup_info table, so restoring is a database copy too. Separate from the
// phone's own backup (Android Auto Backup, iCloud), which needs nothing from us.
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Updates from 'expo-updates';
import * as SQLite from 'expo-sqlite';
import Storage from 'expo-sqlite/kv-store';
import { DevSettings } from 'react-native';

import { showDialog, showMessage } from '../components/ui/DialogHost';
import { SCHEMA_VERSION, getDb, restoreDatabase } from '../storage/db';
import { getActiveDrive } from '../storage/driveStorage';
import { formatDate } from '../utils/format';

const FORMAT = 'roads-ahead-backup';
export const BACKUP_EXTENSION = '.roadsahead';

// Key-value entries that travel with the database: preferences, and what the
// database's own state depends on (the example trip's id, which versions of the
// roads, borders and crossings its drives were checked against).
const CARRIED_KEYS = [
  'settings.units',
  'settings.breakReminderMinutes',
  'settings.showIconicRoads',
  'settings.theme',
  'exampleTrip.id',
  'roads.checkedVersion',
  'countries.checkedVersion',
  'crossings.checkedVersion',
];

// Working copies, next to the app's database so SQLite opens them by name.
const OUT_DB = 'backup-out.db';
const IN_DB = 'backup-in.db';

// One backup or restore at a time: they share the working copies.
let busy = false;

const dbFile = (name) => new File(`file://${encodeURI(SQLite.defaultDatabaseDirectory)}`, name);

/** Delete a working copy and the files SQLite keeps beside it. */
function removeWorkingCopy(name) {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const file = dbFile(name + suffix);
    if (file.exists) file.delete();
  }
}

/** "roads-ahead-2026-11-09.roadsahead", dated on this phone's calendar. */
function backupFileName(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `roads-ahead-${day}${BACKUP_EXTENSION}`;
}

/** Copy the database into a backup file, then share it. Errors end in a message rather than a throw. */
export async function saveBackup() {
  if (busy) return;
  busy = true;
  let out = null;
  try {
    removeWorkingCopy(OUT_DB);
    out = await SQLite.openDatabaseAsync(OUT_DB, { useNewConnection: true });
    await SQLite.backupDatabaseAsync({ sourceDatabase: await getDb(), destDatabase: out });
    await out.execAsync(
      'PRAGMA journal_mode = DELETE; CREATE TABLE backup_info (key TEXT PRIMARY KEY, value TEXT);'
    );
    const info = [
      ['format', FORMAT],
      ['created_at', String(Date.now())],
      ['app_version', Constants.expoConfig?.version ?? ''],
      ...CARRIED_KEYS.map((key) => [`kv:${key}`, Storage.getItemSync(key)]),
    ];
    for (const [key, value] of info) {
      await out.runAsync('INSERT INTO backup_info (key, value) VALUES (?, ?)', key, value);
    }
    await out.closeAsync();
    out = null;

    // The last backup is cleared here, not after sharing: the receiving app may still be reading it.
    const folder = new Directory(Paths.cache, 'backups');
    if (folder.exists) folder.delete();
    folder.create();
    const file = new File(folder, backupFileName());
    await dbFile(OUT_DB).move(file);
    busy = false;
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/octet-stream',
      dialogTitle: 'Save backup file',
    });
  } catch (err) {
    console.warn('Backup failed', err);
    showMessage("Couldn't save the backup", 'Something went wrong making the file. Please try again.');
  } finally {
    await out?.closeAsync().catch(() => {});
    try {
      removeWorkingCopy(OUT_DB);
    } catch (cleanupErr) {
      console.warn('Could not remove the backup working copy', cleanupErr);
    }
    busy = false;
  }
}

/** The picked file opened as a backup, with what it holds; throws NotABackup or TooNew. */
async function openBackup(uri) {
  removeWorkingCopy(IN_DB);
  await new File(uri).copy(dbFile(IN_DB));
  const db = await SQLite.openDatabaseAsync(IN_DB, { useNewConnection: true });
  try {
    // A file that isn't SQLite, or has no backup_info, fails here.
    const rows = await db.getAllAsync('SELECT key, value FROM backup_info').catch(() => []);
    const info = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    if (info.format !== FORMAT) throw new Error('NotABackup');
    const { user_version: version } = await db.getFirstAsync('PRAGMA user_version');
    if (version > SCHEMA_VERSION) throw new Error('TooNew');
    const { trips } = await db.getFirstAsync('SELECT COUNT(*) AS trips FROM trips');
    return { db, info, trips };
  } catch (err) {
    await db.closeAsync().catch(() => {});
    throw err;
  }
}

/** Put the backup's database and settings in place of this phone's, then start the app afresh. */
async function restore({ db, info }) {
  await restoreDatabase(db);
  for (const key of CARRIED_KEYS) {
    const value = info[`kv:${key}`];
    if (value == null) await Storage.removeItemAsync(key);
    else await Storage.setItemAsync(key, value);
  }
  // Someone restoring has used the app before, so Welcome is skipped.
  await Storage.setItemAsync('settings.onboarded', 'true');
  await db.closeAsync();
  removeWorkingCopy(IN_DB);
  // Every screen and the settings read their data again.
  if (__DEV__) DevSettings.reload();
  else await Updates.reloadAsync();
}

/** Pick a backup file, confirm, and restore it. Errors end in a message rather than a throw. */
export async function restoreBackup() {
  if (busy) return;
  if (await getActiveDrive().catch(() => null)) {
    showMessage('Stop recording first', 'A backup can be restored once this drive is finished.');
    return;
  }
  busy = true;
  let opened = null;
  try {
    const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (picked.canceled) return;
    opened = await openBackup(picked.assets[0].uri);
  } catch (err) {
    busy = false;
    if (err.message === 'TooNew') {
      showMessage(
        'Update Roads Ahead first',
        'This backup was made by a newer version of Roads Ahead. Update the app, then try again.'
      );
    } else {
      if (err.message !== 'NotABackup') console.warn('Opening the backup failed', err);
      showMessage(
        "That isn't a backup file",
        `Choose a Roads Ahead backup file, ending in ${BACKUP_EXTENSION}.`
      );
    }
    return;
  } finally {
    if (!opened) busy = false;
  }

  const { trips, info } = opened;
  const saved = Number(info.created_at);
  showDialog({
    title: 'Restore this backup?',
    message:
      `It replaces everything in Roads Ahead on this phone with the backup from ` +
      `${formatDate(saved)}: ${trips === 1 ? '1 trip' : `${trips} trips`}, ` +
      `with their vehicles and settings. This can't be undone.`,
    confirmLabel: 'Restore',
    destructive: true,
    onConfirm: async () => {
      try {
        await restore(opened);
      } catch (err) {
        console.warn('Restore failed', err);
        showMessage("Couldn't restore", 'Something went wrong. Please try again.');
      } finally {
        busy = false;
      }
    },
    onCancel: async () => {
      await opened.db.closeAsync().catch(() => {});
      removeWorkingCopy(IN_DB);
      busy = false;
    },
  });
}

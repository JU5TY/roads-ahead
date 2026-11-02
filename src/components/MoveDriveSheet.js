import { useEffect, useState } from 'react';

import { showMessage } from './ui/DialogHost';
import { moveDrive } from '../storage/driveStorage';
import { listTrips } from '../storage/tripStorage';
import { formatDate, formatDateRange } from '../utils/format';
import { tripTitle } from '../utils/tripSummary';
import ActionSheet from './ActionSheet';

const MAX_CHOICES = 15;

/**
 * Pick a trip to move `drive` into. `allowNewTrip` adds "Make it a separate trip"
 * (pointless when the drive is already alone in its trip). Calls onMoved(tripId).
 */
export default function MoveDriveSheet({ visible, drive, allowNewTrip, onMoved, onClose }) {
  const [trips, setTrips] = useState([]);

  useEffect(() => {
    if (!visible) return;
    listTrips()
      .then((all) => setTrips(all.filter((t) => t.id !== drive.tripId).slice(0, MAX_CHOICES)))
      .catch((err) => console.warn('[move] load trips failed', err));
  }, [visible, drive?.tripId]);

  const move = async (targetTripId) => {
    onClose();
    try {
      onMoved(await moveDrive(drive.id, targetTripId));
    } catch (err) {
      showMessage('Couldn’t move the drive', err.message);
    }
  };

  const actions = [
    ...(allowNewTrip
      ? [{ icon: 'add', label: 'Make it a separate trip', onPress: () => move(null) }]
      : []),
    ...trips.map((t) => ({
      key: `trip-${t.id}`,
      icon: 'route',
      label: tripTitle(t) ?? formatDate(t.drives[0].startedAt),
      detail: formatDateRange(t.drives[0].startedAt, t.drives.at(-1).endedAt),
      onPress: () => move(t.id),
    })),
  ];

  return (
    <ActionSheet
      visible={visible}
      title="Move drive to…"
      message={trips.length === 0 && !allowNewTrip ? 'There are no other trips yet.' : undefined}
      actions={actions}
      onClose={onClose}
    />
  );
}

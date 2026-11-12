import { useEffect, useState } from 'react';

import { showMessage } from './ui/DialogHost';
import { drivenPlanDriveIds, linkDriveToPlan, listPlans } from '../storage/planStorage';
import { driveReach, driveStart } from '../utils/plans';
import ActionSheet from './ActionSheet';

/** "Fort William → Applecross", "From Inverness", or "No stops yet". */
function driveRoute(plan, index) {
  const start = driveStart(plan, index);
  const finish = plan.drives[index].stops.length ? driveReach(plan, index) : null;
  if (!finish) return start ? `From ${start.name ?? 'a dropped pin'}` : 'No stops yet';
  return `${start?.name ?? 'Your location'} → ${finish.name ?? 'Dropped pin'}`;
}

/**
 * Link a drive recorded with plain Record to the planned drive it was: every
 * plan's drives, newest plan first ("Scotland 2027 · Drive 3", its route, and
 * "Driven" once one has a recording). Calls onLinked() once saved.
 */
export default function LinkPlanDriveSheet({ visible, drive, onLinked, onClose }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    if (!visible) return;
    Promise.all([listPlans(), drivenPlanDriveIds()])
      .then(([plans, driven]) =>
        setRows(
          plans.flatMap((plan) =>
            plan.drives.map((d, i) => ({
              id: d.id,
              label: `${plan.name} · Drive ${i + 1}`,
              detail: driven.has(d.id) ? `${driveRoute(plan, i)} · Driven` : driveRoute(plan, i),
            }))
          )
        )
      )
      .catch((err) => console.warn('[link] load plans failed', err));
  }, [visible]);

  const link = async (planDriveId) => {
    onClose();
    try {
      await linkDriveToPlan(drive.id, planDriveId);
      onLinked();
    } catch (err) {
      showMessage('Couldn’t link the drive', err.message);
    }
  };

  return (
    <ActionSheet
      visible={visible}
      message={rows && rows.length === 0 ? 'There are no plans yet. Tap Plan trip on the Planned tab.' : undefined}
      actions={(rows ?? []).map((r) => ({
        key: `plan-drive-${r.id}`,
        icon: 'route',
        label: r.label,
        detail: r.detail,
        onPress: () => link(r.id),
      }))}
      onClose={onClose}
    />
  );
}

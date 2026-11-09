import { useEffect, useState } from 'react';

import ConfirmDialog from './ConfirmDialog';

// The mounted host's setter, so any screen or helper can open a dialog.
let open = null;

/**
 * Show the app's dialog from anywhere: { title, highlight?, message?,
 * cancelLabel? (null for a single button), confirmLabel, destructive?, onConfirm?,
 * onCancel? (also when dismissed) }.
 * Needs <DialogHost /> mounted once (the root layout does).
 */
export function showDialog(options) {
  open?.(options);
}

/** A one-button dialog for information and errors. */
export const showMessage = (title, message) =>
  showDialog({ title, message, cancelLabel: null, confirmLabel: 'OK' });

export default function DialogHost() {
  // Kept after closing so the text doesn't vanish while the dialog fades out.
  const [dialog, setDialog] = useState({ visible: false, options: {} });
  useEffect(() => {
    open = (options) => setDialog({ visible: true, options });
    return () => {
      open = null;
    };
  }, []);
  const close = () => setDialog((d) => ({ ...d, visible: false }));
  const { onConfirm, onCancel, ...options } = dialog.options;
  return (
    <ConfirmDialog
      {...options}
      visible={dialog.visible}
      onCancel={() => {
        close();
        onCancel?.();
      }}
      onConfirm={() => {
        close();
        onConfirm?.();
      }}
    />
  );
}

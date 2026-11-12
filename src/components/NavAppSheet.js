import { useSettings } from '../context/SettingsContext';
import { NAV_APP_OPTIONS } from '../storage/settingsStorage';
import { NAV_APPS, takesWholeDrive } from '../utils/navLinks';
import ActionSheet from './ActionSheet';

const ICONS = { google: 'map', apple: 'map', waze: 'navigation' };

/** Navigate with: picks the sat nav app planned drives are handed to (on You and Start drive). */
export default function NavAppSheet({ visible, onClose }) {
  const { navApp, setNavApp } = useSettings();
  return (
    <ActionSheet
      visible={visible}
      actions={NAV_APP_OPTIONS.map((app) => ({
        key: app,
        icon: ICONS[app],
        label: NAV_APPS[app],
        detail: takesWholeDrive(app) ? 'Gets the whole route at once' : 'One stop at a time',
        selected: app === navApp,
        onPress: () => {
          setNavApp(app);
          onClose();
        },
      }))}
      onClose={onClose}
    />
  );
}

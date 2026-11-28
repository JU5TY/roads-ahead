// Android's status-bar icon while a drive records: the logo as a white disc with
// its road and dot cut out, so it's as solid as the icons beside it (the road on
// its own was a thin line that looked tiny). expo-location's foreground service
// picks up a drawable called notification_icon by itself, so nothing else needs it.
// The PNGs (assets/notification-icon) are drawn from the 1024 logo: the disc
// 22 of 24dp across, the road 66 wide, as on the app icon.
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const DENSITIES = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];

module.exports = (config) =>
  withDangerousMod(config, [
    'android',
    async (cfg) => {
      const res = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res');
      const from = path.join(cfg.modRequest.projectRoot, 'assets/notification-icon');
      for (const density of DENSITIES) {
        const dir = path.join(res, `drawable-${density}`);
        await fs.promises.mkdir(dir, { recursive: true });
        await fs.promises.copyFile(
          path.join(from, `notification_icon-${density}.png`),
          path.join(dir, 'notification_icon.png')
        );
      }
      // The old vector of the same name would clash with the PNGs.
      await fs.promises.rm(path.join(res, 'drawable/notification_icon.xml'), { force: true });
      return cfg;
    },
  ]);

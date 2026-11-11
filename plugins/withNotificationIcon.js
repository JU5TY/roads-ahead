// Android's status-bar icon while a drive records: the logo's road and dot in
// white, as a tiny vector. expo-location's foreground service picks up a
// drawable called notification_icon by itself, so nothing else needs it.
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

// The logo's road (a 66-wide line) and its start dot, from the 1024 app icon,
// cropped to the road so it fills the 24dp icon.
const ICON = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="600"
    android:viewportHeight="600">
    <group android:translateX="-206.5" android:translateY="-211">
        <path
            android:pathData="M460,282 L556,300 Q600,309 600,346 Q600,383 556,392 L372,427 Q333,435 333,475 Q333,515 372,522 L704,585 Q745,593 745,633 Q745,673 704,681 L268,763"
            android:strokeColor="#FFFFFFFF"
            android:strokeWidth="66"
            android:strokeLineCap="round"
            android:strokeLineJoin="round" />
        <path
            android:pathData="M406,280 a54,54 0 1,0 108,0 a54,54 0 1,0 -108,0"
            android:fillColor="#FFFFFFFF" />
    </group>
</vector>
`;

module.exports = (config) =>
  withDangerousMod(config, [
    'android',
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res/drawable');
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(path.join(dir, 'notification_icon.xml'), ICON);
      return cfg;
    },
  ]);

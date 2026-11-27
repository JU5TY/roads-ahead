// Adds the react-native-maps plugin with the Google Maps key from the
// environment (needed for Android development/production builds only;
// iOS uses Apple Maps and Expo Go ships its own key), and the Android
// recording notification's status-bar icon (plugins/withNotificationIcon.js).
// The trip planner's routing key (services/routing.js) comes from the
// environment too; Google accepts it only with the app's package name and the
// SHA-1 fingerprint of the key the app is signed with (not a secret).
const ANDROID_CERT = 'E6A6F1C357A51AA0A0226A1D6F3AFDB1D0C76774';

// The permission messages name the app, from app.json's "name" (which
// src/utils/appName.js matches), so a rename changes them too.
const PERMISSION_MESSAGES = {
  'expo-location': (name) => ({
    locationWhenInUsePermission: `${name} uses your location to record your route.`,
    locationAlwaysAndWhenInUsePermission: `${name} records your route while you drive, including while you're using Google Maps.`,
  }),
  'expo-media-library': (name) => ({
    photosPermission: `${name} shows the photos you took during a trip alongside it.`,
  }),
};

const withMessages = (plugin, name) => {
  const messages = Array.isArray(plugin) && PERMISSION_MESSAGES[plugin[0]];
  return messages ? [plugin[0], { ...plugin[1], ...messages(name) }] : plugin;
};

module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...config.plugins.map((plugin) => withMessages(plugin, config.name)),
    ['react-native-maps', { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY }],
    './plugins/withNotificationIcon',
  ],
  extra: {
    ...config.extra,
    routesApiKey: process.env.GOOGLE_ROUTES_API_KEY,
    androidPackage: config.android?.package,
    androidCert: ANDROID_CERT,
  },
});

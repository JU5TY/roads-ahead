// Adds the react-native-maps plugin with the Google Maps key from the
// environment (needed for Android development/production builds only;
// iOS uses Apple Maps and Expo Go ships its own key), and the Android
// recording notification's status-bar icon (plugins/withNotificationIcon.js).
// The trip planner's routing key (services/routing.js) comes from the
// environment too; Google accepts it only with the app's package name and the
// SHA-1 fingerprint of the key the app is signed with (not a secret).
const ANDROID_CERT = 'E6A6F1C357A51AA0A0226A1D6F3AFDB1D0C76774';

module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...config.plugins,
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

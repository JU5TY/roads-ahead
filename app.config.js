// Adds the react-native-maps plugin with the Google Maps key from the
// environment (needed for Android development/production builds only;
// iOS uses Apple Maps and Expo Go ships its own key), and the Android
// recording notification's status-bar icon (plugins/withNotificationIcon.js).
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...config.plugins,
    ['react-native-maps', { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY }],
    './plugins/withNotificationIcon',
  ],
});

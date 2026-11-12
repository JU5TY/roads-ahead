// The app's entry. The background location task is defined first, before Expo
// Router, because Android can start the app just to hand a running recording its
// GPS fixes, with no screens to draw: then src/app/_layout.js (which imports it
// too) is never loaded, the task isn't defined, and every fix is dropped.
import './src/services/locationService';
import 'expo-router/entry';

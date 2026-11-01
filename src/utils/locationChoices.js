import { Platform } from 'react-native';

// What to pick in the phone's location prompt and Settings, in each
// platform's own wording, for the PhoneChoice card.
const ios = Platform.OS === 'ios';

/** The system prompt, from the Location screen and the Record sheet. */
export const PROMPT_CHOICE = {
  title: 'Your phone asks next',
  options: ios
    ? [
        ['my_location', 'Precise: On'],
        ['radio_button_checked', 'Allow While Using App'],
      ]
    : [
        ['my_location', 'Precise'],
        ['radio_button_checked', 'While using the app'],
      ],
  caption: 'Then every drive is just tap Record and go',
};

/** Settings, once the prompt won't show again (Linking.openSettings opens the app's page). */
export const SETTINGS_ALLOW = {
  title: 'In Settings',
  step: ios ? 'Tap Location, then choose' : 'Tap Permissions, then Location, and choose',
  options: ios
    ? [
        ['radio_button_checked', 'While Using the App'],
        ['toggle_on', 'Precise Location'],
      ]
    : [
        ['radio_button_checked', 'Allow only while using the app'],
        ['toggle_on', 'Use precise location'],
      ],
};

/** Settings, when only approximate location is allowed. */
export const SETTINGS_PRECISE = {
  title: 'In Settings',
  step: ios ? 'Tap Location, then turn on' : 'Tap Permissions, then Location, and turn on',
  options: [['toggle_on', ios ? 'Precise Location' : 'Use precise location']],
};

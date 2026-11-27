// The app's name, in one place: what it writes on share cards, wall art, GPX
// and backup files, and says in messages. The store name and the permission
// messages come from app.json's "name" (app.config.js), which must match:
// a test checks the two.

export const APP_NAME = 'Roads Ahead';

/** "roadsahead": backup files end in it. */
export const APP_WORD = APP_NAME.toLowerCase().replace(/[^a-z0-9]/g, '');

/** "roads-ahead": the start of the files the app saves. */
export const APP_SLUG = APP_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-');

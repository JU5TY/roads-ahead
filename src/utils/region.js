// Whether the phone is set up for the UK. The UK-only parts of the app follow
// it: registration lookups, the UK's weekly fuel prices, printed wall art, and
// miles, mpg and pounds as the starting units (everyone else starts on km).

/**
 * Whether `locale` and `timeZone` are the UK's: the language's region (en-GB,
 * cy-GB) or the time zone. Either will do, so a UK phone in English (US), or
 * one abroad on a road trip, still counts.
 */
export const isUk = (locale, timeZone) =>
  /[-_]GB\b/i.test(locale ?? '') || timeZone === 'Europe/London';

function readPhone() {
  try {
    const { locale, timeZone } = Intl.DateTimeFormat().resolvedOptions();
    return isUk(locale, timeZone);
  } catch {
    return false;
  }
}

/** Read once at launch. */
export const onUkPhone = readPhone();

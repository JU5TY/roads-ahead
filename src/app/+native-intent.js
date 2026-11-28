import { sharedPlanPath } from '../utils/planLink';

// Links opened from outside: a plan on the website (viameter.app/p#…) opens
// the shared plan; app links (viameter://, roadtrip://) go through as they are.
export function redirectSystemPath({ path }) {
  try {
    return sharedPlanPath(path);
  } catch {
    return path;
  }
}

import { showMessage } from '../components/ui/DialogHost';

/** Placeholder for features shown in the design but not built yet (Premium). */
export const comingSoon = (what) => showMessage('Coming soon', `${what} is coming in a future update.`);

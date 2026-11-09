import { router } from 'expo-router';

export const PREMIUM_PRICE = '£19.99';
export const PREMIUM_TAGLINE = 'Show off your trips, and take them anywhere';

/**
 * Whether Roads Ahead Premium is active. Payments aren't connected yet (they need
 * Google Play Billing / StoreKit in a new build), so everyone is on the free plan.
 */
export function usePremium() {
  return false;
}

/** Open the Premium screen: what a Premium badge or locked feature does for a free user. */
export const openPremium = () => router.push('/premium');

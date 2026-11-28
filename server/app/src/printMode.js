// The lock on real print orders. Printing runs in test mode unless PRINT_LIVE is
// "yes" (wrangler.toml): then Stripe must have a test key (sk_test_/rk_test_),
// so no card is charged, and Prodigi is asked on its sandbox host, which never
// prints, ships or charges (a live Prodigi key is refused there). Live mode wants
// live Stripe keys, so a mix-up stops the order instead of half-running it.
// Without its keys, printing is off and every order is refused.

const PRODIGI_HOSTS = {
  test: 'https://api.sandbox.prodigi.com/v5',
  live: 'https://api.prodigi.com/v5',
};

/** 'live' only when PRINT_LIVE is exactly "yes"; anything else, or nothing, is 'test'. */
export const printMode = (env) => (env.PRINT_LIVE === 'yes' ? 'live' : 'test');

/** Prodigi's API address for the mode. */
export const prodigiApi = (env) => PRODIGI_HOSTS[printMode(env)];

/** Throws unless Stripe's key matches the mode. Call before any request to Stripe. */
export function checkStripeKey(env) {
  const key = env.STRIPE_SECRET_KEY ?? '';
  if (!key) throw new Error('Printing is off: no Stripe key');
  const test = /^(sk|rk)_test_/.test(key);
  const live = /^(sk|rk)_live_/.test(key);
  if (printMode(env) === 'test' && !test) throw new Error('Test mode needs a Stripe test key');
  if (printMode(env) === 'live' && !live) throw new Error('Live mode needs a live Stripe key');
}

/** Throws unless Prodigi has a key. Call before any request to Prodigi. */
export function checkProdigiKey(env) {
  if (!env.PRODIGI_API_KEY) throw new Error('Printing is off: no Prodigi key');
}

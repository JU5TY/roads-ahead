import { checkProdigiKey, checkStripeKey, printMode, prodigiApi } from '../printMode';

describe('the lock on real print orders', () => {
  it('is test mode unless PRINT_LIVE is exactly "yes"', () => {
    expect(printMode({})).toBe('test');
    expect(printMode({ PRINT_LIVE: 'no' })).toBe('test');
    expect(printMode({ PRINT_LIVE: 'true' })).toBe('test');
    expect(printMode({ PRINT_LIVE: 'YES' })).toBe('test');
    expect(printMode({ PRINT_LIVE: 'yes' })).toBe('live');
  });

  it("only reaches Prodigi's sandbox in test mode", () => {
    expect(prodigiApi({})).toBe('https://api.sandbox.prodigi.com/v5');
    expect(prodigiApi({ PRINT_LIVE: 'yes' })).toBe('https://api.prodigi.com/v5');
  });

  it('takes only Stripe test keys in test mode', () => {
    expect(() => checkStripeKey({ STRIPE_SECRET_KEY: 'sk_test_abc' })).not.toThrow();
    expect(() => checkStripeKey({ STRIPE_SECRET_KEY: 'rk_test_abc' })).not.toThrow();
    expect(() => checkStripeKey({ STRIPE_SECRET_KEY: 'sk_live_abc' })).toThrow();
    expect(() => checkStripeKey({ STRIPE_SECRET_KEY: 'rk_live_abc' })).toThrow();
    expect(() => checkStripeKey({ STRIPE_SECRET_KEY: 'whatever' })).toThrow();
  });

  it('takes only live Stripe keys in live mode', () => {
    expect(() => checkStripeKey({ PRINT_LIVE: 'yes', STRIPE_SECRET_KEY: 'sk_live_abc' })).not.toThrow();
    expect(() => checkStripeKey({ PRINT_LIVE: 'yes', STRIPE_SECRET_KEY: 'sk_test_abc' })).toThrow();
  });

  it('is off without its keys', () => {
    expect(() => checkStripeKey({})).toThrow('Printing is off');
    expect(() => checkProdigiKey({})).toThrow('Printing is off');
    expect(() => checkProdigiKey({ PRODIGI_API_KEY: 'key' })).not.toThrow();
  });
});

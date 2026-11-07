// The two parts of Stripe the server needs, as plain requests rather than Stripe's
// library: making a Checkout page, and checking a webhook really came from Stripe.
// https://docs.stripe.com/api/checkout/sessions/create
// https://docs.stripe.com/webhooks#verify-manually

const SIGNATURE_MAX_AGE_S = 5 * 60;

/** Stripe's form encoding for nested values: { a: { b: 1 } } -> "a[b]=1". */
function formBody(value, prefix, out = new URLSearchParams()) {
  if (value === undefined || value === null) return out;
  if (typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      formBody(v, prefix ? `${prefix}[${key}]` : key, out);
    }
  } else {
    out.append(prefix, String(value));
  }
  return out;
}

/** A Checkout Session from `params`; repeats with the same `idempotencyKey` get the same one. */
export async function createCheckout(env, params, idempotencyKey) {
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': idempotencyKey,
    },
    body: formBody(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Stripe checkout failed: ${res.status} ${data.error?.message}`);
  return data;
}

const hex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

/**
 * The event in `body` (the raw text) if it's signed by Stripe and recent, else null.
 * The Stripe-Signature header is "t=<unix seconds>,v1=<hex HMAC-SHA256 of '<t>.<body>'>".
 */
export async function verifiedEvent(env, header, body) {
  const parts = (header ?? '').split(',').map((p) => p.split('='));
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!Number.isFinite(t) || !signatures.length) return null;
  if (Math.abs(Date.now() / 1000 - t) > SIGNATURE_MAX_AGE_S) return null;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${body}`)));
  return signatures.some((s) => timingSafeEqual(s, expected)) ? JSON.parse(body) : null;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

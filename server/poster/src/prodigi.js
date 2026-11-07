// Prodigi's print API, version 5: https://www.prodigi.com/print-api/docs/reference/
// The key decides sandbox or live: sandbox_… keys never print, ship or charge.

const API = 'https://api.prodigi.com/v5';
const SIGNATURE_MAX_AGE_S = 5 * 60;

async function call(env, path, { method = 'GET', body, idempotencyKey } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'X-API-Key': env.PRODIGI_API_KEY,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const issues = data.issues ? ` ${JSON.stringify(data.issues)}` : '';
    throw new Error(`Prodigi ${method} ${path}: ${res.status} ${data.message ?? ''}${issues}`);
  }
  return data;
}

/**
 * Create and submit the print order for `order` (a D1 row), sent to `recipient`
 * (Stripe's shipping details), printing the PDF at `assetUrl`. Safe to repeat: the
 * order's id is the idempotency key. Returns Prodigi's order id.
 */
export async function submitPrint(env, order, recipient, assetUrl) {
  const sku = order.size === 'A2' ? env.PRODIGI_SKU_A2 : env.PRODIGI_SKU_A3;
  const data = await call(env, '/orders', {
    method: 'POST',
    idempotencyKey: order.id,
    body: {
      merchantReference: order.ref,
      shippingMethod: env.PRODIGI_SHIPPING ?? 'standard',
      recipient,
      items: [
        {
          merchantReference: order.ref,
          sku,
          quantity: 1,
          sizing: 'fillPrintArea',
          assets: [{ printArea: 'default', url: assetUrl }],
        },
      ],
      metadata: { orderId: order.id },
      submit: true,
    },
  });
  return data.data.id;
}

/** The order's shipments: [{ carrier, trackingNumber, trackingUrl, status }]. */
export async function getShipments(env, prodigiId) {
  const data = await call(env, `/orders/${encodeURIComponent(prodigiId)}/shipments`);
  return data.data ?? [];
}

const hex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Whether `body` (the raw text) came from Prodigi: its X-Prodigi-Signature header is
 * "t=<unix seconds>, v1=<hex HMAC-SHA256 of '<t>.<body>'>", signed with the webhook's
 * secret, and recent.
 */
export async function verifyWebhook(env, header, body) {
  const parts = Object.fromEntries(
    (header ?? '').split(',').map((p) => p.trim().split('=').map((s) => s.trim()))
  );
  const t = Number(parts.t);
  if (!parts.v1 || !Number.isFinite(t)) return false;
  if (Math.abs(Date.now() / 1000 - t) > SIGNATURE_MAX_AGE_S) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.PRODIGI_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${body}`)));
  return timingSafeEqual(expected, parts.v1.toLowerCase());
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Subscribe `url` to the events the Worker handles. Run once, by scripts/prodigi-webhook.mjs. */
export const createWebhook = (env, url) =>
  call(env, '/webhooks', {
    method: 'POST',
    body: {
      url,
      events: ['shipment.dispatched', 'order.failed', 'order.cancelled'],
    },
  });

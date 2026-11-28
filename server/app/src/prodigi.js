// Prodigi's print API, version 5: https://www.prodigi.com/print-api/docs/reference/
// Sandbox and live are separate hosts with their own keys; printMode.js picks
// the host, so test mode only ever reaches the sandbox, which never prints,
// ships or charges.
import { checkProdigiKey, prodigiApi } from './printMode.js';

/**
 * Create and submit the print order: `order` is { id, ref, size }, `recipient` is
 * Prodigi's recipient, and the PDF is at `assetUrl`. Safe to repeat, since the
 * order's id is the idempotency key, so Stripe resending its webhook can't print
 * twice. Returns Prodigi's order id.
 */
export async function submitPrint(env, order, recipient, assetUrl) {
  checkProdigiKey(env);
  const sku = order.size === 'A2' ? env.PRODIGI_SKU_A2 : env.PRODIGI_SKU_A3;
  const res = await fetch(`${prodigiApi(env)}/orders`, {
    method: 'POST',
    headers: {
      'X-API-Key': env.PRODIGI_API_KEY,
      'Content-Type': 'application/json',
      'Idempotency-Key': order.id,
    },
    body: JSON.stringify({
      merchantReference: order.ref,
      shippingMethod: env.PRODIGI_SHIPPING ?? 'Express',
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
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const issues = data.issues ? ` ${JSON.stringify(data.issues)}` : '';
    throw new Error(`Prodigi order failed: ${res.status} ${data.message ?? ''}${issues}`);
  }
  return data.data.id;
}

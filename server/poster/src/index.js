// The Roads Ahead print server, a Cloudflare Worker on the free plan. The app sends
// the poster's PDF and gets back a Stripe page for the address and payment. When
// Stripe says it's paid, the order goes straight to Prodigi to print and post.
// Stripe and Prodigi keep the records, R2 keeps the PDFs for 14 days, and Stripe
// retries its webhook (and emails us) if Prodigi can't be reached.
import { SIZES } from '../../../src/utils/posterLayout.js';
import { submitPrint } from './prodigi.js';
import { createCheckout, verifiedEvent } from './stripe.js';

const MAX_PDF_BYTES = 30 * 1024 * 1024; // an A2 photo poster is about the photo's size
const MAX_TITLE = 120;
const ORDER_ID = /^[0-9a-f]{32}$/;
// Easy to read out over the phone: no 0/O, 1/I/L, U.
const REF_LETTERS = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

const pdfFile = (id) => `orders/${id}/poster.pdf`;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const problem = (message, status = 400) => json({ error: message, message }, status);

const random = (n) => crypto.getRandomValues(new Uint8Array(n));
const newOrder = () => ({
  id: [...random(16)].map((b) => b.toString(16).padStart(2, '0')).join(''),
  ref: `RA-${[...random(5)].map((b) => REF_LETTERS[b % REF_LETTERS.length]).join('')}`,
});

/** The token in a PDF's address, so only Prodigi (who's given it) can fetch it. */
async function assetToken(env, id) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.ASSET_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(id));
  return [...new Uint8Array(mac)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * POST /orders?size=A3&title=… with the poster's PDF as the body
 * -> { orderId, ref, checkoutUrl }. The price comes from the size, here.
 */
async function postOrder(request, env, url) {
  const size = SIZES[url.searchParams.get('size')];
  if (!size) return problem('Unknown size');
  const title = (url.searchParams.get('title') ?? '').slice(0, MAX_TITLE);
  if ((request.headers.get('Content-Type') ?? '').split(';')[0].trim() !== 'application/pdf') {
    return problem('Expected a PDF', 415);
  }
  const length = Number(request.headers.get('Content-Length') ?? 0);
  if (!length || length > MAX_PDF_BYTES) return problem('This print is too large to send', 413);

  const order = newOrder();
  await env.POSTERS.put(pdfFile(order.id), request.body, {
    httpMetadata: { contentType: 'application/pdf' },
  });
  const head = await env.POSTERS.get(pdfFile(order.id), { range: { offset: 0, length: 5 } });
  if (new TextDecoder().decode(await head.arrayBuffer()) !== '%PDF-') {
    await env.POSTERS.delete(pdfFile(order.id));
    return problem('Expected a PDF', 415);
  }

  const session = await createCheckout(
    env,
    {
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'gbp',
            unit_amount: size.pence,
            product_data: {
              name: `${size.label} poster${title ? `: ${title}` : ''}`,
              description: `Fine-art print, ${size.mm[0]} × ${size.mm[1]} mm. Free UK delivery.`,
            },
          },
        },
      ],
      shipping_address_collection: { allowed_countries: ['GB'] },
      phone_number_collection: { enabled: true },
      client_reference_id: order.ref,
      metadata: { orderId: order.id, ref: order.ref, size: size.label },
      success_url: `${env.PUBLIC_URL}/done?order=${order.id}`,
      cancel_url: `${env.PUBLIC_URL}/cancelled`,
    },
    `checkout-${order.id}`
  ).catch(async (err) => {
    await env.POSTERS.delete(pdfFile(order.id));
    throw err;
  });
  return json({ orderId: order.id, ref: order.ref, checkoutUrl: session.url });
}

/**
 * POST /stripe/webhook: a paid checkout is sent to Prodigi. If that fails, the
 * error tells Stripe to try again later; Stripe emails us if it keeps failing.
 */
async function stripeWebhook(request, env) {
  const event = await verifiedEvent(env, request.headers.get('Stripe-Signature'), await request.text());
  if (!event) return new Response('Bad signature', { status: 400 });
  const paidEvents = ['checkout.session.completed', 'checkout.session.async_payment_succeeded'];
  const session = event.data.object;
  if (!paidEvents.includes(event.type) || session.payment_status !== 'paid') {
    return new Response('ok');
  }
  const { orderId: id, ref, size } = session.metadata ?? {};
  if (!ORDER_ID.test(id ?? '') || !SIZES[size]) return new Response('Not a print order');

  if (!(await env.POSTERS.head(pdfFile(id)))) throw new Error(`No PDF for paid order ${ref}`);
  const shipping = session.collected_information?.shipping_details ?? session.shipping_details;
  const address = shipping?.address;
  if (!address?.line1) throw new Error(`No delivery address for order ${ref}`);
  const customer = session.customer_details ?? {};
  // Their email and phone let the courier send delivery updates.
  const recipient = {
    name: shipping.name ?? customer.name,
    email: customer.email ?? undefined,
    phoneNumber: customer.phone ?? undefined,
    address: {
      line1: address.line1,
      line2: address.line2 ?? undefined,
      townOrCity: address.city,
      stateOrCounty: address.state ?? undefined,
      postalOrZipCode: address.postal_code,
      countryCode: address.country,
    },
  };
  const assetUrl = `${env.PUBLIC_URL}/assets/${id}/${await assetToken(env, id)}.pdf`;
  const prodigiId = await submitPrint(env, { id, ref, size }, recipient, assetUrl);
  console.log('[order] sent to Prodigi', ref, prodigiId);
  return new Response('ok');
}

/** GET /assets/:id/:token.pdf: the print file, for Prodigi. */
async function getAsset(env, id, token) {
  if (!ORDER_ID.test(id) || token !== (await assetToken(env, id))) {
    return new Response('Not found', { status: 404 });
  }
  const pdf = await env.POSTERS.get(pdfFile(id));
  if (!pdf) return new Response('Not found', { status: 404 });
  return new Response(pdf.body, { headers: { 'Content-Type': 'application/pdf' } });
}

// --- Pages Stripe sends the browser back to ----------------------------------

const page = (title, body) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
font-family:system-ui,sans-serif;background:#F8F9FA;color:#202124;text-align:center;padding:24px;box-sizing:border-box}
@media (prefers-color-scheme:dark){body{background:#202124;color:#E8EAED}}
h1{font-weight:400;font-size:28px;margin:0 0 12px}p{font-size:16px;line-height:24px;margin:0 0 24px;opacity:.8}
a{display:inline-block;padding:16px 32px;border-radius:28px;background:#1A73E8;color:#fff;text-decoration:none;font-size:16px}
</style></head><body><main>${body}</main></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );

function donePage(env, url) {
  const id = url.searchParams.get('order') ?? '';
  if (!ORDER_ID.test(id)) return page('Roads Ahead', '<h1>Thank you</h1>');
  const back = `${env.APP_SCHEME}://poster/done?order=${id}`;
  return page(
    'Order placed',
    `<h1>Order placed</h1><p>Your gallery print is being made.</p>
<a href="${back}">Back to Roads Ahead</a>
<script>location.href=${JSON.stringify(back)}</script>`
  );
}

const cancelledPage = () =>
  page(
    'Order cancelled',
    '<h1>No payment taken</h1><p>You can close this page and go back to Roads Ahead.</p>'
  );

// --- The Worker --------------------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const route = `${request.method} /${parts.join('/')}`;
    try {
      switch (route) {
        case 'POST /orders':
          return await postOrder(request, env, url);
        case 'POST /stripe/webhook':
          return await stripeWebhook(request, env);
        case 'GET /done':
          return donePage(env, url);
        case 'GET /cancelled':
          return cancelledPage();
      }
      if (request.method === 'GET' && parts[0] === 'assets' && parts.length === 3) {
        return await getAsset(env, parts[1], parts[2].replace(/\.pdf$/, ''));
      }
      return new Response('Not found', { status: 404 });
    } catch (err) {
      console.error('[poster]', route, err);
      return problem('Something went wrong. Please try again.', 500);
    }
  },
};

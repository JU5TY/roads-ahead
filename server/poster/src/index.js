// The Roads Ahead print server, a Cloudflare Worker. The app sends a poster's spec
// (and photo), pays on Stripe's page, and once Stripe says it's paid a queue renders
// the PDF to R2 and hands it to Prodigi, whose dispatch webhook emails the tracking.
import Stripe from 'stripe';

import { SIZES } from '../../../src/utils/posterLayout.js';
import lightFont from '../fonts/GoogleSansFlex-Light.ttf';
import regularFont from '../fonts/GoogleSansFlex-Regular.ttf';
import { problemEmail, sendEmail, shippedEmail } from './email.js';
import {
  createOrder,
  files,
  forgetOldCustomers,
  getOrder,
  getOrderByProdigiId,
  randomId,
  updateOrder,
} from './orders.js';
import { getShipments, submitPrint, verifyWebhook } from './prodigi.js';
import { renderPoster } from './render.js';
import { specProblem } from './validate.js';

const MAX_SPEC_BYTES = 1_500_000;
const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
const MAX_RENDER_TRIES = 5; // the queue's max_retries, plus the first go
const FORGET_CUSTOMERS_AFTER_MS = 60 * 24 * 60 * 60 * 1000;
const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png' };
const ORDER_ID = /^[0-9a-f]{32}$/;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const problem = (message, status = 400) => json({ error: message, message }, status);

const stripeFor = (env) =>
  new Stripe(env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });

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

// --- The app -----------------------------------------------------------------

/** POST /orders { spec } -> { orderId, ref, uploadUrl } (uploadUrl for a photo poster). */
async function postOrder(request, env) {
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_SPEC_BYTES) {
    return problem('Poster too large', 413);
  }
  const text = await request.text();
  if (text.length > MAX_SPEC_BYTES) return problem('Poster too large', 413);
  let spec;
  try {
    ({ spec } = JSON.parse(text));
  } catch {
    return problem('Bad request');
  }
  const why = specProblem(spec);
  if (why) return problem(why);

  const id = randomId();
  await env.POSTERS.put(files.spec(id), JSON.stringify(spec), {
    httpMetadata: { contentType: 'application/json' },
  });
  const ref = await createOrder(env.DB, {
    id,
    size: spec.size,
    edition: spec.edition,
    title: spec.lines.title.text,
  });
  return json({
    orderId: id,
    ref,
    uploadUrl: spec.edition === 'photo' ? `/orders/${id}/photo` : null,
  });
}

/** PUT /orders/:id/photo with a JPEG or PNG body. */
async function putPhoto(request, env, id) {
  const order = await getOrder(env.DB, id);
  if (!order || order.edition !== 'photo') return problem('No such order', 404);
  if (order.status !== 'pending') return problem('This order is already paid for', 409);
  const type = (request.headers.get('Content-Type') ?? '').split(';')[0].trim();
  if (!PHOTO_TYPES[type]) return problem("This photo's format can't be printed yet", 415);
  const length = Number(request.headers.get('Content-Length') ?? 0);
  if (!length || length > MAX_PHOTO_BYTES) return problem('This photo is too large to send', 413);

  await env.POSTERS.put(files.photo(id), request.body, { httpMetadata: { contentType: type } });
  // Check it's really the image it says it is before taking money for it.
  const head = await env.POSTERS.get(files.photo(id), { range: { offset: 0, length: 8 } });
  const bytes = new Uint8Array(await head.arrayBuffer());
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if ((type === 'image/jpeg' && !isJpeg) || (type === 'image/png' && !isPng)) {
    await env.POSTERS.delete(files.photo(id));
    return problem("This photo's format can't be printed yet", 415);
  }
  await updateOrder(env.DB, id, { has_photo: 1 }, { from: ['pending'] });
  return json({ ok: true });
}

/** POST /orders/:id/checkout -> { checkoutUrl }: Stripe's page for the address and payment. */
async function postCheckout(env, id) {
  const order = await getOrder(env.DB, id);
  if (!order) return problem('No such order', 404);
  if (order.status !== 'pending') return problem('This order is already paid for', 409);
  if (order.edition === 'photo' && !order.has_photo) return problem('The photo is missing');

  const size = SIZES[order.size];
  const session = await stripeFor(env).checkout.sessions.create(
    {
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'gbp',
            unit_amount: size.pence,
            product_data: {
              name: `${size.label} poster${order.title ? `: ${order.title}` : ''}`,
              description: `Fine-art print, ${size.mm[0]} × ${size.mm[1]} mm. Free UK delivery.`,
            },
          },
        },
      ],
      shipping_address_collection: { allowed_countries: ['GB'] },
      phone_number_collection: { enabled: true },
      client_reference_id: id,
      metadata: { orderId: id, ref: order.ref },
      success_url: `${env.PUBLIC_URL}/done?order=${id}`,
      cancel_url: `${env.PUBLIC_URL}/cancelled`,
    },
    // Tapping Order twice opens the same page rather than a second one.
    { idempotencyKey: `checkout-${id}` }
  );
  await updateOrder(env.DB, id, { stripe_session: session.id }, { from: ['pending'] });
  return json({ checkoutUrl: session.url });
}

/** GET /orders/:id -> what the Order placed screen shows, nothing personal. */
async function getOrderSummary(env, id) {
  const order = await getOrder(env.DB, id);
  if (!order) return problem('No such order', 404);
  return json({ ref: order.ref, size: order.size, title: order.title, status: order.status });
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
    `<h1>Order placed</h1><p>Your poster is being printed.</p>
<a href="${back}">Back to Roads Ahead</a>
<script>location.href=${JSON.stringify(back)}</script>`
  );
}

const cancelledPage = () =>
  page(
    'Order cancelled',
    '<h1>No payment taken</h1><p>You can close this page and go back to Roads Ahead.</p>'
  );

/** GET /assets/:id/:token.pdf: the print file, for Prodigi. */
async function getAsset(env, id, token) {
  if (!ORDER_ID.test(id) || token !== (await assetToken(env, id))) {
    return new Response('Not found', { status: 404 });
  }
  const pdf = await env.POSTERS.get(files.pdf(id));
  if (!pdf) return new Response('Not found', { status: 404 });
  return new Response(pdf.body, { headers: { 'Content-Type': 'application/pdf' } });
}

// --- Stripe and Prodigi ------------------------------------------------------

/** POST /stripe/webhook: a paid checkout queues the poster for printing. */
async function stripeWebhook(request, env) {
  const body = await request.text();
  let event;
  try {
    event = await stripeFor(env).webhooks.constructEventAsync(
      body,
      request.headers.get('Stripe-Signature'),
      env.STRIPE_WEBHOOK_SECRET,
      undefined,
      Stripe.createSubtleCryptoProvider()
    );
  } catch (err) {
    console.warn('[stripe] bad signature', err.message);
    return new Response('Bad signature', { status: 400 });
  }
  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded'
  ) {
    const session = event.data.object;
    const id = session.metadata?.orderId;
    if (session.payment_status === 'paid' && id) {
      // Stripe can send an event more than once: only the first moves the order on.
      const moved = await updateOrder(
        env.DB,
        id,
        {
          status: 'paid',
          stripe_session: session.id,
          email: session.customer_details?.email ?? null,
          name: session.customer_details?.name ?? null,
        },
        { from: ['pending'] }
      );
      if (moved) await env.RENDER_QUEUE.send({ orderId: id });
    }
  }
  return new Response('ok');
}

/** Stripe's delivery address, as Prodigi's recipient. */
async function recipientFor(env, order) {
  const session = await stripeFor(env).checkout.sessions.retrieve(order.stripe_session);
  const shipping = session.collected_information?.shipping_details ?? session.shipping_details;
  const address = shipping?.address;
  if (!address?.line1) throw new Error('No delivery address on the Stripe session');
  return {
    name: shipping.name ?? session.customer_details?.name,
    email: session.customer_details?.email ?? undefined,
    phoneNumber: session.customer_details?.phone ?? undefined,
    address: {
      line1: address.line1,
      line2: address.line2 ?? undefined,
      townOrCity: address.city,
      stateOrCounty: address.state ?? undefined,
      postalOrZipCode: address.postal_code,
      countryCode: address.country,
    },
  };
}

/** The queue's work for one paid order: draw the PDF, store it, send it to Prodigi. */
async function renderAndSubmit(env, id) {
  const order = await getOrder(env.DB, id);
  if (!order || order.status !== 'paid') return; // already sent, or not paid
  const spec = await (await env.POSTERS.get(files.spec(id))).json();
  let photo = null;
  if (order.edition === 'photo') {
    const file = await env.POSTERS.get(files.photo(id));
    if (!file) throw new Error('The photo has gone');
    photo = {
      bytes: new Uint8Array(await file.arrayBuffer()),
      type: PHOTO_TYPES[file.httpMetadata?.contentType] ?? 'jpg',
    };
  }
  const pdf = await renderPoster({
    spec,
    fonts: { light: lightFont, regular: regularFont },
    photo,
  });
  await env.POSTERS.put(files.pdf(id), pdf, { httpMetadata: { contentType: 'application/pdf' } });

  const assetUrl = `${env.PUBLIC_URL}/assets/${id}/${await assetToken(env, id)}.pdf`;
  const prodigiId = await submitPrint(env, order, await recipientFor(env, order), assetUrl);
  await updateOrder(env.DB, id, { status: 'submitted', prodigi_id: prodigiId }, { from: ['paid'] });
}

/** POST /prodigi/webhook: dispatched emails the tracking; a failure asks us to step in. */
async function prodigiWebhook(request, env) {
  const body = await request.text();
  if (!(await verifyWebhook(env, request.headers.get('X-Prodigi-Signature'), body))) {
    return new Response('Bad signature', { status: 400 });
  }
  const event = JSON.parse(body);
  const order = event.data?.orderId ? await getOrderByProdigiId(env.DB, event.data.orderId) : null;
  if (!order) return new Response('ok'); // a ping, or not one of ours

  if (event.type === 'shipment.dispatched') {
    const shipments = await getShipments(env, order.prodigi_id);
    const trackingUrl = shipments.find((s) => s.trackingUrl)?.trackingUrl ?? null;
    const moved = await updateOrder(
      env.DB,
      order.id,
      { status: 'shipped', tracking_url: trackingUrl },
      { from: ['submitted'] }
    );
    if (moved) await sendEmail(env, shippedEmail(order, trackingUrl));
  } else if (event.type === 'order.failed' || event.type === 'order.cancelled') {
    await updateOrder(env.DB, order.id, { status: 'failed', error: event.type });
    await sendEmail(env, problemEmail(env, order, `Prodigi says: ${event.type}.`));
  }
  return new Response('ok');
}

// --- The Worker --------------------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const route = `${request.method} /${parts.map((p, i) => (i === 1 && parts[0] === 'orders' ? ':id' : p)).join('/')}`;
    const id = parts[0] === 'orders' ? parts[1] : null;
    if (id && !ORDER_ID.test(id)) return problem('No such order', 404);

    try {
      switch (route) {
        case 'POST /orders':
          return await postOrder(request, env);
        case 'PUT /orders/:id/photo':
          return await putPhoto(request, env, id);
        case 'POST /orders/:id/checkout':
          return await postCheckout(env, id);
        case 'GET /orders/:id':
          return await getOrderSummary(env, id);
        case 'GET /done':
          return donePage(env, url);
        case 'GET /cancelled':
          return cancelledPage();
        case 'POST /stripe/webhook':
          return await stripeWebhook(request, env);
        case 'POST /prodigi/webhook':
          return await prodigiWebhook(request, env);
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

  async queue(batch, env) {
    for (const message of batch.messages) {
      const { orderId } = message.body;
      try {
        await renderAndSubmit(env, orderId);
        message.ack();
      } catch (err) {
        console.error('[render]', orderId, err);
        if (message.attempts >= MAX_RENDER_TRIES) {
          // Paid for but not printing: we sort it out by hand.
          await updateOrder(env.DB, orderId, { status: 'failed', error: String(err).slice(0, 500) });
          const order = await getOrder(env.DB, orderId);
          if (order) await sendEmail(env, problemEmail(env, order, String(err)));
          message.ack();
        } else {
          message.retry({ delaySeconds: 60 * message.attempts });
        }
      }
    }
  },

  async scheduled(_controller, env) {
    await forgetOldCustomers(env.DB, Date.now() - FORGET_CUSTOMERS_AFTER_MS);
  },
};

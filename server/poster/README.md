# Roads Ahead print server

A Cloudflare Worker that turns a poster ordered in the app into a print.

1. The app sends the poster's spec, plus the photo for a photo poster: `POST /orders`, then `PUT /orders/:id/photo`.
2. The app opens Stripe Checkout (`POST /orders/:id/checkout`), which takes the UK delivery address and payment.
3. Stripe's `checkout.session.completed` webhook marks the order paid and queues it.
4. The queue draws the PDF at the paper's exact size (A3 297 × 420 mm, A2 420 × 594 mm) and stores it in R2.
5. The queue then sends the order to Prodigi (API v5), with the PDF at a secret link.
6. Prodigi's `shipment.dispatched` webhook emails the customer the tracking link.
7. If an order is paid for but can't be printed, you get an email.

The poster's layout lives in `../../src/utils/posterLayout.js`, which the app's preview also uses, so the two match.

Files in R2 are deleted after 14 days. Customers' names and emails are cleared from D1 after 60 days.

## Try it locally

```sh
npm install
node scripts/render-sample.mjs spec.json out.pdf [photo.jpg]   # just the PDF
npx wrangler d1 execute poster_orders --local --file=schema.sql
npx wrangler dev                                               # needs a .dev.vars with the secrets
```

## Set up (once)

1. **Cloudflare** (Workers Paid plan, for Queues):
   ```sh
   npx wrangler r2 bucket create poster-pipeline-production
   npx wrangler r2 bucket lifecycle add poster-pipeline-production expire-14-days --expire-days 14
   npx wrangler d1 create poster_orders        # put its id in wrangler.toml
   npx wrangler d1 execute poster_orders --remote --file=schema.sql
   npx wrangler queues create poster-render
   ```
   Give the Worker a custom domain, for example `print.<your domain>`, and set `PUBLIC_URL` in `wrangler.toml` to it.
2. **Stripe:** add a webhook endpoint at `<PUBLIC_URL>/stripe/webhook` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
3. **Prodigi:** in the sandbox dashboard, confirm the A3 and A2 fine-art SKUs in `wrangler.toml`. Then run:
   ```sh
   PRODIGI_API_KEY=sandbox_… node scripts/prodigi-webhook.mjs <PUBLIC_URL>
   ```
   Repeat this with the live key when going live.
4. **Email:** set up Resend with a verified sending domain. Set `EMAIL_FROM` and `ALERT_EMAIL` in `wrangler.toml`.
5. **Secrets:** set each with `npx wrangler secret put <NAME>`:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `PRODIGI_API_KEY`
   - `PRODIGI_WEBHOOK_SECRET`
   - `EMAIL_API_KEY`
   - `ASSET_SECRET`: any long random string.
6. **Deploy** with `npm run deploy`.
7. **The app:** set `EXPO_PUBLIC_POSTER_API=<PUBLIC_URL>` for the build or update. Until it's set, the print page shows but Order says "coming soon".

Test with Stripe's test keys and Prodigi's `sandbox_` key, which never prints, ships or charges, before switching both to live.

# Roads Ahead print server

A Cloudflare Worker on the free plan. It costs nothing a month; Stripe and Prodigi only charge per order.

1. The phone draws the print-ready PDF (`src/utils/posterPdf.js`) and sends it with its size: `POST /orders?size=A3&title=…`.
2. The Worker stores the PDF in R2 and returns a Stripe Checkout page. The price is set here, from the size. Stripe takes the UK delivery address and payment, and emails the customer a receipt.
3. Stripe's `checkout.session.completed` webhook sends the order straight to Prodigi (API v5). Prodigi fetches the PDF from a secret link, then prints and posts it. The customer's email and phone number go to Prodigi so the courier can send delivery updates.
4. If Prodigi can't take the order, the webhook fails. Stripe then retries for up to 3 days and emails you if it keeps failing.

There's no database: Stripe has the payments and addresses, Prodigi has the prints, and R2 deletes the PDFs after 14 days.

## Try it locally

```sh
npm install
node scripts/render-sample.mjs spec.json out.pdf [photo.jpg]   # a PDF from a spec, without the phone
npx wrangler dev                                               # with a .dev.vars holding the secrets
```

## Set up (once)

1. **Cloudflare** (free plan). Log in with `npx wrangler login`, then:
   ```sh
   npx wrangler r2 bucket create poster-pipeline-production
   npx wrangler r2 bucket lifecycle add poster-pipeline-production expire-14-days --expire-days 14
   npm run deploy
   ```
   The deploy prints the Worker's `workers.dev` address. Put it in `PUBLIC_URL` in `wrangler.toml` and deploy again.
2. **Stripe:**
   - Turn on receipt emails for successful payments under Settings › Customer emails.
   - Add a webhook endpoint at `<PUBLIC_URL>/stripe/webhook` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
3. **Prodigi:** in the sandbox dashboard, confirm the A3 and A2 fine-art SKUs in `wrangler.toml`. Check which shipping method gives the customer tracking: `standard` may be an untracked service.
4. **Secrets:** set each with `npx wrangler secret put <NAME>`:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `PRODIGI_API_KEY`
   - `ASSET_SECRET`: any long random string.
5. **The app:** set `EXPO_PUBLIC_POSTER_API=<PUBLIC_URL>` for the build or update. Until it's set, the print page shows but Order says "coming soon".

Test with Stripe's test keys and Prodigi's `sandbox_` key, which never prints, ships or charges, before switching both to live.

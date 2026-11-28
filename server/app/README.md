# The app's server

A Cloudflare Worker on the free plan. It costs nothing a month; Stripe and Prodigi only charge per order. Each job has its own file, and `src/index.js` sends each request to it:

- **Printed posters** (`src/poster.js`), below.
- **UK fuel prices** (`src/fuelPrice.js`): `GET /fuel-prices` returns the UK's average petrol and diesel pump price for every week since 2003, from GOV.UK's [Weekly road fuel prices](https://www.gov.uk/government/statistics/weekly-road-fuel-prices) (free, no key, Open Government Licence). Its files move with each weekly update, so the Worker finds them through GOV.UK's content API, and Cloudflare's cache keeps the answer for a day.
- **Registration lookups** (`src/vehicle.js`): `POST /vehicle-lookup` with `{ "registration": "AB12 CDE" }` asks DVLA's Vehicle Enquiry Service and DVSA's MOT history together and returns one vehicle (`src/utils/vehicleLookup.js`), with `sources` saying how each one answered. Each is asked only once its secrets are set, and either can fail alone. Nothing is kept, and the registration travels in the body so it stays out of Cloudflare's logs. Secrets: `DVLA_API_KEY`; `DVSA_CLIENT_ID`, `DVSA_CLIENT_SECRET`, `DVSA_API_KEY` and `DVSA_TOKEN_URL` (the access token URL in DVSA's email). DVSA revokes an API key unused for 90 days, so a weekly cron (`wrangler.toml`, Mondays 06:00 UTC) makes one lookup: of `KEEPALIVE_REGISTRATION` if that secret is set (your own vehicle's), else a registration that can't be issued. Its result is in the Worker's logs. Each connection gets 10 lookups a minute (`LOOKUP_LIMIT` in `wrangler.toml`), so the address can't be used as a free DVLA lookup.

## Printed posters

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
   npx wrangler r2 bucket create viameter-prints
   npx wrangler r2 bucket lifecycle add viameter-prints expire-14-days --expire-days 14
   npm run deploy
   ```
   It answers at `https://api.viameter.app` (`routes` in `wrangler.toml`; the domain is on the same Cloudflare account, which adds the DNS record and certificate). Its `workers.dev` address is off.
2. **Stripe:**
   - Turn on receipt emails for successful payments under Settings › Customer emails.
   - Add a webhook endpoint at `<PUBLIC_URL>/stripe/webhook` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
3. **Prodigi:** in the sandbox dashboard, confirm the A3 and A2 fine-art SKUs in `wrangler.toml`. Shipping is `Express`: tracked, and the same price as untracked `Standard` in the UK.
4. **Secrets:** set each with `npx wrangler secret put <NAME>`:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `PRODIGI_API_KEY`
   - `ASSET_SECRET`: any long random string.
5. **The app:** set `EXPO_PUBLIC_SERVER_URL=<PUBLIC_URL>` (fuel prices use it too) and `EXPO_PUBLIC_PRINTING=on` for the build or update. Until both are set, the print page shows but Order says "coming soon".

**Test mode is the default, and it's a lock** (`src/printMode.js`): unless `PRINT_LIVE` in `wrangler.toml` is exactly `"yes"`, the Worker refuses a Stripe key that isn't a test key (`sk_test_`/`rk_test_`), so no card is charged, and only calls Prodigi's sandbox host (`api.sandbox.prodigi.com`), which never prints, ships or charges and refuses a live Prodigi key. Without the Stripe and Prodigi keys, printing is off and every order gets "not available". Test with Stripe's test keys and Prodigi's sandbox key; go live only by setting live keys and `PRINT_LIVE = "yes"` together, then deploying.

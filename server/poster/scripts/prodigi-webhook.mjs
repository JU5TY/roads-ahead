// Subscribes the Worker to Prodigi's events, once per key (sandbox, then live):
// `PRODIGI_API_KEY=sandbox_… node scripts/prodigi-webhook.mjs https://print.example.com`
// Prints the signing secret, for `npx wrangler secret put PRODIGI_WEBHOOK_SECRET`.
import { createWebhook } from '../src/prodigi.js';

const [base] = process.argv.slice(2);
if (!base || !process.env.PRODIGI_API_KEY) {
  console.error('Usage: PRODIGI_API_KEY=… node scripts/prodigi-webhook.mjs <PUBLIC_URL>');
  process.exit(1);
}
const { data } = await createWebhook(process.env, `${base.replace(/\/$/, '')}/prodigi/webhook`);
console.log(`Webhook ${data.id} created. Its secret, shown only now:\n${data.secret}`);

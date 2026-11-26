// The app's server, a Cloudflare Worker on the free plan: printed posters
// (poster.js), the UK's weekly fuel prices (fuelPrice.js) and registration
// lookups (vehicle.js). It costs nothing a month; Stripe and Prodigi only charge
// per order, and the DVLA and DVSA lookups are free.
import { getFuelPrices } from './fuelPrice.js';
import { posterRoute } from './poster.js';
import { problem } from './respond.js';
import { keepDvsaKeyAlive, postVehicleLookup } from './vehicle.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const route = `${request.method} /${parts.join('/')}`;
    try {
      if (route === 'GET /fuel-prices') return await getFuelPrices(request, ctx);
      if (route === 'POST /vehicle-lookup') return await postVehicleLookup(request, env);
      const answer = await posterRoute(request, env, url, route, parts);
      return answer ?? new Response('Not found', { status: 404 });
    } catch (err) {
      console.error('[server]', route, err);
      return problem('Something went wrong. Please try again.', 500);
    }
  },

  // Once a week (wrangler.toml): keeps DVSA's API key in use.
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(keepDvsaKeyAlive(env));
  },
};

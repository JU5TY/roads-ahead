// POST /vehicle-lookup { registration }: what DVLA and DVSA know about a UK
// vehicle, as one (src/utils/vehicleLookup.js). Each is asked only once its keys
// are set, and each can fail alone: the other still fills what it has. Nothing
// is kept: the registration goes in the body, not the address, so it isn't in
// Cloudflare's logs either.
//
// Secrets (`npx wrangler secret put <NAME>`):
//   DVLA_API_KEY                                     Vehicle Enquiry Service
//   DVSA_CLIENT_ID, DVSA_CLIENT_SECRET, DVSA_API_KEY,
//   DVSA_TOKEN_URL (the access token URL in DVSA's email)   MOT history
//   KEEPALIVE_REGISTRATION (optional: your own vehicle's)   the weekly lookup
import { lookupRegistration, mergeVehicle } from '../../../src/utils/vehicleLookup.js';
import { json, problem } from './respond.js';

const DVLA_URL = 'https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles';
const DVSA_URL = 'https://history.mot.api.gov.uk/v1/trade/vehicles/registration/';
const DVSA_SCOPE = 'https://tapi.dvsa.gov.uk/.default';

// DVSA's access token lasts an hour; kept while this copy of the Worker runs,
// and swapped a minute early. DVSA asks for it to be reused, not fetched each time.
let dvsaToken = null; // { token, until }

/** One source's answer: { vehicle } | { notFound: true } | { failed: true } | { off: true }. */
async function ask(name, call) {
  try {
    return await call();
  } catch (err) {
    console.error(`[vehicle] ${name} failed`, err);
    return { failed: true };
  }
}

async function askDvla(env, reg, fetcher) {
  if (!env.DVLA_API_KEY) return { off: true };
  const res = await fetcher(DVLA_URL, {
    method: 'POST',
    headers: { 'x-api-key': env.DVLA_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ registrationNumber: reg }),
  });
  if (res.status === 404 || res.status === 400) return { notFound: true };
  if (!res.ok) throw new Error(`DVLA answered ${res.status}`);
  return { vehicle: await res.json() };
}

async function dvsaAccessToken(env, fetcher) {
  if (dvsaToken && Date.now() < dvsaToken.until) return dvsaToken.token;
  const res = await fetcher(env.DVSA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.DVSA_CLIENT_ID,
      client_secret: env.DVSA_CLIENT_SECRET,
      scope: DVSA_SCOPE,
    }).toString(),
  });
  if (!res.ok) throw new Error(`DVSA's token answered ${res.status}`);
  const { access_token: token, expires_in: seconds } = await res.json();
  dvsaToken = { token, until: Date.now() + (Number(seconds) - 60) * 1000 };
  return token;
}

async function askDvsa(env, reg, fetcher) {
  if (!env.DVSA_API_KEY || !env.DVSA_CLIENT_ID || !env.DVSA_CLIENT_SECRET || !env.DVSA_TOKEN_URL) {
    return { off: true };
  }
  const token = await dvsaAccessToken(env, fetcher);
  const res = await fetcher(DVSA_URL + reg, {
    headers: { Authorization: `Bearer ${token}`, 'X-API-Key': env.DVSA_API_KEY },
  });
  if (res.status === 404 || res.status === 400) return { notFound: true };
  // A token turned away early: drop it, so the next lookup gets a new one.
  if (res.status === 401) dvsaToken = null;
  if (!res.ok) throw new Error(`DVSA answered ${res.status}`);
  return { vehicle: await res.json() };
}

const state = (answer) =>
  answer.vehicle ? 'found' : answer.notFound ? 'not-found' : answer.off ? 'off' : 'failed';

/**
 * The lookup itself, for the route and its tests: { status, body }. 200 with
 * { vehicle, sources: { dvla, dvsa } } (each 'found' | 'not-found' | 'failed' |
 * 'off'); 404 when neither knows it; 503 when neither could be asked.
 */
export async function lookupVehicle(env, registration, fetcher = fetch) {
  const reg = lookupRegistration(registration);
  if (!reg) return { status: 400, body: { error: 'Enter a UK registration, like AB12 CDE.' } };
  const [dvla, dvsa] = await Promise.all([
    ask('DVLA', () => askDvla(env, reg, fetcher)),
    ask('DVSA', () => askDvsa(env, reg, fetcher)),
  ]);
  const sources = { dvla: state(dvla), dvsa: state(dvsa) };
  if (dvla.vehicle || dvsa.vehicle) {
    return { status: 200, body: { vehicle: mergeVehicle(reg, dvla.vehicle, dvsa.vehicle), sources } };
  }
  if ([dvla, dvsa].some((a) => a.notFound) && ![dvla, dvsa].some((a) => a.failed)) {
    return { status: 404, body: { error: 'No vehicle has this registration.', sources } };
  }
  return { status: 503, body: { error: "Vehicle details can't be looked up right now.", sources } };
}

// A registration that can't be issued, for the weekly lookup when none is set.
const UNISSUED = 'ZZ99ZZZ';

/**
 * The weekly lookup (wrangler.toml's cron): DVSA revokes an API key unused for
 * 90 days, and until the app has users it could be. One MOT history lookup a
 * week keeps it in use; a not found still uses the key. Returns its state.
 */
export async function keepDvsaKeyAlive(env, fetcher = fetch) {
  const reg = lookupRegistration(env.KEEPALIVE_REGISTRATION) ?? UNISSUED;
  const answer = await ask('DVSA', () => askDvsa(env, reg, fetcher));
  const result = state(answer);
  if (result === 'failed') console.error('[vehicle] weekly DVSA lookup failed');
  else console.log('[vehicle] weekly DVSA lookup', result);
  return result;
}

export async function postVehicleLookup(request, env) {
  // A handful a minute from each connection, so the address can't be used as a
  // free DVLA lookup (wrangler.toml's LOOKUP_LIMIT; none when run locally).
  const caller = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (env.LOOKUP_LIMIT && !(await env.LOOKUP_LIMIT.limit({ key: caller })).success) {
    return problem('Too many lookups. Please wait a minute and try again.', 429);
  }
  let registration;
  try {
    ({ registration } = await request.json());
  } catch {
    return problem('Expected { registration }');
  }
  const { status, body } = await lookupVehicle(env, registration);
  return body.error ? json({ ...body, message: body.error }, status) : json(body, status);
}

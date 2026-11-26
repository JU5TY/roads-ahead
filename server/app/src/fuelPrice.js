// GET /fuel-prices: the UK's average petrol and diesel pump prices for every
// week since 2003, from the government's "Weekly road fuel prices" (DESNZ). Free,
// with no key. Its files move to a new address with each weekly update, so the
// page's own entry in GOV.UK's content API says where they are today. The answer
// is kept in Cloudflare's cache for a day, so GOV.UK is asked once a day at most.
import { mergeWeeks, parseWeeklyPrices } from '../../../src/utils/fuelPrices.js';
import { json, problem } from './respond.js';

const PAGE = 'https://www.gov.uk/api/content/government/statistics/weekly-road-fuel-prices';
const SOURCE = 'https://www.gov.uk/government/statistics/weekly-road-fuel-prices';
const LICENCE = 'Contains public sector information licensed under the Open Government Licence v3.0.';
const DAY_SECONDS = 24 * 60 * 60;

async function fetchOk(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'RoadTrip app server' } });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res;
}

/** Every week in the page's CSVs: [[week, petrol pence, diesel pence]], oldest first. */
async function readWeeks() {
  const page = await (await fetchOk(PAGE)).json();
  const csvs = (page.details?.attachments ?? []).filter((a) => a.content_type === 'text/csv');
  const tables = await Promise.all(
    csvs.map(async (a) => parseWeeklyPrices(await (await fetchOk(a.url)).text()))
  );
  return mergeWeeks(tables);
}

/** -> { weeks: [["2026-11-23", 161.96, 193.29], …], source, licence }. */
export async function getFuelPrices(request, ctx) {
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) return cached;
  const weeks = await readWeeks();
  if (!weeks.length) {
    console.error('[fuel] no weeks read from GOV.UK');
    return problem("UK fuel prices aren't available right now.", 502);
  }
  const res = json({ weeks, source: SOURCE, licence: LICENCE }, 200, {
    'Cache-Control': `public, max-age=${DAY_SECONDS}`,
  });
  ctx.waitUntil(cache.put(request, res.clone()));
  return res;
}

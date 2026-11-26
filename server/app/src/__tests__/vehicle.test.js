import { keepDvsaKeyAlive, lookupVehicle } from '../vehicle';

const KEYS = {
  DVLA_API_KEY: 'dvla-key',
  DVSA_API_KEY: 'dvsa-key',
  DVSA_CLIENT_ID: 'id',
  DVSA_CLIENT_SECRET: 'secret',
  DVSA_TOKEN_URL: 'https://login.example/token',
};

const answer = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

/** A pretend fetch: each service's answer by its address, and every call it got. */
function fakeFetch({ dvla = answer(200, { make: 'BMW', fuelType: 'PETROL', co2Emissions: 224 }), dvsa = answer(200, { model: '1 SERIES M', motTests: [] }) } = {}) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    if (url === KEYS.DVSA_TOKEN_URL) return answer(200, { access_token: 'token', expires_in: 3600 });
    if (url.includes('driver-vehicle-licensing')) return typeof dvla === 'function' ? dvla() : dvla;
    if (url.includes('history.mot')) return typeof dvsa === 'function' ? dvsa() : dvsa;
    throw new Error(`unexpected ${url}`);
  };
  return { fetcher, calls };
}

describe('lookupVehicle', () => {
  it('asks both and joins their answers', async () => {
    const { fetcher, calls } = fakeFetch();
    const { status, body } = await lookupVehicle(KEYS, 'ab11 cde', fetcher);
    expect(status).toBe(200);
    expect(body.sources).toEqual({ dvla: 'found', dvsa: 'found' });
    expect(body.vehicle).toMatchObject({ registration: 'AB11CDE', make: 'BMW', model: '1 Series M', mpg: 29 });
    const dvla = calls.find((c) => c.url.includes('driver-vehicle-licensing'));
    expect(JSON.parse(dvla.init.body)).toEqual({ registrationNumber: 'AB11CDE' });
    expect(dvla.init.headers['x-api-key']).toBe('dvla-key');
    const dvsa = calls.find((c) => c.url.includes('history.mot'));
    expect(dvsa.url).toMatch(/registration\/AB11CDE$/);
    expect(dvsa.init.headers).toEqual({ Authorization: 'Bearer token', 'X-API-Key': 'dvsa-key' });
  });

  it("keeps DVSA's token for the next lookup", async () => {
    const { fetcher, calls } = fakeFetch();
    await lookupVehicle(KEYS, 'AB11CDE', fetcher);
    expect(calls.filter((c) => c.url === KEYS.DVSA_TOKEN_URL)).toHaveLength(0);
  });

  it('still answers when one of them fails', async () => {
    const { fetcher } = fakeFetch({ dvsa: answer(500, {}) });
    const { status, body } = await lookupVehicle(KEYS, 'AB11CDE', fetcher);
    expect(status).toBe(200);
    expect(body.sources).toEqual({ dvla: 'found', dvsa: 'failed' });
    expect(body.vehicle.model).toBeNull();
  });

  it('asks only the ones whose keys are set', async () => {
    const { fetcher, calls } = fakeFetch();
    const { body } = await lookupVehicle({ DVLA_API_KEY: 'dvla-key' }, 'AB11CDE', fetcher);
    expect(body.sources).toEqual({ dvla: 'found', dvsa: 'off' });
    expect(calls.every((c) => c.url.includes('driver-vehicle-licensing'))).toBe(true);
  });

  it('says not found when neither knows it', async () => {
    const { fetcher } = fakeFetch({ dvla: answer(404, {}), dvsa: answer(404, {}) });
    const { status } = await lookupVehicle(KEYS, 'AB11CDE', fetcher);
    expect(status).toBe(404);
  });

  it("says it can't look up when nothing could be asked", async () => {
    const { fetcher } = fakeFetch({ dvla: answer(503, {}) });
    expect((await lookupVehicle({ DVLA_API_KEY: 'k' }, 'AB11CDE', fetcher)).status).toBe(503);
    expect((await lookupVehicle({}, 'AB11CDE', fetcher)).status).toBe(503);
  });

  it('turns away a registration that cannot be one', async () => {
    const { fetcher, calls } = fakeFetch();
    expect((await lookupVehicle(KEYS, '!', fetcher)).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});

describe('keepDvsaKeyAlive', () => {
  it('makes one MOT history lookup, of the set registration', async () => {
    const { fetcher, calls } = fakeFetch();
    expect(await keepDvsaKeyAlive({ ...KEYS, KEEPALIVE_REGISTRATION: 'ab11 cde' }, fetcher)).toBe('found');
    const lookups = calls.filter((c) => c.url.includes('history.mot'));
    expect(lookups.map((c) => c.url)).toEqual(['https://history.mot.api.gov.uk/v1/trade/vehicles/registration/AB11CDE']);
    expect(calls.some((c) => c.url.includes('driver-vehicle-licensing'))).toBe(false);
  });

  it('uses a registration that cannot be issued when none is set', async () => {
    const { fetcher, calls } = fakeFetch({ dvsa: answer(404, {}) });
    expect(await keepDvsaKeyAlive(KEYS, fetcher)).toBe('not-found');
    expect(calls.at(-1).url).toMatch(/ZZ99ZZZ$/);
  });

  it('does nothing before DVSA is set up', async () => {
    const { fetcher, calls } = fakeFetch();
    expect(await keepDvsaKeyAlive({}, fetcher)).toBe('off');
    expect(calls).toHaveLength(0);
  });
});

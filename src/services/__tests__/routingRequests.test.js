import { routeDrive } from '../routing';

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { routesApiKey: 'test-key', androidPackage: 'com.example', androidCert: 'ABC' } },
}));
jest.mock('expo-sqlite/kv-store', () => {
  const items = new Map();
  return {
    __esModule: true,
    default: {
      getItemAsync: async (k) => items.get(k) ?? null,
      setItemAsync: async (k, v) => {
        items.set(k, v);
      },
      clear: () => items.clear(),
    },
  };
});

const Storage = jest.requireMock('expo-sqlite/kv-store').default;
const at = (latitude, via = false) => ({ latitude, longitude: 0, via });
// '_p~iF~ps|U' is one point (38.5, -120.2); each reply draws two.
const reply = (legs, status = 200) =>
  Promise.resolve({
    ok: status === 200,
    status,
    json: () =>
      Promise.resolve({
        routes: [
          {
            legs: legs.map(([m, s]) => ({ distanceMeters: m, duration: `${s}s` })),
            polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC' },
          },
        ],
      }),
  });

describe('routeDrive', () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    Storage.clear();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('gives each leg, the totals and the line, in the cheaper tier from the app', async () => {
    global.fetch = jest.fn(() => reply([[1000, 60], [2000, 120]]));
    const route = await routeDrive([at(1), at(2), at(3)]);
    expect(route).toMatchObject({ metres: 3000, seconds: 180, legs: [{ metres: 1000 }, { metres: 2000 }] });
    expect(route.line).toHaveLength(2);
    const [, { headers, body }] = global.fetch.mock.calls[0];
    expect(headers).toMatchObject({ 'X-Goog-Api-Key': 'test-key', 'X-Android-Package': 'com.example', 'X-Android-Cert': 'ABC' });
    expect(JSON.parse(body)).toMatchObject({ routingPreference: 'TRAFFIC_UNAWARE', intermediates: [{}] });
  });

  it('joins a leg split between two requests at a point driven through', async () => {
    const points = Array.from({ length: 14 }, (_, i) => at(i, i > 0 && i < 13));
    global.fetch = jest.fn().mockReturnValueOnce(reply([[5000, 300]])).mockReturnValueOnce(reply([[1000, 60]]));
    const route = await routeDrive(points);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(route.legs).toEqual([{ metres: 6000, seconds: 360 }]);
    expect(route.line).toHaveLength(3); // the shared point once
  });

  it('leaves a ferry crossing out of the miles but not the time', async () => {
    const steps = [
      { distanceMeters: 4000, navigationInstruction: { maneuver: 'TURN_LEFT' } },
      { distanceMeters: 12000, navigationInstruction: { maneuver: 'FERRY' } },
      { distanceMeters: 2000, navigationInstruction: { maneuver: 'STRAIGHT' } },
    ];
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            routes: [
              {
                legs: [
                  { distanceMeters: 18000, duration: '3600s', steps },
                  { distanceMeters: 1000, duration: '60s' },
                ],
                polyline: { encodedPolyline: '_p~iF~ps|U' },
              },
            ],
          }),
      })
    );
    const route = await routeDrive([at(1), at(2), at(3)]);
    expect(route.legs).toEqual([{ metres: 6000, seconds: 3600, ferry: true }, { metres: 1000, seconds: 60 }]);
    expect(route).toMatchObject({ metres: 7000, seconds: 3660, ferry: true });
    const [, { headers }] = global.fetch.mock.calls[0];
    expect(headers['X-Goog-FieldMask']).toContain('routes.legs.steps.navigationInstruction.maneuver');
  });

  it("says it's limited when Google's daily cap is reached", async () => {
    global.fetch = jest.fn(() => reply([], 429));
    expect(await routeDrive([at(1), at(2)])).toEqual({ limited: true });
  });

  it("stops at the phone's own daily limit without asking", async () => {
    await Storage.setItemAsync('routing.count', JSON.stringify({ day: new Date().toISOString().slice(0, 10), used: 100 }));
    global.fetch = jest.fn();
    expect(await routeDrive([at(1), at(2)])).toEqual({ limited: true });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('says it failed when offline or on an error, without throwing', async () => {
    global.fetch = jest.fn(() => Promise.reject(new TypeError('Network request failed')));
    expect(await routeDrive([at(1), at(2)])).toEqual({ failed: true });
    global.fetch = jest.fn(() => reply([], 403));
    expect(await routeDrive([at(1), at(2)])).toEqual({ failed: true });
  });
});

import { photonPlaces, searchPlaces } from '../placeSearch';

const feature = (properties, coordinates = [-5.6659, 57.3336]) => ({
  type: 'Feature',
  properties: { osm_type: 'N', osm_id: 1, ...properties },
  geometry: { type: 'Point', coordinates },
});

const plockton = feature({
  name: 'Plockton',
  osm_value: 'village',
  county: 'Highland',
  state: 'Scotland',
  country: 'United Kingdom',
});

const reply = (json, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 503, json: () => Promise.resolve(json) });

describe('photonPlaces', () => {
  it('gives the name, what and where it is, and its position', () => {
    expect(photonPlaces({ features: [plockton] })).toEqual([
      {
        id: 'N1',
        name: 'Plockton',
        detail: 'Village · Highland · United Kingdom',
        latitude: 57.3336,
        longitude: -5.6659,
      },
    ]);
  });

  it('names the town for a place in it, but not a town in itself', () => {
    const station = feature({ name: 'Plockton', osm_value: 'station', city: 'Plockton', county: 'Highland' });
    const school = feature({ name: 'Plockton High School', osm_value: 'school', city: 'Plockton' });
    const [a, b] = photonPlaces({ features: [station, school] });
    expect(a.detail).toBe('Station · Highland');
    expect(b.detail).toBe('School · Plockton');
  });

  it('leaves out unnamed results and repeats', () => {
    const unnamed = feature({ osm_value: 'house' });
    expect(photonPlaces({ features: [plockton, unnamed, plockton] })).toHaveLength(1);
  });

  it('copes with an empty or odd reply', () => {
    expect(photonPlaces({})).toEqual([]);
    expect(photonPlaces(null)).toEqual([]);
  });
});

describe('searchPlaces', () => {
  const realFetch = global.fetch;
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("doesn't ask until there are 3 letters", async () => {
    global.fetch = jest.fn();
    expect(await searchPlaces('Pl')).toEqual({ places: [] });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('asks near the drive and returns places', async () => {
    global.fetch = jest.fn(() => reply({ features: [plockton] }));
    const result = await searchPlaces(' Plock ', { near: { latitude: 57.27, longitude: -5.51 } });
    expect(result.places.map((p) => p.name)).toEqual(['Plockton']);
    const url = new URL(global.fetch.mock.calls[0][0]);
    expect(url.searchParams.get('q')).toBe('Plock');
    expect(url.searchParams.get('lat')).toBe('57.2700');
    expect(url.searchParams.get('lon')).toBe('-5.5100');
  });

  it('returns no places when nothing matches', async () => {
    global.fetch = jest.fn(() => reply({ type: 'FeatureCollection', features: [] }));
    expect(await searchPlaces('Xyzzyplock')).toEqual({ places: [] });
  });

  it('says it failed when the service errs or is offline, without throwing', async () => {
    global.fetch = jest.fn(() => reply({}, false));
    expect(await searchPlaces('Plock')).toEqual({ failed: true });
    global.fetch = jest.fn(() => Promise.reject(new TypeError('Network request failed')));
    expect(await searchPlaces('Plock')).toEqual({ failed: true });
  });

  it('gives up after 5 seconds', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(
      (url, { signal }) =>
        new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Aborted'))))
    );
    const result = searchPlaces('Plock');
    jest.advanceTimersByTime(5000);
    expect(await result).toEqual({ failed: true });
  });

  it('is cancelled when a newer search takes over', async () => {
    global.fetch = jest.fn(
      (url, { signal }) =>
        new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Aborted'))))
    );
    const controller = new AbortController();
    const result = searchPlaces('Plock', { signal: controller.signal });
    controller.abort();
    expect(await result).toEqual({ cancelled: true });
  });
});

import data from '../../data/iconicRoads.json';
import {
  MAX_GOOGLE_URL,
  appleMapsLink,
  googleMapsLinks,
  roadGuidePoints,
  wazeLinks,
} from '../navLinks';

const bealach = data.roads.find((r) => r.id === 'bealach-na-ba');
const at = (latitude, longitude) => ({ latitude, longitude });
const fortAugustus = at(57.1447, -4.6814);
const eileanDonan = at(57.274, -5.5161);
const applecross = at(57.4335, -5.815);

/** The decoded waypoints and destination of a Google Maps link. */
function parts(url) {
  const q = new URL(url).searchParams;
  return {
    destination: q.get('destination'),
    waypoints: q.get('waypoints') ? q.get('waypoints').split('|') : [],
    navigate: q.get('dir_action'),
    mode: q.get('travelmode'),
  };
}

describe('roadGuidePoints', () => {
  it('spaces points along the road, away from its ends', () => {
    const points = roadGuidePoints(bealach, 3);
    expect(points).toHaveLength(3);
    expect(points.every((p) => p.road === 'bealach-na-ba')).toBe(true);
    const first = bealach.line[0];
    expect([points[0].latitude, points[0].longitude]).not.toEqual(first);
  });

  it('gives one point, at the middle, unless asked for more', () => {
    const [middle] = roadGuidePoints(bealach);
    const mid = bealach.line[Math.round((bealach.line.length - 1) / 2)];
    expect([middle.latitude, middle.longitude]).toEqual(mid);
  });

  it('reverses for a road driven from its finish', () => {
    const forward = roadGuidePoints(bealach, 3);
    const back = roadGuidePoints(bealach, 3, { reversed: true });
    expect(back.map((p) => p.latitude)).toEqual(forward.map((p) => p.latitude).reverse());
  });
});

describe('googleMapsLinks', () => {
  it('sends a whole drive as one link, finish as the destination', () => {
    const drive = [fortAugustus, eileanDonan, ...roadGuidePoints(bealach, 3), applecross];
    const links = googleMapsLinks(drive);
    expect(links).toHaveLength(1);
    const { destination, waypoints, navigate, mode } = parts(links[0]);
    expect(destination).toBe('57.433500,-5.815000');
    expect(waypoints).toHaveLength(5);
    expect(waypoints[0]).toBe('57.144700,-4.681400');
    // The route overview, which shows the whole drive's time; the driver taps Start.
    expect(navigate).toBeNull();
    expect(mode).toBe('driving');
    expect(links[0].length).toBeLessThanOrEqual(MAX_GOOGLE_URL);
  });

  it('thins guide points first, keeping one per road and every stop', () => {
    const stops = Array.from({ length: 7 }, (_, i) => at(57 + i / 10, -5));
    const drive = [...stops.slice(0, 4), ...roadGuidePoints(bealach, 4), ...stops.slice(4)];
    const { waypoints } = parts(googleMapsLinks(drive)[0]);
    expect(waypoints).toHaveLength(9);
    for (const s of stops.slice(0, -1)) expect(waypoints).toContain(`${s.latitude.toFixed(6)},-5.000000`);
  });

  it('splits a drive with more stops than one link takes', () => {
    const stops = Array.from({ length: 15 }, (_, i) => at(50 + i / 10, -3));
    const links = googleMapsLinks(stops);
    expect(links).toHaveLength(2);
    expect(parts(links[0]).waypoints).toHaveLength(9);
    expect(parts(links[0]).destination).toBe('50.900000,-3.000000');
    expect(parts(links[1]).destination).toBe('51.400000,-3.000000');
  });

  it('gives nothing for an empty drive', () => {
    expect(googleMapsLinks([])).toEqual([]);
  });
});

describe('wazeLinks', () => {
  it('makes a leg of each stop and of each Iconic Road’s ends', () => {
    const guides = roadGuidePoints(bealach, 3);
    const links = wazeLinks([fortAugustus, eileanDonan, ...guides, applecross]);
    // Fort Augustus, Eilean Donan, the road's first and last guide points, Applecross.
    expect(links).toHaveLength(5);
    expect(links[0]).toBe('https://waze.com/ul?ll=57.144700%2C-4.681400&navigate=yes');
  });
});

describe('appleMapsLink', () => {
  it('repeats the destination for each point in order', () => {
    const q = new URL(appleMapsLink([fortAugustus, applecross])).searchParams;
    expect(q.getAll('daddr')).toEqual(['57.144700,-4.681400', '57.433500,-5.815000']);
    expect(q.get('dirflg')).toBe('d');
  });
});

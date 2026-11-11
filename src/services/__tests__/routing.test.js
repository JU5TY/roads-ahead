import { decodePolyline, routeParts } from '../routing';

describe('decodePolyline', () => {
  it("decodes Google's own example", () => {
    // From Google's polyline algorithm page.
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
      { latitude: 38.5, longitude: -120.2 },
      { latitude: 40.7, longitude: -120.95 },
      { latitude: 43.252, longitude: -126.453 },
    ]);
  });
});

describe('routeParts', () => {
  const points = (n) => Array.from({ length: n }, (_, i) => ({ latitude: i, longitude: 0 }));

  it('asks in one go with up to 10 points in between', () => {
    expect(routeParts(points(12))).toHaveLength(1);
  });

  it('splits a longer drive, each part starting where the last ended', () => {
    const parts = routeParts(points(20));
    expect(parts).toHaveLength(2);
    expect(parts[0]).toHaveLength(12);
    expect(parts[1][0]).toBe(parts[0].at(-1));
    expect(parts[1].at(-1).latitude).toBe(19);
    expect(parts.every((p) => p.length - 2 <= 10)).toBe(true);
  });
});

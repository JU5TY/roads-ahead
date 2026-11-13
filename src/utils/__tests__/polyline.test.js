import { decodeLine, encodeLine } from '../polyline';

describe('encoded lines', () => {
  it("matches Google's own example", () => {
    const line = [
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ];
    expect(encodeLine(line)).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(decodeLine('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual(line);
  });

  it('comes back exactly as it went in, to 5 decimal places', () => {
    const line = [
      [57.4335, -5.815],
      [57.43351, -5.81499],
      [-33.86785, 151.20732],
      [0, 0],
    ];
    expect(decodeLine(encodeLine(line))).toEqual(line);
  });
});

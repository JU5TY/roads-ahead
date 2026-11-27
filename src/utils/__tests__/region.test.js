import { isUk } from '../region';

describe('isUk', () => {
  it("counts a UK language region or the UK's time zone", () => {
    expect(isUk('en-GB', 'Europe/Paris')).toBe(true);
    expect(isUk('cy-GB', 'Europe/London')).toBe(true);
    expect(isUk('en-US', 'Europe/London')).toBe(true);
  });

  it('leaves everyone else out', () => {
    expect(isUk('fr-FR', 'Europe/Paris')).toBe(false);
    expect(isUk('en-IE', 'Europe/Dublin')).toBe(false);
    expect(isUk(undefined, undefined)).toBe(false);
  });
});

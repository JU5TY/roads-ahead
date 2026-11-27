import appJson from '../../../app.json';
import { APP_NAME, APP_SLUG, APP_WORD } from '../appName';

describe('the app name', () => {
  it("matches app.json's, so a rename changes both", () => {
    expect(APP_NAME).toBe(appJson.expo.name);
  });

  it('makes the file names', () => {
    expect(APP_WORD).toMatch(/^[a-z0-9]+$/);
    expect(APP_SLUG).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

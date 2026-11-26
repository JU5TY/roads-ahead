// Renders a poster spec to a local PDF with the app's own drawing code, to check a
// print without the phone:
// `node scripts/render-sample.mjs spec.json out.pdf [photo.jpg]`
// A spec can be copied from the app's console, or made from the example trip.
import { readFile, writeFile } from 'node:fs/promises';

import { renderPoster } from '../../../src/utils/posterPdf.js';

const [specPath, outPath, photoPath] = process.argv.slice(2);
if (!specPath || !outPath) {
  console.error('Usage: node scripts/render-sample.mjs spec.json out.pdf [photo.jpg]');
  process.exit(1);
}

const fontsDir = new URL('../../../assets/fonts/', import.meta.url);
const spec = JSON.parse(await readFile(specPath, 'utf8'));
const pdf = await renderPoster({
  spec,
  fonts: {
    light: await readFile(new URL('GoogleSansFlex-Light.ttf', fontsDir)),
    regular: await readFile(new URL('GoogleSansFlex-Regular.ttf', fontsDir)),
  },
  photo: photoPath
    ? { bytes: await readFile(photoPath), type: photoPath.toLowerCase().endsWith('.png') ? 'png' : 'jpg' }
    : null,
});
await writeFile(outPath, pdf);
console.log(`Wrote ${outPath} (${Math.round(pdf.length / 1024)} KB)`);

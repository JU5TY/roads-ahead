// Just enough of a JPEG's header to print it the right way up: its EXIF orientation.

const SOI = 0xffd8;
const APP1 = 0xffe1;
const SOS = 0xffda;
const ORIENTATION_TAG = 0x0112;

/** { orientation } (1-8, 1 when there's none) from a JPEG file's bytes. */
export function jpegInfo(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 4 || view.getUint16(0) !== SOI) return { orientation: 1 };
  let at = 2;
  while (at + 4 <= view.byteLength) {
    const marker = view.getUint16(at);
    if (marker === SOS || (marker & 0xff00) !== 0xff00) break;
    const length = view.getUint16(at + 2);
    if (marker === APP1) {
      const orientation = exifOrientation(view, at + 4, length - 2);
      if (orientation) return { orientation };
    }
    at += 2 + length;
  }
  return { orientation: 1 };
}

/** The orientation tag from an APP1 segment starting at `start`, or null. */
function exifOrientation(view, start, length) {
  const end = start + length;
  // "Exif\0\0", then a TIFF header saying which way round its numbers are.
  if (end > view.byteLength || view.getUint32(start) !== 0x45786966) return null;
  const tiff = start + 6;
  const little = view.getUint16(tiff) === 0x4949;
  const u16 = (o) => view.getUint16(o, little);
  const u32 = (o) => view.getUint32(o, little);
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > end) return null;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) return null;
    if (u16(entry) === ORIENTATION_TAG) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

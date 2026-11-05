// GPX 1.1 text, in pieces so a long export can be written to its file bit by bit
// (services/exportService.js). A trip is one track, each of its drives a segment.

// Roughly how many bytes a track point takes once zipped (measured on a simulated drive), for estimating an export's size.
export const GPX_ZIPPED_BYTES_PER_POINT = 16;

// Characters XML doesn't allow at all, even escaped (a stray one makes the whole file invalid).
const INVALID_XML = /[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu;

const escapeXml = (text) =>
  text
    .replace(INVALID_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export const gpxStart = () =>
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<gpx version="1.1" creator="Roads Ahead" xmlns="http://www.topografix.com/GPX/1/1">\n';

export const gpxEnd = () => '</gpx>\n';

export const gpxTrackStart = (name, notes) =>
  `<trk><name>${escapeXml(name)}</name>${notes ? `<desc>${escapeXml(notes)}</desc>` : ''}\n`;

export const gpxTrackEnd = () => '</trk>\n';

/** One drive's points, from getDrivePoints. Empty when it has none: GPX needs no empty segment. */
export function gpxSegment(points) {
  if (!points.length) return '';
  const rows = points.map(({ latitude, longitude, altitude, timestamp }) => {
    const ele = altitude == null ? '' : `<ele>${altitude.toFixed(1)}</ele>`;
    const time = new Date(timestamp).toISOString();
    return `<trkpt lat="${latitude.toFixed(6)}" lon="${longitude.toFixed(6)}">${ele}<time>${time}</time></trkpt>`;
  });
  return `<trkseg>\n${rows.join('\n')}\n</trkseg>\n`;
}

/** A safe file name from a trip's title: "Côte d'Azur: day 1?" gives "cote-dazur-day-1.gpx". */
export function gpxFileName(title) {
  const name = title
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // accents
    .replace(/['’]/g, '')
    .replace(/→/g, ' to ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .slice(0, 80)
    .replace(/^-+|-+$/g, '');
  return `${name || 'trip'}.gpx`;
}

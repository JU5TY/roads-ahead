// Lines bundled with the app (Iconic Roads, Iconic Trips) are stored packed as
// Google's encoded polyline format: each point's change from the one before,
// to 5 decimal places, a few characters a point instead of about twenty. The
// build scripts pack them; the app unpacks them once as it loads.

/** [[lat, lng]] (5 decimal places) to an encoded polyline string. */
export function encodeLine(points) {
  let out = '';
  let lastLat = 0;
  let lastLng = 0;
  const put = (delta) => {
    let v = delta < 0 ? ~(delta << 1) : delta << 1;
    while (v >= 0x20) {
      out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    out += String.fromCharCode(v + 63);
  };
  for (const [lat, lng] of points) {
    const la = Math.round(lat * 1e5);
    const ln = Math.round(lng * 1e5);
    put(la - lastLat);
    put(ln - lastLng);
    lastLat = la;
    lastLng = ln;
  }
  return out;
}

/** An encoded polyline string back to [[lat, lng]]. */
export function decodeLine(text) {
  const points = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const take = () => {
    let shift = 0;
    let v = 0;
    let b;
    do {
      b = text.charCodeAt(i++) - 63;
      v |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return v & 1 ? ~(v >> 1) : v >> 1;
  };
  while (i < text.length) {
    lat += take();
    lng += take();
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

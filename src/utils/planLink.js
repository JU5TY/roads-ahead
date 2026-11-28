// A plan inside a link, for sharing it: no server, nothing stored anywhere.
// The plan is packed as short JSON, then base64url, so it survives any
// messaging app. `v` numbers the format so older links can still be read.
//
// { v: 1, n: name, d?: 'YYYY-MM-DD', r?: 1 (round trip), t?: Iconic Trip id,
//   D?: [{ s?: [name, lat, lng], p: [[name, lat, lng, 1?] | [roadId, 1?]] }] }
// A place stop is [name, lat, lng] (a 4th 1: found by search, not a pin); an
// Iconic Road is [roadId] with a 1 when it's driven the other way. A copied
// Iconic Trip carries only its id (`t`): everyone has the trip in the app.

import { getRoad } from './iconicRoads';
import { getReadyRoute, routePlanDrives } from './readyRoutes';

const VERSION = 1;
// The website's link for a plan: the plan rides after the #, so it never reaches the server.
// Older test links (roadtrip://shared?p=…) still open: the app keeps that scheme.
export const PLAN_WEB_BASE = 'https://viameter.app/p#';

// A website link as it reaches the app: a whole URL or just its path, the plan after # or ?p=.
const WEB_LINK = /^(?:https:\/\/(?:www\.)?viameter\.app)?\/p\/?(?:#|\?p=)([A-Za-z0-9_-]+)$/;

const round = (n) => Math.round(n * 1e5) / 1e5;
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** UTF-8 bytes of a string (place names can have accents). */
function utf8(text) {
  const bytes = [];
  for (const ch of text) {
    let c = ch.codePointAt(0);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else {
      bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
  }
  return bytes;
}

function fromUtf8(bytes) {
  let out = '';
  let i = 0;
  const next = () => bytes[i++] & 63;
  while (i < bytes.length) {
    const b = bytes[i++];
    let c = b;
    if (b >= 0xf0) c = ((b & 7) << 18) | (next() << 12) | (next() << 6) | next();
    else if (b >= 0xe0) c = ((b & 15) << 12) | (next() << 6) | next();
    else if (b >= 0xc0) c = ((b & 31) << 6) | next();
    out += String.fromCodePoint(c);
  }
  return out;
}

function toBase64Url(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += B64[n & 63];
  }
  return out;
}

function fromBase64Url(text) {
  const bytes = [];
  let bits = 0;
  let value = 0;
  for (const ch of text) {
    const v = B64.indexOf(ch);
    if (v < 0) throw new Error('Not a plan link');
    value = (value << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 255);
    }
  }
  return bytes;
}

/** A plan from planStorage as the text that goes in its link. */
export function encodePlan(plan) {
  const packed = { v: VERSION, n: plan.name };
  if (plan.startDate) packed.d = plan.startDate;
  if (plan.roundTrip) packed.r = 1;
  if (plan.routeId) packed.t = plan.routeId;
  else {
    packed.D = plan.drives.map((drive) => {
      const d = {
        p: drive.stops.map((s) =>
          s.roadId
            ? s.reversed
              ? [s.roadId, 1]
              : [s.roadId]
            : [s.name ?? '', round(s.latitude), round(s.longitude), ...(s.source === 'search' ? [1] : [])]
        ),
      };
      if (drive.start) d.s = [drive.start.name ?? '', round(drive.start.latitude), round(drive.start.longitude)];
      return d;
    });
  }
  return toBase64Url(utf8(JSON.stringify(packed)));
}

/**
 * The link's text back as what createPlan takes: { name, startDate, roundTrip,
 * routeId, drives }, or null when it isn't a plan this version can read (an
 * Iconic Road or Trip it doesn't have, or a newer format).
 */
export function decodePlan(text) {
  let packed;
  try {
    packed = JSON.parse(fromUtf8(fromBase64Url(text)));
  } catch {
    return null;
  }
  if (!packed || packed.v !== VERSION || typeof packed.n !== 'string') return null;
  const base = { name: packed.n, startDate: packed.d ?? null, roundTrip: packed.r === 1 };
  if (packed.t) {
    const route = getReadyRoute(packed.t);
    return route ? { ...base, routeId: route.id, drives: routePlanDrives(route) } : null;
  }
  if (!Array.isArray(packed.D) || packed.D.length === 0) return null;
  const drives = [];
  for (const d of packed.D) {
    const stops = [];
    for (const p of d.p ?? []) {
      // A place has its coordinates; an Iconic Road is its id, and a 1 when reversed.
      if (p.length >= 3) {
        stops.push({ name: p[0] || null, latitude: p[1], longitude: p[2], source: p[3] === 1 ? 'search' : 'pin', roadId: null, reversed: false });
      } else {
        const road = getRoad(p[0]);
        if (!road) return null;
        const [latitude, longitude] = road.line[0];
        stops.push({ name: road.name, latitude, longitude, source: 'pin', roadId: road.id, reversed: p[1] === 1 });
      }
    }
    const start = d.s ? { name: d.s[0] || null, latitude: d.s[1], longitude: d.s[2] } : null;
    drives.push({ start, stops });
  }
  return { ...base, routeId: null, drives };
}

/**
 * A short fingerprint of a link's text (FNV-1a), kept with the plan it opened:
 * the same link again finds that plan.
 */
export function linkKey(text) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x811c9dc5) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/** The link to share for a plan. */
export const planLink = (plan) => PLAN_WEB_BASE + encodePlan(plan);

/**
 * Where a link opened from outside goes: a plan on the website opens the
 * shared plan, like a roadtrip:// or viameter:// link; anything else is left as it came.
 */
export function sharedPlanPath(path) {
  const match = WEB_LINK.exec(path ?? '');
  return match ? `/shared?p=${match[1]}` : path;
}

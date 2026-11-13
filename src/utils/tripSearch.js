// Trips search: what a trip or plan can be found by, matched as you type.
// Pure functions over the lists Trips already loads; nothing is fetched.
import { getCountry } from './countries';
import { getRoad } from './iconicRoads';
import { tripTitle } from './tripSummary';
import { vehicleLabel } from './vehicles';

/** Lower case, with accents and punctuation folded, so "Bealach na Ba" finds "Bealach na Bà". */
const fold = (text) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** "June 2026 Jun", for each month a trip was driven in. */
const monthWords = (ts) =>
  ['long', 'short'].map((month) => new Date(ts).toLocaleDateString('en-GB', { month })).join(' ') +
  ` ${new Date(ts).getFullYear()}`;

/**
 * Everything a driven trip can be found by: its title and name, places, Iconic
 * Roads (`roadIds`), countries, months and years, vehicles and notes.
 * `vehicles` is a Map of id → vehicle.
 */
export function tripSearchText(trip, { roadIds = [], vehicles = new Map() } = {}) {
  const parts = [tripTitle(trip), trip.name, trip.notes];
  for (const drive of trip.drives) {
    const { start, end, stops = [] } = drive.places ?? {};
    parts.push(start, end, ...stops, monthWords(drive.startedAt));
    for (const c of drive.countries ?? []) parts.push(getCountry(c.code)?.name);
    const vehicle = drive.vehicleId != null ? vehicles.get(drive.vehicleId) : null;
    if (vehicle) parts.push(vehicleLabel(vehicle));
  }
  for (const id of roadIds) parts.push(getRoad(id)?.name);
  return fold(parts.filter(Boolean).join(' '));
}

/** Everything a plan can be found by: its name, stops and Iconic Roads. */
export function planSearchText(plan) {
  const parts = [plan.name];
  for (const drive of plan.drives) {
    if (drive.start?.name) parts.push(drive.start.name);
    for (const stop of drive.stops) parts.push(stop.roadId ? getRoad(stop.roadId)?.name : stop.name);
  }
  return fold(parts.filter(Boolean).join(' '));
}

/** Whether `text` (from tripSearchText or planSearchText) has every word of `query` in it. */
export function searchMatches(text, query) {
  const words = fold(query).split(' ').filter(Boolean);
  return words.every((w) => text.includes(w));
}

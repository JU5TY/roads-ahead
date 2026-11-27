import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';

import { getSavedUkFuelPrices, refreshUkFuelPrices } from '../services/fuelPriceService';
import { hasAnyDrive } from '../storage/driveStorage';
import * as settingsStorage from '../storage/settingsStorage';

const SettingsContext = createContext(null);

const save = (promise) => promise.catch((err) => console.warn('[settings] save failed', err));

export function SettingsProvider({ children }) {
  const [units, setUnits] = useState(settingsStorage.getUnits);
  const [breakReminderMinutes, setBreakReminderMinutes] = useState(
    settingsStorage.getBreakReminderMinutes
  );
  // Whether Welcome has been passed. null until known: people who used the app
  // before Welcome existed already have drives, so they skip it.
  const [onboarded, setOnboarded] = useState(settingsStorage.getOnboarded);
  const [theme, setTheme] = useState(settingsStorage.getTheme);
  const [mapView, setMapView] = useState(settingsStorage.getMapView);
  const [navApp, setNavApp] = useState(settingsStorage.getNavApp);
  const [prices, setPrices] = useState(() => ({
    fuel: settingsStorage.getPrice('fuel'),
    charge: settingsStorage.getPrice('charge'),
  }));
  // The UK's weekly average pump prices, for costing drives (utils/fuel.js):
  // only in pounds, which UK phones start on (a UK phone abroad keeps them).
  const [ukFuelWeeks, setUkFuelWeeks] = useState(() => getSavedUkFuelPrices()?.weeks ?? null);
  const inPounds = units === 'imperial';

  useEffect(() => {
    if (!inPounds) return;
    refreshUkFuelPrices()
      .then((next) => next && setUkFuelWeeks(next.weeks))
      .catch((err) => console.warn('[fuel] UK prices failed', err));
  }, [inPounds]);

  // Pin the app (and the maps and system bars) to light or dark, or follow the phone.
  useEffect(() => {
    Appearance.setColorScheme(theme === 'system' ? 'unspecified' : theme);
  }, [theme]);

  useEffect(() => {
    if (onboarded !== null) return;
    hasAnyDrive()
      .catch(() => false)
      .then((has) => {
        setOnboarded(has);
        if (has) save(settingsStorage.setOnboarded(true));
      });
  }, [onboarded]);

  const value = useMemo(
    () => ({
      units,
      setUnits: (next) => {
        if (next === units) return;
        setUnits(next);
        save(settingsStorage.setUnits(next));
        // A price typed in pounds isn't one in euros: it's typed again.
        setPrices({ fuel: null, charge: null });
        save(settingsStorage.setPrice('fuel', null));
        save(settingsStorage.setPrice('charge', null));
      },
      breakReminderMinutes,
      setBreakReminderMinutes: (next) => {
        setBreakReminderMinutes(next);
        save(settingsStorage.setBreakReminderMinutes(next));
      },
      theme,
      setTheme: (next) => {
        setTheme(next);
        save(settingsStorage.setTheme(next));
      },
      mapView,
      setMapView: (next) => {
        setMapView(next);
        save(settingsStorage.setMapView(next));
      },
      navApp,
      setNavApp: (next) => {
        setNavApp(next);
        save(settingsStorage.setNavApp(next));
      },
      // { fuel, charge }: each { price, setAt } (pounds or euros a litre / a kWh) or null.
      prices,
      // Remembers when, so an old price is noticed on You.
      setPrice: (kind, price) => {
        const next = { price, setAt: Date.now() };
        setPrices((prev) => ({ ...prev, [kind]: next }));
        save(settingsStorage.setPrice(kind, next));
      },
      // [[week, petrol pence, diesel pence]], oldest first, or null until fetched
      // (and always in euros).
      ukFuelWeeks: units === 'imperial' ? ukFuelWeeks : null,
      onboarded,
      finishOnboarding: () => {
        setOnboarded(true);
        save(settingsStorage.setOnboarded(true));
      },
      // Development only: show Welcome again without clearing any trips.
      replayOnboarding: () => {
        setOnboarded(false);
        save(settingsStorage.setOnboarded(false));
      },
    }),
    [units, breakReminderMinutes, theme, mapView, navApp, prices, ukFuelWeeks, onboarded]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);

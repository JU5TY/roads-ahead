import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';

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
  const [showIconicRoads, setShowIconicRoads] = useState(settingsStorage.getShowIconicRoads);
  const [theme, setTheme] = useState(settingsStorage.getTheme);
  const [mapView, setMapView] = useState(settingsStorage.getMapView);
  const [prices, setPrices] = useState(() => ({
    fuel: settingsStorage.getPrice('fuel'),
    charge: settingsStorage.getPrice('charge'),
  }));

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
        setUnits(next);
        save(settingsStorage.setUnits(next));
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
      showIconicRoads,
      setShowIconicRoads: (next) => {
        setShowIconicRoads(next);
        save(settingsStorage.setShowIconicRoads(next));
      },
      mapView,
      setMapView: (next) => {
        setMapView(next);
        save(settingsStorage.setMapView(next));
      },
      // { fuel, charge }: each { price, setAt } (pounds a litre / a kWh) or null.
      prices,
      // Remembers when, so an old price is noticed on You.
      setPrice: (kind, price) => {
        const next = { price, setAt: Date.now() };
        setPrices((prev) => ({ ...prev, [kind]: next }));
        save(settingsStorage.setPrice(kind, next));
      },
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
    [units, breakReminderMinutes, theme, showIconicRoads, mapView, prices, onboarded]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);

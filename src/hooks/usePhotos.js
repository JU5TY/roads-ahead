import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking } from 'react-native';

import { getPhotoAccess, getPhotosBetween, requestPhotoAccess } from '../services/photoService';

/**
 * Gallery photos taken during any of `spans` ([[from, to]] in ms), oldest first. Never prompts by itself:
 * { access: null (loading) | 'granted' | 'ask' | 'blocked', photos, allow() }.
 * allow() asks for access, or opens Settings once asking is no longer possible.
 */
export function usePhotos(spans) {
  const [access, setAccess] = useState(null);
  const [photos, setPhotos] = useState([]);
  // Callers build a new array each render; compare by value.
  const spansKey = JSON.stringify(spans?.filter(([from, to]) => from != null && to != null) ?? []);

  const load = useCallback(
    async (nextAccess) => {
      setAccess(nextAccess);
      const ranges = JSON.parse(spansKey);
      if (nextAccess !== 'granted' || ranges.length === 0) return;
      const found = await Promise.all(ranges.map(([from, to]) => getPhotosBetween(from, to)));
      // Spans can overlap or touch, so drop repeats.
      const byId = new Map(found.flat().map((p) => [p.id, p]));
      setPhotos([...byId.values()].sort((a, b) => a.time - b.time));
    },
    [spansKey]
  );

  useFocusEffect(
    useCallback(() => {
      getPhotoAccess()
        .then(load)
        .catch((err) => console.warn('[photos] load failed', err));
    }, [load])
  );

  const allow = useCallback(async () => {
    try {
      if (access === 'blocked') {
        Linking.openSettings();
        return;
      }
      await load(await requestPhotoAccess());
    } catch (err) {
      console.warn('[photos] request failed', err);
    }
  }, [access, load]);

  return { access, photos, allow };
}

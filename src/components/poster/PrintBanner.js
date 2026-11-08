import { router } from 'expo-router';

import { SIZES } from '../../utils/posterLayout';
import BannerCard from '../ui/BannerCard';

/**
 * The Trip page's way in to printing the whole trip, or `drive` alone when one is
 * picked. Matches the Photos card above it. Opens the print page.
 */
export default function PrintBanner({ trip, drive }) {
  const what = drive ? 'drive' : 'trip';
  return (
    <BannerCard
      icon="wall_art"
      title={`Frame this ${what}`}
      subtitle={`Turn your ${what} into a gallery print, A3 or A2, from ${SIZES.A3.price}`}
      onPress={() =>
        router.push(drive ? `/poster?trip=${trip.id}&drive=${drive.id}` : `/poster?trip=${trip.id}`)
      }
      style={styles.card}
    />
  );
}

const styles = { card: { marginTop: 28 } };

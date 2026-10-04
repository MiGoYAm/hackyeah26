import { Platform, TurboModuleRegistry } from 'react-native';

import { MapUnavailable } from '@/components/map-unavailable';

// Builds made before MapLibre was added, and Expo Go, lack its native module, and
// importing the map there throws at module load. Web has its own map component.
export default Platform.OS !== 'web' && !TurboModuleRegistry.get('MLRNMapViewModule')
  ? MapUnavailable
  : // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('@/components/shelter-map') as typeof import('@/components/shelter-map')).ShelterMap;

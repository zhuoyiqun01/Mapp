import { useState, useRef, useCallback } from 'react';
import type L from 'leaflet';

export function useMapInitialization() {
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const mapInitRef = useRef<WeakSet<L.Map>>(new WeakSet());

  const mapRefCallback = useCallback((map: L.Map | null) => {
    if (!map) return;
    setMapInstance(map);

    if (!mapInitRef.current.has(map)) {
      mapInitRef.current.add(map);
      map.whenReady(() => {
        const safeInvalidateAndUpdate = () => {
          if (!map || !map.getContainer()) return false;
          const mapPane = map.getPane('mapPane');
          if (!mapPane) return false;
          try {
            map.invalidateSize();
            return true;
          } catch (error) {
            console.warn('Error updating map view:', error);
            return false;
          }
        };

        if (!safeInvalidateAndUpdate()) {
          setTimeout(() => {
            if (!safeInvalidateAndUpdate()) {
              setTimeout(() => safeInvalidateAndUpdate(), 200);
            }
          }, 100);
        }
      });
    }
  }, []);

  return { mapInstance, mapRefCallback };
}

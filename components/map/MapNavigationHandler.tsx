import React, { useEffect } from 'react';
import { useMap } from 'react-leaflet';

interface MapNavigationHandlerProps {
  coords: { lat: number; lng: number; zoom?: number } | null;
  onComplete?: () => void;
}

export const MapNavigationHandler: React.FC<MapNavigationHandlerProps> = ({ coords, onComplete }) => {
  const map = useMap();

  useEffect(() => {
    // Only process non-null coordinates
    if (coords && map) {
      console.log('[MapNavigationHandler] Navigating to:', coords);
      try {
        const zoom = coords.zoom ?? 19;
        map.setView([coords.lat, coords.lng], zoom, {
          animate: true,
          duration: 1
        });

        // Call onComplete after animation
        const timeoutId = setTimeout(() => {
          try {
            onComplete?.();
          } catch (error) {
            console.warn('MapNavigationHandler: Failed to call onComplete:', error);
          }
        }, 1000);

        return () => clearTimeout(timeoutId);
      } catch (error) {
        console.warn('MapNavigationHandler: Failed to set view:', error);
      }
    }
  }, [coords?.lat, coords?.lng, coords?.zoom, map, onComplete]);

  return null;
};


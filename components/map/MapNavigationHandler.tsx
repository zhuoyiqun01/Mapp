import React, { useEffect } from 'react';
import { useMap } from 'react-leaflet';

interface MapNavigationHandlerProps {
  coords: { lat: number; lng: number } | null;
  onComplete?: () => void;
}

export const MapNavigationHandler: React.FC<MapNavigationHandlerProps> = ({ coords, onComplete }) => {
  const map = useMap();

  useEffect(() => {
    if (coords && map) {
      try {
        map.setView([coords.lat, coords.lng], 19, {
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
  }, [coords, map, onComplete]);

  return null;
};


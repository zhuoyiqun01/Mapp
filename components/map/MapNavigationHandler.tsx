import React, { useEffect } from 'react';
import { useMap } from 'react-leaflet';

interface MapNavigationHandlerProps {
  coords: { lat: number; lng: number; zoom?: number } | null;
  onComplete?: () => void;
}

export const MapNavigationHandler: React.FC<MapNavigationHandlerProps> = ({ coords, onComplete }) => {
  const map = useMap();

  useEffect(() => {
    console.log('[MapNavigationHandler] Received coords:', coords);
    if (coords && map) {
      try {
        const zoom = coords.zoom ?? 19;
        console.log('[MapNavigationHandler] Setting view to:', { lat: coords.lat, lng: coords.lng, zoom });
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
  }, [coords, map, onComplete]);

  return null;
};


import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

interface MapPositionTrackerProps {
  onPositionChange?: (center: [number, number], zoom: number) => void;
  enabled?: boolean;
}

export const MapPositionTracker: React.FC<MapPositionTrackerProps> = ({ onPositionChange, enabled = true }) => {
  const map = useMap();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!map || !onPositionChange || !enabled) return;

    const handleMoveEnd = () => {
      // Debounce to avoid too frequent updates and prevent initial default position from overwriting cache
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        try {
          if (map) {
            const center = map.getCenter();
            const zoom = map.getZoom();
            onPositionChange([center.lat, center.lng], zoom);
          }
        } catch (error) {
          console.warn('MapPositionTracker: Failed to get map position:', error);
        }
      }, 500); // 500ms delay for better responsiveness
    };

    map.on('moveend', handleMoveEnd);
    map.on('zoomend', handleMoveEnd);

    return () => {
      map.off('moveend', handleMoveEnd);
      map.off('zoomend', handleMoveEnd);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [map, onPositionChange]);

  return null;
};


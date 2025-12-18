import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

interface MapPositionTrackerProps {
  onPositionChange?: (center: [number, number], zoom: number) => void;
}

export const MapPositionTracker: React.FC<MapPositionTrackerProps> = ({ onPositionChange }) => {
  const map = useMap();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!map || !onPositionChange) return;

    const handleMoveEnd = () => {
      // Debounce to avoid too frequent updates and prevent initial default position from overwriting cache
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        const center = map.getCenter();
        const zoom = map.getZoom();
        onPositionChange([center.lat, center.lng], zoom);
      }, 2000); // 2 second delay
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

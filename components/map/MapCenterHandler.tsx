import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

interface MapCenterHandlerProps {
  center: [number, number];
  zoom: number;
}

export const MapCenterHandler: React.FC<MapCenterHandlerProps> = ({ center, zoom }) => {
  const map = useMap();
  const hasCenteredRef = useRef(false);

  useEffect(() => {
    if (!hasCenteredRef.current && map) {
      map.setView(center, zoom, { animate: false });
      hasCenteredRef.current = true;
    }
  }, [center, zoom, map]);

  return null;
};

import React, { useState, useEffect } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import { ZoomSlider } from '../ZoomSlider';

interface MapZoomControllerProps {
  min: number;
  max: number;
  themeColor: string;
}

export const MapZoomController: React.FC<MapZoomControllerProps> = ({ min, max, themeColor }) => {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
    zoom: () => setZoom(map.getZoom()) // Also listen to zoom event for smoother updates
  });

  return (
    <ZoomSlider
      value={zoom}
      min={min}
      max={max}
      onChange={(val) => {
        map.setZoom(val);
      }}
      themeColor={themeColor}
    />
  );
};

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
  const [zoom, setZoom] = useState(() => {
    try {
      return map.getZoom();
    } catch (error) {
      console.warn('MapZoomController: Failed to get initial zoom:', error);
      return 16; // Default zoom level
    }
  });

  useMapEvents({
    zoomend: () => {
      try {
        setZoom(map.getZoom());
      } catch (error) {
        console.warn('MapZoomController: Failed to get zoom on zoomend:', error);
      }
    },
    zoom: () => {
      try {
        setZoom(map.getZoom());
      } catch (error) {
        console.warn('MapZoomController: Failed to get zoom on zoom:', error);
      }
    }
  });

  return (
    <ZoomSlider
      value={zoom}
      min={min}
      max={max}
      onChange={(val) => {
        try {
          map.setZoom(val);
        } catch (error) {
          console.warn('MapZoomController: Failed to set zoom:', error);
        }
      }}
      themeColor={themeColor}
    />
  );
};


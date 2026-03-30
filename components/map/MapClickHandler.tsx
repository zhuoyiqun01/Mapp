import { useMapEvents } from 'react-leaflet';
import type { LeafletMouseEvent } from 'leaflet';

interface MapClickHandlerProps {
  onClick: (e: LeafletMouseEvent) => void;
}

export const MapClickHandler = ({ onClick }: MapClickHandlerProps) => {
  useMapEvents({ click: onClick });
  return null;
};

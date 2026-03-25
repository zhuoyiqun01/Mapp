import { useMapEvents } from 'react-leaflet';

interface MapClickHandlerProps {
  onClick: (e: L.LeafletMouseEvent) => void;
}

export const MapClickHandler = ({ onClick }: MapClickHandlerProps) => {
  useMapEvents({ click: onClick });
  return null;
};

import { useMapEvents } from 'react-leaflet';

interface MapClickHandlerProps {
  onClick: () => void;
}

export const MapClickHandler = ({ onClick }: MapClickHandlerProps) => {
  useMapEvents({ click: onClick });
  return null;
};

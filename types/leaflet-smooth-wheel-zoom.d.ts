import 'leaflet';

declare module 'leaflet' {
  interface MapOptions {
    smoothWheelZoom?: boolean | string;
    smoothSensitivity?: number;
  }
}

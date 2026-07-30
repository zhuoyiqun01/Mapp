import 'leaflet';

declare module 'leaflet' {
  interface MapOptions {
    /** Unified smooth zoom (wheel + pinch). */
    smoothMapZoom?: boolean | string;
    /** @deprecated alias of smoothMapZoom */
    smoothWheelZoom?: boolean | string;
    smoothSensitivity?: number;
    touchZoomSensitivity?: number;
    smoothZoomInertia?: boolean;
    smoothZoomCenter?: boolean;
  }

  interface Map {
    smoothMapZoom?: Handler;
    smoothWheelZoom?: Handler;
    /** True while MapSmoothZoom owns the gesture (zoomanim path). */
    _mappSmoothZooming?: boolean;
    _animatingZoom?: boolean;
  }
}

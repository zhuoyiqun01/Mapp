import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import '../../utils/map/smoothMapZoom';

export type MapSmoothZoomProps = {
  /** Wheel / shared sensitivity (default 1.5). */
  sensitivity?: number;
  /** Pinch sensitivity; defaults to `sensitivity`. */
  touchSensitivity?: number;
  /** Coast with decaying velocity after fast wheel / pinch (default true). */
  inertia?: boolean;
  /** Zoom about map center instead of pointer / pinch midpoint. */
  centerMode?: boolean;
};

/**
 * Single owner for map wheel + pinch smooth zoom.
 * Uses Leaflet `zoomanim` (CSS co-transform) during the gesture, commits once on settle.
 * Disables native scrollWheelZoom / touchZoom while mounted.
 */
export function MapSmoothZoom({
  sensitivity = 1.5,
  touchSensitivity,
  inertia = true,
  centerMode = false
}: MapSmoothZoomProps) {
  const map = useMap();

  useEffect(() => {
    const pinch = touchSensitivity ?? sensitivity;
    map.options.smoothMapZoom = centerMode ? 'center' : true;
    map.options.smoothWheelZoom = centerMode ? 'center' : true;
    map.options.smoothSensitivity = sensitivity;
    map.options.touchZoomSensitivity = pinch;
    map.options.smoothZoomInertia = inertia;
    map.options.smoothZoomCenter = centerMode;

    map.scrollWheelZoom?.disable();
    map.touchZoom?.disable();
    map.smoothMapZoom?.enable();

    return () => {
      map.smoothMapZoom?.disable();
    };
  }, [map, sensitivity, touchSensitivity, inertia, centerMode]);

  return null;
}

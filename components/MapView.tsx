
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, ImageOverlay, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Note, Coordinates, Project, Frame } from '../types';
import { MAP_TILE_URL, MAP_TILE_URL_FALLBACK, MAP_SATELLITE_URL, MAP_ATTRIBUTION, THEME_COLOR, THEME_COLOR_DARK, MAP_STYLE_OPTIONS } from '../constants';
import { useMapPosition } from '@/components/hooks/useMapPosition';
import { useGeolocation } from '@/components/hooks/useGeolocation';
import { useImageImport } from '@/components/hooks/useImageImport';
import { useMapLayers } from '@/components/hooks/useMapLayers';
import { useMapStyling } from '@/components/hooks/useMapStyling';
import { MapLongPressHandler } from './map/MapLongPressHandler';
import { MapNavigationHandler } from './map/MapNavigationHandler';
import { TextLabelsLayer } from './map/TextLabelsLayer';
import { MapPositionTracker } from './map/MapPositionTracker';
import { MapCenterHandler } from './map/MapCenterHandler';
import { MapZoomController } from './map/MapZoomController';
import { MapControls } from './map/MapControls';
import { set } from 'idb-keyval';
import { SettingsPanel } from './SettingsPanel';

// Custom Horizontal Range Slider component - similar to ZoomSlider but horizontal
const CustomHorizontalSlider: React.FC<{
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  themeColor: string;
  width: number;
  formatValue: (value: number) => string;
  mapInstance: L.Map | null;
}> = ({ value, min, max, step, onChange, themeColor, width, formatValue, mapInstance }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Handle slider drag state to prevent unwanted map interactions
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mouseup', handleGlobalMouseUp);
      // Disable map dragging while slider is being dragged
      if (mapInstance) {
        mapInstance.dragging.disable();
    }
      return () => {
        document.removeEventListener('mouseup', handleGlobalMouseUp);
        // Re-enable map dragging
        if (mapInstance) {
          mapInstance.dragging.enable();
        }
      };
    }
  }, [isDragging, mapInstance]);

  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    updateValueFromPointer(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    e.stopPropagation();
    updateValueFromPointer(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    }
  };

  const updateValueFromPointer = (clientX: number) => {
    if (!trackRef.current) return;

    const rect = trackRef.current.getBoundingClientRect();
        const relativeX = clientX - rect.left;
    let percent = relativeX / rect.width;
    percent = Math.max(0, Math.min(1, percent));

    const rawValue = min + (percent * (max - min));
    const steppedValue = Math.round(rawValue / step) * step;
    onChange(Math.max(min, Math.min(max, steppedValue)));
  };

  return (
    <div className="flex items-center gap-2 custom-horizontal-slider">
      <div
        ref={trackRef}
        className="relative h-1 flex cursor-pointer select-none touch-none"
        style={{ width: `${width}px` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Track Line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gray-200 rounded-full pointer-events-none" />

        {/* Filled Track */}
        <div
          className="absolute top-0 left-0 h-1 rounded-full pointer-events-none transition-all duration-75"
          style={{
            backgroundColor: themeColor,
            width: `${percentage}%`
          }}
        />

        {/* Circular Thumb */}
        <div
          className="absolute top-1/2 w-4 h-4 bg-white border-2 rounded-full shadow-md pointer-events-none transition-all duration-75 -translate-y-1/2"
          style={{
            borderColor: themeColor,
            left: `calc(${percentage}% - 8px)`
          }}
        />
      </div>
      <span className="text-xs text-gray-500 whitespace-nowrap min-w-[2rem]">
        {formatValue(value)}
      </span>
    </div>
  );
};
import { Search, Locate, Loader2, X, Check, Satellite, Plus, Image as ImageIcon, FileJson, Type, Layers, Settings } from 'lucide-react';
import exifr from 'exifr';
import { NoteEditor } from './NoteEditor';
import { generateId, fileToBase64 } from '../utils';
import { loadImage } from '../utils/storage';
import { ZoomSlider } from './ZoomSlider';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface MapViewProps {
  project: Project;
  onAddNote: (note: Note) => void;
  onUpdateNote: (note: Note) => void;
  onDeleteNote?: (noteId: string) => void;
  onToggleEditor: (isOpen: boolean) => void;
  onImportDialogChange?: (isOpen: boolean) => void;
  onUpdateProject?: (project: Project) => void;
  navigateToCoords?: { lat: number; lng: number; zoom?: number } | null;
  projectId?: string;
  onNavigateComplete?: () => void;
  onSwitchToBoardView?: (coords?: { x: number; y: number }, mapInstance?: L.Map) => void;
  themeColor?: string;
  mapStyleId?: string;
  onMapStyleChange?: (styleId: string) => void;
  showImportMenu?: boolean;
  setShowImportMenu?: (show: boolean) => void;
          }
          
// MapLongPressHandler moved to components/map/MapLongPressHandler.tsx



// Component to block map container from receiving pointer events in capture phase
const SearchBarContainer = ({ children }: { children: React.ReactNode }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleCaptureStart = (e: Event) => {
            // Stop event from reaching map container in capture phase
            e.stopPropagation();
        };

        // Use capture phase to intercept events before they reach map container
        // Mark as passive since we only call stopPropagation(), not preventDefault()
        container.addEventListener('mousedown', handleCaptureStart, { capture: true, passive: true });
        container.addEventListener('touchstart', handleCaptureStart, { capture: true, passive: true });
        container.addEventListener('pointerdown', handleCaptureStart, { capture: true, passive: true });

        return () => {
            container.removeEventListener('mousedown', handleCaptureStart, { capture: true });
            container.removeEventListener('touchstart', handleCaptureStart, { capture: true });
            container.removeEventListener('pointerdown', handleCaptureStart, { capture: true });
        };
    }, []);
    
    return <div ref={containerRef}>{children}</div>;
};


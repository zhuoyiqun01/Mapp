import React, { useState, useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { Note, Frame } from '../types';
import { THEME_COLOR } from '../../constants';
import { Search, Locate, Loader2, X, Check, Satellite, Type, Settings, MapPin, Camera } from 'lucide-react';

interface MapControlsProps {
  onLocateCurrentPosition: () => void;
  onImportFromCamera?: () => void;
  mapStyle: 'standard' | 'satellite';
  onMapStyleChange: (style: 'standard' | 'satellite') => void;
  mapNotes: Note[];
  themeColor?: string;
  showTextLabels: boolean;
  setShowTextLabels: (show: boolean) => void;
  pinSize: number;
  setPinSize: (size: number) => void;
  clusterThreshold: number;
  setClusterThreshold: (threshold: number) => void;
  onOpenSettings: () => void;
}

export const MapControls: React.FC<MapControlsProps> = ({
  onLocateCurrentPosition,
  onImportFromCamera,
  mapStyle,
  onMapStyleChange,
  mapNotes,
  themeColor = THEME_COLOR,
  showTextLabels,
  setShowTextLabels,
  pinSize,
  setPinSize,
  clusterThreshold,
  setClusterThreshold,
  onOpenSettings
}) => {
  // Debug: Check if onImportFromCamera is passed
  console.log('MapControls: onImportFromCamera exists:', !!onImportFromCamera);
  const map = useMap();
  const [showLocateMenu, setShowLocateMenu] = useState(false);
  const locateMenuRef = useRef<HTMLDivElement>(null);

  const locateToLatestPin = () => {
    if (mapNotes.length > 0) {
      const latestNote = mapNotes[mapNotes.length - 1];
      map.flyTo([latestNote.coords.lat, latestNote.coords.lng], 16);
    }
  };

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (locateMenuRef.current && !locateMenuRef.current.contains(event.target as Node)) {
        setShowLocateMenu(false);
      }
    };
    if (showLocateMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showLocateMenu]);

  const controlsRef = useRef<HTMLDivElement>(null);

  // Block map container from receiving pointer down events when pointer is in UI area
  useEffect(() => {
    const container = controlsRef.current;
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

  return (
    <div
      ref={controlsRef}
      className="flex flex-row gap-1.5 sm:gap-2 pointer-events-auto"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onPointerCancel={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {/* First Row: Main Controls */}
      <div className="relative" ref={locateMenuRef}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowLocateMenu(!showLocateMenu);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          className={`group p-2 sm:p-3 rounded-xl shadow-lg transition-colors w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center ${
            showLocateMenu
              ? 'text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50'
          }`}
          style={showLocateMenu ? { backgroundColor: themeColor } : undefined}
          title="Locate"
        >
          <Locate size={18} className="sm:w-5 sm:h-5" />
        </button>
        {showLocateMenu && (
          <div
            className="absolute left-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-[2000]"
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onPointerMove={(e) => {
              e.stopPropagation();
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
            onMouseMove={(e) => {
              e.stopPropagation();
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onLocateCurrentPosition();
                setShowLocateMenu(false);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerMove={(e) => e.stopPropagation()}
              className="group w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3 text-sm transition-colors"
            >
              <Locate size={16} className="text-gray-400 group-hover:text-blue-500 transition-colors" />
              <span>My Location</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                locateToLatestPin();
                setShowLocateMenu(false);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerMove={(e) => e.stopPropagation()}
              className="group w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3 text-sm transition-colors"
            >
              <MapPin size={16} className="text-gray-400 group-hover:text-red-500 transition-colors" />
              <span>Latest Note</span>
            </button>
            {onImportFromCamera && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onImportFromCamera();
                  setShowLocateMenu(false);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerMove={(e) => e.stopPropagation()}
                className="group w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3 text-sm transition-colors"
              >
                <Camera size={16} className="text-gray-400 group-hover:text-green-500 transition-colors" />
                <span>Import from Camera</span>
              </button>
            )}
          </div>
        )}
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onMapStyleChange(mapStyle === 'standard' ? 'satellite' : 'standard');
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        className={`p-2 sm:p-3 rounded-xl shadow-lg transition-colors w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center ${
          mapStyle === 'satellite'
            ? 'text-white'
            : 'bg-white text-gray-700 hover:bg-gray-50'
        }`}
        style={mapStyle === 'satellite' ? { backgroundColor: themeColor } : undefined}
        title={mapStyle === 'standard' ? 'Switch to Satellite' : 'Switch to Standard'}
      >
        <Satellite size={18} className="sm:w-5 sm:h-5" />
      </button>


      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowTextLabels(!showTextLabels);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        className={`p-2 sm:p-3 rounded-xl shadow-lg transition-colors w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center ${
          showTextLabels
            ? 'text-white'
            : 'bg-white text-gray-700 hover:bg-gray-50'
        }`}
        style={showTextLabels ? { backgroundColor: themeColor } : undefined}
        title={showTextLabels ? 'Hide Labels' : 'Show Labels'}
      >
        <Type size={18} className="sm:w-5 sm:h-5" />
      </button>


      <button
        onClick={(e) => {
          e.stopPropagation();
          onOpenSettings();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#F3F4F6'; // gray-100
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '';
        }}
        className="bg-white p-2 sm:p-3 rounded-xl shadow-lg text-gray-700 hover:bg-gray-50 transition-colors w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center"
        title="Settings"
      >
        <Settings size={18} className="sm:w-5 sm:h-5" />
      </button>
    </div>
  );
};



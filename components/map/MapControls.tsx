import React, { useState, useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { Note } from '../../types';
import { THEME_COLOR } from '../../constants';
import { Locate, Loader2, Type, Settings, MapPin } from 'lucide-react';
import { ChromeIconButton } from '../ui/ChromeIconButton';

interface MapControlsProps {
  onLocateCurrentPosition: () => void;
  isLocating?: boolean;
  mapNotes: Note[];
  themeColor?: string;
  /** 非主题色浮层面板：半透明白底 + backdrop-filter */
  chromeSurfaceStyle?: React.CSSProperties;
  chromeHoverBackground?: string;
  showTextLabels: boolean;
  setShowTextLabels: (show: boolean) => void;
  onOpenSettings: () => void;
}

export const MapControls: React.FC<MapControlsProps> = ({
  onLocateCurrentPosition,
  isLocating = false,
  mapNotes,
  themeColor = THEME_COLOR,
  chromeSurfaceStyle,
  chromeHoverBackground,
  showTextLabels,
  setShowTextLabels,
  onOpenSettings
}) => {
  const neutralStyle = chromeSurfaceStyle;
  const neutralHover = chromeHoverBackground;
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
      className="flex flex-row items-center gap-1.5 sm:gap-2 pointer-events-auto"
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
        <ChromeIconButton
          className="group"
          themeColor={themeColor}
          chromeSurfaceStyle={neutralStyle}
          chromeHoverBackground={neutralHover}
          active={showLocateMenu}
          onClick={() => setShowLocateMenu(!showLocateMenu)}
          onPointerMove={(e) => e.stopPropagation()}
          title="定位"
        >
          <Locate size={18} className="sm:w-5 sm:h-5" />
        </ChromeIconButton>
        {showLocateMenu && (
          <div
            className={`absolute left-0 top-full mt-2 w-48 rounded-xl shadow-xl border border-gray-100 py-1 z-[2000] ${neutralStyle ? '' : 'bg-white'}`}
            style={neutralStyle}
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
              disabled={isLocating}
              className="group w-full text-left px-4 py-3 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 text-sm transition-colors"
            >
              {isLocating ? (
                <Loader2 size={16} className="text-blue-500 animate-spin" />
              ) : (
                <Locate size={16} className="text-gray-400 group-hover:text-blue-500 transition-colors" />
              )}
              <span>{isLocating ? 'Locating...' : 'My Location'}</span>
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
          </div>
        )}
      </div>

      <ChromeIconButton
        themeColor={themeColor}
        chromeSurfaceStyle={neutralStyle}
        chromeHoverBackground={neutralHover}
        active={showTextLabels}
        onClick={() => setShowTextLabels(!showTextLabels)}
        onPointerMove={(e) => e.stopPropagation()}
        title={showTextLabels ? '隐藏 label' : 'label'}
      >
        <Type size={18} className="sm:w-5 sm:h-5" />
      </ChromeIconButton>

      <ChromeIconButton
        themeColor={themeColor}
        chromeSurfaceStyle={neutralStyle}
        chromeHoverBackground={neutralHover}
        nonChromeIdleHover="imperative-gray100"
        onClick={() => onOpenSettings()}
        onPointerMove={(e) => e.stopPropagation()}
        title="设置"
      >
        <Settings size={18} className="sm:w-5 sm:h-5" />
      </ChromeIconButton>
    </div>
  );
};



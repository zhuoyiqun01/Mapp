import React, { useState, useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { Note, Frame } from '../types';
import { THEME_COLOR } from '../constants';
import { Search, Locate, Loader2, X, Check, Satellite, Plus, Image as ImageIcon, FileJson, Type, Layers, Settings } from 'lucide-react';

interface MapControlsProps {
  onImportPhotos: () => void;
  onImportData: () => void;
  onLocateCurrentPosition: () => void;
  mapStyle: 'standard' | 'satellite';
  onMapStyleChange: (style: 'standard' | 'satellite') => void;
  mapNotes: Note[];
  frames: Frame[];
  frameLayerVisibility: Record<string, boolean>;
  setFrameLayerVisibility: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  themeColor?: string;
  showTextLabels: boolean;
  setShowTextLabels: (show: boolean) => void;
  pinSize: number;
  setPinSize: (size: number) => void;
  clusterThreshold: number;
  setClusterThreshold: (threshold: number) => void;
  onOpenSettings: () => void;
  showImportMenu?: boolean;
  setShowImportMenu?: (show: boolean) => void;
}

export const MapControls: React.FC<MapControlsProps> = ({
  onImportPhotos,
  onImportData,
  onLocateCurrentPosition,
  mapStyle,
  onMapStyleChange,
  mapNotes,
  frames,
  frameLayerVisibility,
  setFrameLayerVisibility,
  themeColor = THEME_COLOR,
  showTextLabels,
  setShowTextLabels,
  pinSize,
  setPinSize,
  clusterThreshold,
  setClusterThreshold,
  onOpenSettings,
  showImportMenu,
  setShowImportMenu
}) => {
  const map = useMap();
  const [internalShowImportMenu, setInternalShowImportMenu] = useState(false);
  const [showLocateMenu, setShowLocateMenu] = useState(false);

  // Use external state if provided, otherwise use internal state
  const currentShowImportMenu = showImportMenu !== undefined ? showImportMenu : internalShowImportMenu;
  const currentSetShowImportMenu = setShowImportMenu || setInternalShowImportMenu;
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
          onPointerDown={(e) => {
            e.stopPropagation();
            e.currentTarget.style.backgroundColor = themeColor;
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            if (!showLocateMenu) {
              e.currentTarget.style.backgroundColor = '';
            }
          }}
          onPointerMove={(e) => e.stopPropagation()}
          onMouseEnter={(e) => {
            if (!showLocateMenu) {
              e.currentTarget.style.backgroundColor = '#F3F4F6'; // gray-100
            }
          }}
          onMouseLeave={(e) => {
            if (!showLocateMenu) {
              e.currentTarget.style.backgroundColor = '';
            }
          }}
          className={`p-2 sm:p-3 rounded-xl shadow-lg text-gray-700 transition-colors w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center`}
          style={showLocateMenu ? { backgroundColor: themeColor, color: 'white' } : undefined}
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
              className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3 text-sm transition-colors"
            >
              <Locate size={16} className="text-blue-500" />
              <span>我的位置</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                locateToLatestPin();
                setShowLocateMenu(false);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerMove={(e) => e.stopPropagation()}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3 text-sm transition-colors"
            >
              <div className="w-4 h-4 rounded-full bg-red-500"></div>
              <span>最新笔记</span>
            </button>
          </div>
        )}
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onMapStyleChange(mapStyle === 'standard' ? 'satellite' : 'standard');
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.style.backgroundColor = themeColor;
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          if (mapStyle === 'standard') {
            e.currentTarget.style.backgroundColor = '';
          }
        }}
        onPointerMove={(e) => e.stopPropagation()}
        onMouseEnter={(e) => {
          if (mapStyle === 'standard') {
            e.currentTarget.style.backgroundColor = '#F3F4F6'; // gray-100
          }
        }}
        onMouseLeave={(e) => {
          if (mapStyle === 'standard') {
            e.currentTarget.style.backgroundColor = '';
          }
        }}
        className={`p-2 sm:p-3 rounded-xl shadow-lg transition-colors w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center ${
          mapStyle === 'satellite'
            ? 'text-white'
            : 'bg-white text-gray-700'
        }`}
        style={mapStyle === 'satellite' ? { backgroundColor: themeColor } : undefined}
        title={mapStyle === 'standard' ? 'Switch to Satellite' : 'Switch to Standard'}
      >
        <Satellite size={18} className="sm:w-5 sm:h-5" />
      </button>

      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation();
            currentSetShowImportMenu(!currentShowImportMenu);
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.currentTarget.style.backgroundColor = themeColor;
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            if (!currentShowImportMenu) {
              e.currentTarget.style.backgroundColor = '';
            }
          }}
          onPointerMove={(e) => e.stopPropagation()}
          onMouseEnter={(e) => {
            if (!currentShowImportMenu) {
              e.currentTarget.style.backgroundColor = '#F3F4F6'; // gray-100
            }
          }}
          onMouseLeave={(e) => {
            if (!currentShowImportMenu) {
              e.currentTarget.style.backgroundColor = '';
            }
          }}
          className={`p-2 sm:p-3 rounded-xl shadow-lg transition-colors w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center`}
          style={currentShowImportMenu ? { backgroundColor: themeColor, color: 'white' } : undefined}
          title="Import"
        >
          <Plus size={18} className="sm:w-5 sm:h-5" />
        </button>
        {currentShowImportMenu && (
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
                onImportPhotos();
                currentSetShowImportMenu(false);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerMove={(e) => e.stopPropagation()}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3 text-sm transition-colors"
            >
              <ImageIcon size={16} className="text-green-500" />
              <span>导入图片</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onImportData();
                currentSetShowImportMenu(false);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerMove={(e) => e.stopPropagation()}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3 text-sm transition-colors"
            >
              <FileJson size={16} className="text-blue-500" />
              <span>导入数据</span>
            </button>
          </div>
        )}
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowTextLabels(!showTextLabels);
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.style.backgroundColor = themeColor;
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          if (!showTextLabels) {
            e.currentTarget.style.backgroundColor = '';
          }
        }}
        onPointerMove={(e) => e.stopPropagation()}
        onMouseEnter={(e) => {
          if (!showTextLabels) {
            e.currentTarget.style.backgroundColor = '#F3F4F6'; // gray-100
          }
        }}
        onMouseLeave={(e) => {
          if (!showTextLabels) {
            e.currentTarget.style.backgroundColor = '';
          }
        }}
        className={`p-2 sm:p-3 rounded-xl shadow-lg transition-colors w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center ${
          showTextLabels
            ? 'text-white'
            : 'bg-white text-gray-700'
        }`}
        style={showTextLabels ? { backgroundColor: themeColor } : undefined}
        title={showTextLabels ? 'Hide Labels' : 'Show Labels'}
      >
        <Type size={18} className="sm:w-5 sm:h-5" />
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          // TODO: Implement layer panel toggle
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
        title="Layers"
      >
        <Layers size={18} className="sm:w-5 sm:h-5" />
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


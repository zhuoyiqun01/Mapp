
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, ImageOverlay, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Note, Coordinates, Project } from '../types';
import { MAP_TILE_URL, MAP_TILE_URL_FALLBACK, MAP_SATELLITE_URL, MAP_ATTRIBUTION, THEME_COLOR, THEME_COLOR_DARK, MAP_STYLE_OPTIONS } from '../constants';
import { useMapPosition } from '@/components/hooks/useMapPosition';
import { useGeolocation } from '@/components/hooks/useGeolocation';
import { useImageImport } from '@/components/hooks/useImageImport';
import { MapLongPressHandler } from './map/MapLongPressHandler';
import { MapNavigationHandler } from './map/MapNavigationHandler';
import { TextLabelsLayer } from './map/TextLabelsLayer';
import { MapPositionTracker } from './map/MapPositionTracker';
import { MapCenterHandler } from './map/MapCenterHandler';
import { MapZoomController } from './map/MapZoomController';
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

const MapControls = ({ onImportPhotos, onImportData, mapStyle, onMapStyleChange, mapNotes, frames, frameLayerVisibility, setFrameLayerVisibility, themeColor = THEME_COLOR, showTextLabels, setShowTextLabels, pinSize, setPinSize, clusterThreshold, setClusterThreshold, onOpenSettings, showImportMenu, setShowImportMenu }: {
    onImportPhotos: () => void;
    onImportData: () => void;
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
}) => {
    const map = useMap();
    const [internalShowImportMenu, setInternalShowImportMenu] = useState(false);
    const [showLocateMenu, setShowLocateMenu] = useState(false);

    // Use external state if provided, otherwise use internal state
    const currentShowImportMenu = showImportMenu !== undefined ? showImportMenu : internalShowImportMenu;
    const currentSetShowImportMenu = setShowImportMenu || setInternalShowImportMenu;
    const [showLocationError, setShowLocationError] = useState(false);
    const locateMenuRef = useRef<HTMLDivElement>(null);
    
    const requestLocationPermission = (): Promise<GeolocationPosition> => {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation is not supported by this browser'));
                return;
            }
            
            navigator.geolocation.getCurrentPosition(
                (position) => resolve(position),
                (error) => reject(error),
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        });
    };
    
    
    
    const [locationErrorMessage, setLocationErrorMessage] = useState<string>('');
    
    
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
                    className="bg-white p-2 sm:p-3 rounded-xl shadow-lg text-gray-700 transition-colors w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center"
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
                        onMouseUp={(e) => {
                            e.stopPropagation();
                        }}
                        onTouchStart={(e) => {
                            e.stopPropagation();
                        }}
                        onTouchMove={(e) => {
                            e.stopPropagation();
                        }}
                        onTouchEnd={(e) => {
                            e.stopPropagation();
                        }}
                    >
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                requestLocation();
                                setShowLocateMenu(false);
                            }}
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
                            onMouseUp={(e) => {
                                e.stopPropagation();
                            }}
                            onTouchStart={(e) => {
                                e.stopPropagation();
                            }}
                            onTouchMove={(e) => {
                                e.stopPropagation();
                            }}
                            onTouchEnd={(e) => {
                                e.stopPropagation();
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 text-gray-700 whitespace-nowrap"
                        >
                            Locate to my Position
                        </button>
                        <div className="h-px bg-gray-100 my-1" />
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                locateToLatestPin();
                                setShowLocateMenu(false);
                            }}
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
                            onMouseUp={(e) => {
                                e.stopPropagation();
                            }}
                            onTouchStart={(e) => {
                                e.stopPropagation();
                            }}
                            onTouchMove={(e) => {
                                e.stopPropagation();
                            }}
                            onTouchEnd={(e) => {
                                e.stopPropagation();
                            }}
                            disabled={mapNotes.length === 0}
                            className={`w-full text-left px-4 py-2.5 text-sm ${
                                mapNotes.length === 0 
                                    ? 'text-gray-400 cursor-not-allowed' 
                                    : 'text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                            Locate to Latest Pin
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
                    // Note: showTextLabels will be updated after this event, so we check the current value
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
                title={showTextLabels ? 'Hide Text Labels' : 'Show Text Labels'}
            >
                <Type size={18} className="sm:w-5 sm:h-5" />
                </button>

                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                    onOpenSettings();
                            }}
                            onPointerDown={(e) => {
                                e.stopPropagation();
                    e.currentTarget.style.backgroundColor = themeColor;
                            }}
                            onPointerUp={(e) => {
                                e.stopPropagation();
                    e.currentTarget.style.backgroundColor = '';
                            }}
                onPointerMove={(e) => e.stopPropagation()}
                onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#F3F4F6'; // gray-100
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '';
                            }}
                className="bg-white p-2 sm:p-3 rounded-xl shadow-lg text-gray-700 transition-colors w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center"
                title="Settings"
                        >
                <Settings size={18} className="sm:w-5 sm:h-5" />
                        </button>
            
            {/* Location Error Dialog */}
            {showLocationError && (
                <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black bg-opacity-50">
                    <div className="bg-white rounded-xl shadow-xl p-6 max-w-md mx-4 max-h-[80vh] overflow-y-auto">
                        <h3 className="text-lg font-semibold text-gray-900 mb-3">Location Failed</h3>
                        <div className="text-sm text-gray-600 mb-4 whitespace-pre-line leading-relaxed">
                            {locationErrorMessage || 'Unable to get your current location.'}
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowLocationError(false);
                                    setLocationErrorMessage('');
                                }}
                                onPointerDown={(e) => e.stopPropagation()}
                                onPointerMove={(e) => e.stopPropagation()}
                                onPointerUp={(e) => e.stopPropagation()}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                                OK
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}



// Component to track map position changes and notify parent


export const MapView: React.FC<MapViewProps> = ({ project, onAddNote, onUpdateNote, onDeleteNote, onToggleEditor, onImportDialogChange, onUpdateProject, fileInputRef: externalFileInputRef, navigateToCoords, projectId, onNavigateComplete, onSwitchToBoardView, themeColor = THEME_COLOR, mapStyleId = 'carto-light-nolabels', onMapStyleChange, showImportMenu, setShowImportMenu }) => {
  if (!project) {
    return null;
  }
  const notes = project.notes;
  const [editingNote, setEditingNote] = useState<Partial<Note> | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  // Helper function to convert hex color to RGB
  const hexToRgb = (hex: string): string => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
      const r = parseInt(result[1], 16);
      const g = parseInt(result[2], 16);
      const b = parseInt(result[3], 16);
      return `${r}, ${g}, ${b}`;
    }
    return '255, 255, 255'; // fallback to white
  };



  // Check if photo was taken recently (within last 30 minutes)
  const isPhotoTakenRecently = (exifData: any): boolean => {
    if (!exifData) return false;

    // Try different date fields that might contain photo creation time
    const dateFields = ['DateTimeOriginal', 'DateTime', 'CreateDate', 'ModifyDate'];
    let photoDate: Date | null = null;

    for (const field of dateFields) {
      if (exifData[field]) {
        try {
          // EXIF dates are usually in "YYYY:MM:DD HH:MM:SS" format
          const dateStr = exifData[field].toString();
          if (dateStr.includes(':')) {
            // Convert EXIF format to ISO format
            const isoDate = dateStr.replace(/^(\d{4}):(\d{2}):(\d{2}) /, '$1-$2-$3 ');
            photoDate = new Date(isoDate);
          } else {
            photoDate = new Date(dateStr);
          }

          if (!isNaN(photoDate.getTime())) {
            break;
          }
        } catch (e) {
          continue;
        }
      }
    }

    if (!photoDate || isNaN(photoDate.getTime())) {
      // If no valid date found, assume it's recent if file is recent
      return true; // Conservative approach - assume recent if we can't determine
    }

    const now = Date.now();
    const photoTime = photoDate.getTime();
    const thirtyMinutesInMs = 30 * 60 * 1000;

    return (now - photoTime) <= thirtyMinutesInMs;
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const mapInitRef = useRef<WeakSet<L.Map>>(new WeakSet());
  
  const [imageDimensions, setImageDimensions] = useState<[number, number] | null>(null);
  const [minImageZoom, setMinImageZoom] = useState(-20);
  
  // Marker clustering related state
  const [clusteredMarkers, setClusteredMarkers] = useState<Array<{ notes: Note[], position: [number, number] }>>([]);
  const [currentNoteIndex, setCurrentNoteIndex] = useState(0);
  const [currentClusterNotes, setCurrentClusterNotes] = useState<Note[]>([]);

  // Frame layer visibility state
  const [frameLayerVisibility, setFrameLayerVisibility] = useState<Record<string, boolean>>({});
  const [showAllFrames, setShowAllFrames] = useState(true); // Default to show all
  const [showFrameLayerPanel, setShowFrameLayerPanel] = useState(false);
  const frameLayerRef = useRef<HTMLDivElement>(null);

  // Initialize frame layer visibility when project frames change
  useEffect(() => {
    if (project.frames) {
      const newVisibility: Record<string, boolean> = {};
      project.frames.forEach(frame => {
        if (!(frame.id in frameLayerVisibility)) {
          newVisibility[frame.id] = true; // Default to visible
        }
      });
      if (Object.keys(newVisibility).length > 0) {
        setFrameLayerVisibility(prev => ({ ...prev, ...newVisibility }));
      }
    }
  }, [project.frames, frameLayerVisibility]);

  // Close frame layer panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (frameLayerRef.current && !frameLayerRef.current.contains(event.target as Node)) {
        setShowFrameLayerPanel(false);
      }
    };

    if (showFrameLayerPanel) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showFrameLayerPanel]);

  // Filter notes based on frame layer visibility
  const getFilteredNotes = useMemo(() => {
    if (!project.frames || project.frames.length === 0) {
      return notes; // No frames, show all notes
    }

    // If show all is enabled, show all notes
    if (showAllFrames) {
      return notes;
    }

    return notes.filter(note => {
      // If note has no frame associations, hide it when Show All is disabled
      if (!note.groupIds || note.groupIds.length === 0) {
        return false; // Hide notes without frame associations when filtering is active
      }

      // Show note if any of its associated frames are visible (OR logic)
      return note.groupIds.some(frameId => frameLayerVisibility[frameId] !== false);
    });
  }, [notes, project.frames, frameLayerVisibility, showAllFrames]);
  
  
  // Image fingerprint: GPS coordinates + 3 sampled pixels (top-left, bottom-left, bottom-right)
  // Format: lat_lng_topLeftPixel_bottomLeftPixel_bottomRightPixel
  const calculateImageFingerprint = async (file: File, imageUrl: string, lat: number | null, lng: number | null): Promise<string> => {
    try {
      // Load image
      const img = new Image();
      img.src = imageUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      
      // Sample 3 pixels: top-left, bottom-left, bottom-right
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        // Fallback: return GPS only if available
        return lat !== null && lng !== null ? `${lat.toFixed(6)}_${lng.toFixed(6)}` : 'no_gps';
      }
      
      // Draw image
      ctx.drawImage(img, 0, 0, width, height);
      
      // Sample top-left pixel (0, 0)
      const topLeftData = ctx.getImageData(0, 0, 1, 1).data;
      const topLeft = topLeftData.length >= 3 
        ? `${topLeftData[0]},${topLeftData[1]},${topLeftData[2]}` 
        : '0,0,0';
      
      // Sample bottom-left pixel (0, height-1)
      const bottomLeftData = ctx.getImageData(0, height - 1, 1, 1).data;
      const bottomLeft = bottomLeftData.length >= 3 
        ? `${bottomLeftData[0]},${bottomLeftData[1]},${bottomLeftData[2]}` 
        : '0,0,0';
      
      // Sample bottom-right pixel (width-1, height-1)
      const bottomRightData = ctx.getImageData(width - 1, height - 1, 1, 1).data;
      const bottomRight = bottomRightData.length >= 3 
        ? `${bottomRightData[0]},${bottomRightData[1]},${bottomRightData[2]}` 
        : '0,0,0';
      
      // Create fingerprint: lat_lng_topLeft_bottomLeft_bottomRight
      const gpsPart = lat !== null && lng !== null 
        ? `${lat.toFixed(6)}_${lng.toFixed(6)}` 
        : 'no_gps';
      return `${gpsPart}_${topLeft}_${bottomLeft}_${bottomRight}`;
    } catch (error) {
      console.error('Error calculating image fingerprint:', error);
      return lat !== null && lng !== null ? `${lat.toFixed(6)}_${lng.toFixed(6)}` : 'unknown';
    }
  };
  
  // Fingerprint from base64 image (extract GPS from note if available)
  const calculateFingerprintFromBase64 = async (base64Image: string, note?: Note): Promise<string> => {
    try {
      // Extract GPS from note if available
      const lat = note?.coords?.lat ?? null;
      const lng = note?.coords?.lng ?? null;
      
      const img = new Image();
      img.src = base64Image;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      
      // Sample 3 pixels: top-left, bottom-left, bottom-right
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        // Fallback: return GPS only if available
        return lat !== null && lng !== null ? `${lat.toFixed(6)}_${lng.toFixed(6)}` : 'no_gps';
      }
      
      // Draw image
      ctx.drawImage(img, 0, 0, width, height);
      
      // Sample top-left pixel (0, 0)
      const topLeftData = ctx.getImageData(0, 0, 1, 1).data;
      const topLeft = topLeftData.length >= 3 
        ? `${topLeftData[0]},${topLeftData[1]},${topLeftData[2]}` 
        : '0,0,0';
      
      // Sample bottom-left pixel (0, height-1)
      const bottomLeftData = ctx.getImageData(0, height - 1, 1, 1).data;
      const bottomLeft = bottomLeftData.length >= 3 
        ? `${bottomLeftData[0]},${bottomLeftData[1]},${bottomLeftData[2]}` 
        : '0,0,0';
      
      // Sample bottom-right pixel (width-1, height-1)
      const bottomRightData = ctx.getImageData(width - 1, height - 1, 1, 1).data;
      const bottomRight = bottomRightData.length >= 3 
        ? `${bottomRightData[0]},${bottomRightData[1]},${bottomRightData[2]}` 
        : '0,0,0';
      
      // Create fingerprint: lat_lng_topLeft_bottomLeft_bottomRight
      const gpsPart = lat !== null && lng !== null 
        ? `${lat.toFixed(6)}_${lng.toFixed(6)}` 
        : 'no_gps';
      return `${gpsPart}_${topLeft}_${bottomLeft}_${bottomRight}`;
    } catch (error) {
      console.error('Error calculating fingerprint from base64:', error);
      const lat = note?.coords?.lat ?? null;
      const lng = note?.coords?.lng ?? null;
      return lat !== null && lng !== null ? `${lat.toFixed(6)}_${lng.toFixed(6)}` : 'unknown';
    }
  };

  // 读取已有图片（可能是存储的图片 ID），用于指纹对比
  const getImageDataForFingerprint = async (imageRef: string): Promise<string | null> => {
    if (!imageRef) return null;
    // 如果是存储的图片 ID，先从 IndexedDB 取出 Base64
    if (imageRef.startsWith('img-')) {
      try {
        const loaded = await loadImage(imageRef);
        if (loaded) return loaded;
      } catch (err) {
        console.warn('Failed to load stored image for fingerprint:', err);
        return null;
      }
    }
    // 已经是 Base64 数据
    return imageRef;
  };
  
  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  
  // Map style state - satellite toggle is independent from mapStyleId
  // mapStyleId is for base map style (from settings), localMapStyle is for satellite toggle
  const [localMapStyle, setLocalMapStyle] = useState<'standard' | 'satellite'>('standard');
  // If satellite is active, use satellite; otherwise use mapStyleId or default
  const effectiveMapStyle = localMapStyle === 'satellite' ? 'satellite' : (mapStyleId || 'carto-light-nolabels');
  const mapStyle = localMapStyle; // For the toggle button

  // Text labels display mode
  const [showTextLabels, setShowTextLabels] = useState(false);

    // Pin size control
    const [pinSize, setPinSize] = useState(1.0); // Scale factor for pin size

    // Cluster threshold control
    const [clusterThreshold, setClusterThreshold] = useState(40); // Distance threshold for clustering

  // Settings panel
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);


  // Current marker index being viewed

  const defaultCenter: [number, number] = [28.1847, 112.9467];
  const isMapMode = project.type === 'map';
  const mapNotes = useMemo(() => 
    notes.filter(n => 
      n.variant === 'standard' && 
      n.coords && 
      typeof n.coords.lat === 'number' && 
      typeof n.coords.lng === 'number' &&
      !isNaN(n.coords.lat) && 
      !isNaN(n.coords.lng)
    ),
    [notes]
  );

  // Geolocation management hook
  const {
    currentLocation,
    deviceHeading,
    hasLocationPermission,
    locationError,
    requestLocation,
    getCurrentBrowserLocation,
    checkLocationPermission
  } = useGeolocation(isMapMode);

  // Map position management hook
  const { initialMapPosition, handleMapPositionChange } = useMapPosition({
    isMapMode,
    projectId,
    navigateToCoords,
    mapNotes,
    currentLocation,
    defaultCenter
  });

  // Image import management hook
  const {
    importPreview,
    showImportDialog,
    fileInputRef,
    dataImportInputRef,
    handleImageImport,
    handleConfirmImport,
    handleCancelImport
  } = useImageImport({
    project,
    notes,
    onAddNote,
    onUpdateProject,
    onImportDialogChange,
    mapInstance
  });


  // Load Image Dimensions and persistence
  useEffect(() => {
    if (project.type === 'image' && project.backgroundImage) {
        // Reset only if ID changes to prevent flicker
        const img = new Image();
        img.src = project.backgroundImage;
        img.onload = () => {
            setImageDimensions([img.naturalHeight, img.naturalWidth]);
        };
    } else {
        setImageDimensions(null);
    }
  }, [project.id, project.type, project.backgroundImage]);


  // Calculate dynamic min zoom for image
  useEffect(() => {
    if (project.type === 'image' && mapInstance && imageDimensions) {
        const bounds = L.latLngBounds([0,0], imageDimensions);
        // "inside=true" means fit the bounds inside the view
        const fitZoom = mapInstance.getBoundsZoom(bounds, true);
        
        setMinImageZoom(fitZoom);
        mapInstance.setMinZoom(fitZoom);
        
        // Initially fit bounds if first load or logic dictates
        mapInstance.fitBounds(bounds);
    }
  }, [mapInstance, imageDimensions, project.type]);

  const imageBounds: L.LatLngBoundsExpression = imageDimensions 
      ? [[0, 0], imageDimensions] 
      : [[0, 0], [1000, 1000]];

  const handleLongPress = (coords: Coordinates) => {
    // Calculate boardX and boardY for board view placement
    // Use same logic as BoardView's createNoteAtCenter to avoid overlap
    const noteWidth = 256; // standard note width
    const noteHeight = 256;
    const spacing = 50;
    const aspectRatioThreshold = 2.5; // If width/height > 2.5, start a new row
    
    let boardX = 100; // Default position
    let boardY = 100;
    
    // Calculate position to the right of existing notes, or start new row if too wide
    const boardNotes = notes.filter(n => n.boardX !== undefined && n.boardY !== undefined);
    if (boardNotes.length > 0) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      
      boardNotes.forEach(note => {
        const existingNoteWidth = (note.variant === 'compact') ? 180 : 256;
        const existingNoteHeight = (note.variant === 'compact') ? 180 : 256;
        const noteLeft = note.boardX;
        const noteRight = noteLeft + existingNoteWidth;
        const noteTop = note.boardY;
        const noteBottom = noteTop + existingNoteHeight;
        
        if (noteLeft < minX) minX = noteLeft;
        if (noteTop < minY) minY = noteTop;
        if (noteRight > maxX) maxX = noteRight;
        if (noteBottom > maxY) maxY = noteBottom;
      });
      
      if (maxX !== -Infinity && minY !== Infinity) {
        const contentWidth = maxX - minX;
        const contentHeight = maxY - minY;
        const aspectRatio = contentHeight > 0 ? contentWidth / contentHeight : 0;
        
        // If aspect ratio is too wide, start a new row
        if (aspectRatio > aspectRatioThreshold) {
          // Start new row: go to left edge, below existing content
          boardX = minX;
          boardY = maxY + spacing;
        } else {
          // Continue current row: add to the right, aligned to top
          boardX = maxX + spacing;
          boardY = minY;
        }
        }
    }

    const newNote: Partial<Note> = {
      id: generateId(),
      createdAt: Date.now(),
      coords: coords,
      fontSize: 3, 
      emoji: '', // No default emoji
      text: '',
      images: [],
      tags: [],
      variant: 'standard',
      isFavorite: false,
      color: '#FFFDF5',
      boardX: boardX,
      boardY: boardY
    };
    setEditingNote(newNote);
    setIsEditorOpen(true);
    onToggleEditor(true);
  };

  const handleMarkerClick = (note: Note, e?: L.LeafletMouseEvent) => {
    // Prevent event propagation to avoid conflicts with map events
    if (e) {
      e.originalEvent?.stopPropagation();
      e.originalEvent?.stopImmediatePropagation();
    }

    // If we're opening the same note that was just closed, preserve the editing state
    let noteToEdit = note;
    if (editingNote && editingNote.id === note.id) {
      // Use the preserved editing state which has the most recent changes
      noteToEdit = editingNote as Note;
      console.log('Marker clicked:', note.id, 'using preserved editing data (most recent)');
    } else {
      // Clear previous editing state when opening a different note
      setEditingNote(null);

      // Get the latest note data from the notes array to ensure we have the most recent changes
    const latestNote = notes.find(n => n.id === note.id);
      if (latestNote) {
        noteToEdit = latestNote;
        console.log('Marker clicked:', note.id, 'using latest data from notes array');
      } else {
        console.log('Marker clicked:', note.id, 'using provided note data');
      }
    }

    setCurrentClusterNotes([]);
    setCurrentNoteIndex(0);
    setEditingNote(noteToEdit);
    setIsEditorOpen(true);
    onToggleEditor(true);
  };

  // Handle cluster marker click - set up cluster navigation
  const handleClusterClick = (clusterNotes: Note[], e?: L.LeafletMouseEvent) => {
    // Prevent event propagation to avoid conflicts with map events
    if (e) {
      e.originalEvent?.stopPropagation();
      e.originalEvent?.stopImmediatePropagation();
    }
    
    // Sort notes: from south to north, from west to east
    const sortedClusterNotes = sortNotes(clusterNotes);
    const firstNote = sortedClusterNotes[0];
    
    setCurrentClusterNotes(sortedClusterNotes);
    setCurrentNoteIndex(0);
    setEditingNote(firstNote);
    setIsEditorOpen(true);
    onToggleEditor(true);
  };

  
  // Save current note without closing editor
  const saveCurrentNoteWithoutClose = (noteData: Partial<Note>) => {
    if (noteData.id && notes.some(n => n.id === noteData.id)) {
      // 确保保留原始note的variant
      const existingNote = notes.find(n => n.id === noteData.id);
      const fullNote: Note = {
        ...existingNote!,
        ...noteData,
        variant: noteData.variant || existingNote!.variant
      } as Note;
      onUpdateNote(fullNote);
      // Update editingNote to reflect the saved changes
      setEditingNote(fullNote);
      // Update the note in currentClusterNotes to reflect changes
      const updatedClusterNotes = currentClusterNotes.map(note =>
        note.id === noteData.id ? { ...note, ...noteData, variant: noteData.variant || note.variant } as Note : note
      );
      setCurrentClusterNotes(updatedClusterNotes);
    } else {
      // 新Note必须指定variant
      const fullNote: Note = {
        ...noteData,
        variant: noteData.variant || 'standard'
      } as Note;
      onAddNote(fullNote);
      // Update editingNote for new notes
      setEditingNote(fullNote);
    }
  };

  // Switch to next marker (swipe right)
  const switchToNextNote = () => {
    if (currentClusterNotes.length > 1 && currentNoteIndex < currentClusterNotes.length - 1) {
      const nextIndex = currentNoteIndex + 1;
      setCurrentNoteIndex(nextIndex);
      setEditingNote(currentClusterNotes[nextIndex]);
    }
  };
  
  // Switch to previous marker (swipe left)
  const switchToPrevNote = () => {
    if (currentClusterNotes.length > 1 && currentNoteIndex > 0) {
      const prevIndex = currentNoteIndex - 1;
      setCurrentNoteIndex(prevIndex);
      setEditingNote(currentClusterNotes[prevIndex]);
    }
  };

  const handleSaveNote = (noteData: Partial<Note>) => {
    if (noteData.id && notes.some(n => n.id === noteData.id)) {
      // 确保保留原始note的variant
      const existingNote = notes.find(n => n.id === noteData.id);
      const fullNote: Note = {
        ...existingNote!,
        ...noteData,
        variant: noteData.variant || existingNote!.variant,
        isFavorite: noteData.isFavorite ?? existingNote?.isFavorite ?? false
      } as Note;
      onUpdateNote(fullNote);
      // Update editingNote to reflect the saved changes
      setEditingNote(fullNote);
    } else {
      // 新Note必须指定variant
      const fullNote: Note = {
        ...noteData,
        variant: noteData.variant || 'standard',
        isFavorite: noteData.isFavorite ?? false
      } as Note;
      onAddNote(fullNote);
      // For new notes, update editingNote as well
      setEditingNote(fullNote);
    }
  };

  const closeEditor = () => {
      setIsEditorOpen(false);
      onToggleEditor(false);
      // Keep editingNote state to preserve recent changes for potential re-opening
      // Only clear it when opening a different note
      setCurrentClusterNotes([]);
      setCurrentNoteIndex(0);
  };


  // Handle data import (JSON file with map notes)
  const handleDataImport = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (!data.project || !data.project.notes) {
        alert('Invalid project file format');
        return;
      }

      const importedNotes = (data.project.notes || []).filter((note: Note) => 
        note.coords && note.coords.lat && note.coords.lng
      );

      if (importedNotes.length === 0) {
        alert('No notes with location data found in the imported file');
        return;
      }

      // Check for duplicates and merge
      const existingNotes = project.notes || [];
      const isDuplicateNote = (note1: Note, note2: Note): boolean => {
        if (!note1.coords || !note2.coords) return false;
        const latDiff = Math.abs(note1.coords.lat - note2.coords.lat);
        const lngDiff = Math.abs(note1.coords.lng - note2.coords.lng);
        const textMatch = (note1.text || '').trim() === (note2.text || '').trim();
        return latDiff < 0.0001 && lngDiff < 0.0001 && textMatch;
      };

      const uniqueImportedNotes = importedNotes.filter((importedNote: Note) => {
        return !existingNotes.some((existingNote: Note) => 
          isDuplicateNote(importedNote, existingNote)
        );
      });

      // Generate new IDs for imported notes
      const newNotes = uniqueImportedNotes.map((note: Note) => ({
        ...note,
        isFavorite: note.isFavorite ?? false,
        id: generateId(),
        createdAt: Date.now() + Math.random()
      }));

      const mergedNotes = [...existingNotes, ...newNotes];
      
      if (onUpdateProject) {
        onUpdateProject({ ...project, notes: mergedNotes });
      }

      const duplicateCount = importedNotes.length - uniqueImportedNotes.length;
      if (duplicateCount > 0) {
        alert(`Successfully imported ${uniqueImportedNotes.length} new notes. ${duplicateCount} duplicate(s) were skipped.`);
      } else {
        alert(`Successfully imported ${uniqueImportedNotes.length} note(s).`);
      }
    } catch (error) {
      console.error('Failed to import data:', error);
      alert('Failed to import data. Please check the file format.');
    }
  };

  useEffect(() => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (!searchQuery.trim()) {
          setSearchResults([]);
          return;
      }
      setIsSearching(true);
      searchTimeoutRef.current = setTimeout(async () => {
          try {
             const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5&addressdetails=1`);
             if (response.ok) {
                 const data = await response.json();
                 setSearchResults(data);
             }
          } catch (e) {
             console.error(e);
          } finally {
             setIsSearching(false);
          }
      }, 500); 
      return () => {
          if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      };
  }, [searchQuery]);

  const selectSearchResult = (result: any) => {
      if (mapInstance) {
          const lat = parseFloat(result.lat);
          const lon = parseFloat(result.lon);
          mapInstance.flyTo([lat, lon], 16, { duration: 1.5 });
          setSearchQuery('');
          setSearchResults([]);
      }
  };

  // Map slider value (0.5-2.0) to actual pin size (0.2-1.2)
  const mapPinSize = (sliderValue: number): number => {
    // Linear mapping: 0.5 -> 0.2, 2.0 -> 1.2
    return (sliderValue - 0.5) * (1.2 - 0.2) / (2.0 - 0.5) + 0.2;
  };

  const createCustomIcon = (note: Note, count?: number, showTextLabels?: boolean, pinSize?: number) => {
      const isFavorite = note.isFavorite === true;
      // Use mapped pin size for pin, but keep original pinSize for label scaling
      const mappedPinSize = pinSize ? mapPinSize(pinSize) : 1.0;
      const scale = (isFavorite ? 2 : 1) * mappedPinSize;
      const baseSize = 40;
      const size = baseSize * scale;
      const borderWidth = 3; // 收藏时不加粗描边
      const badgeSize = 20 * scale;
      const badgeOffset = 8 * scale;
      const countBadge = count && count > 1 ? `
        <div style="
          position: absolute;
          top: -${badgeOffset}px;
          right: -${badgeOffset}px;
          width: ${badgeSize}px;
          height: ${badgeSize}px;
          background-color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          z-index: 10;
          border: 2px solid ${themeColor};
        ">
          <span style="
            color: black;
            font-size: ${12 * scale}px;
            font-weight: bold;
            line-height: 1;
          ">${count}</span>
        </div>
      ` : '';
      
      // Priority: photo > sketch > emoji, if none then pure yellow
      let content = '';
      let backgroundColor = 'white';
      
      // Use yellow as background for all cases to fill the pin shape
      backgroundColor = themeColor;
      
      if (note.images && note.images.length > 0) {
        // Show photo with pin-shaped mask
        // Inner container inherits outer shape, only rotates image to be upright
        // Expand container with negative inset to allow image to scale 1.5x without clipping
        content = `<div style="
          position: absolute;
          inset: -25%;
          overflow: hidden;
          transform: rotate(45deg);
          transform-origin: center;
        ">
          <img src="${note.images[0]}" style="
            width: 100%;
            height: 100%;
            object-fit: cover;
            transform: scale(1.5);
            transform-origin: center;
          " />
        </div>`;
      } else if (note.sketch) {
        // Show sketch with pin-shaped mask
        // Inner container inherits outer shape, only rotates image to be upright
        // Expand container with negative inset to allow image to scale 1.5x without clipping
        content = `<div style="
          position: absolute;
          inset: -25%;
          overflow: hidden;
          transform: rotate(45deg);
          transform-origin: center;
        ">
          <img src="${note.sketch}" style="
            width: 100%;
            height: 100%;
            object-fit: cover;
            transform: scale(1.5);
            transform-origin: center;
          " />
        </div>`;
      } else if (note.emoji) {
        // Show emoji, background is yellow, scale with pin size and favorite status
        const emojiSize = 20 * scale; // Scale emoji with pin size
        content = `<span style="transform: rotate(45deg); font-size: ${emojiSize}px; line-height: 1; z-index: 1; position: relative;">${note.emoji}</span>`;
      }
      
      return L.divIcon({
          className: 'custom-icon',
          html: `<div style="
            position: relative;
            background-color: ${backgroundColor}; 
            width: ${size}px; 
            height: ${size}px; 
            border-radius: 50% 50% 50% 0; 
            transform: rotate(-45deg) ${isFavorite ? 'scale(1)' : ''};
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
            border: ${borderWidth}px solid ${themeColor};
            overflow: hidden;
          ">
            ${content}
          </div>
          ${countBadge}`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size],
          popupAnchor: [0, -size]
      });
  };

  // Sort markers: bottom to top, left to right
  const sortNotes = useCallback((notes: Note[]): Note[] => {
    return [...notes].sort((a, b) => {
      // 收藏优先
      const favA = a.isFavorite ? 1 : 0;
      const favB = b.isFavorite ? 1 : 0;
      if (favA !== favB) return favB - favA;
      // First by latitude (bottom to top, smaller latitude is below)
      if (Math.abs(a.coords.lat - b.coords.lat) > 0.0001) {
        return a.coords.lat - b.coords.lat;
      }
      // Then by longitude (left to right, smaller longitude is on left)
      return a.coords.lng - b.coords.lng;
    });
  }, []);
  
  // Pin clustering distance threshold (in screen pixels)
  // Now controlled by user setting - removed constant, use clusterThreshold directly
  
  // Calculate distance between two pins on the map (in screen pixels)
  // Returns null if calculation fails
  const calculatePinDistance = useCallback((map: L.Map, note1: Note, note2: Note): number | null => {
    try {
      const container = map.getContainer();
      if (!container) {
        return null;
      }
      
      // Try to calculate distance - latLngToContainerPoint should work even during zoom
      const point1 = map.latLngToContainerPoint([note1.coords.lat, note1.coords.lng]);
      const point2 = map.latLngToContainerPoint([note2.coords.lat, note2.coords.lng]);
      
      // Validate points
      if (!point1 || !point2 || isNaN(point1.x) || isNaN(point1.y) || isNaN(point2.x) || isNaN(point2.y)) {
        return null;
      }
      
      const distance = point1.distanceTo(point2);
      return distance;
    } catch (e) {
      // Log error for debugging
      console.warn('Distance calculation error:', e);
      return null;
    }
  }, []);
  
  // Detect if markers overlap (based on screen pixel distance)
  const detectClusters = useCallback((notes: Note[], map: L.Map, threshold: number = clusterThreshold): Array<{ notes: Note[], position: [number, number] }> => {
    if (!map || notes.length === 0) return [];
    
    // Check if map is initialized
    try {
      // Try to get map container, if fails then map is not ready
      const container = map.getContainer();
      if (!container || !container.offsetParent) {
        return [];
      }
    } catch (e) {
      return [];
    }
    
    const sortedNotes = sortNotes(notes);
    const clusters: Array<{ notes: Note[], position: [number, number] }> = [];
    const processed = new Set<string>();
    
    sortedNotes.forEach((note) => {
      if (processed.has(note.id)) return;
      
      const cluster: Note[] = [note];
      processed.add(note.id);
      
      // Find nearby markers using unified distance calculation
      sortedNotes.forEach((otherNote) => {
        if (processed.has(otherNote.id)) return;
        
        const distance = calculatePinDistance(map, note, otherNote);
        if (distance !== null && distance < threshold) {
          cluster.push(otherNote);
          processed.add(otherNote.id);
        } else if (distance === null && note.id === sortedNotes[0]?.id) {
          // Debug: log first note's distance calculation failures
          console.warn('Distance calculation failed for note:', note.id, 'to', otherNote.id);
        }
      });
      
      // Use bottommost marker position (first after sorting)
      const clusterNotes = sortNotes(cluster);
      const bottomNote = clusterNotes[0];
      clusters.push({
        notes: clusterNotes,
        position: [bottomNote.coords.lat, bottomNote.coords.lng]
      });
    });
    
    return clusters;
  }, [sortNotes, calculatePinDistance, clusterThreshold]);
  
  // Use ref to store mapInstance to avoid closure issues
  const mapInstanceRef = useRef<L.Map | null>(null);
  useEffect(() => {
    mapInstanceRef.current = mapInstance;
  }, [mapInstance]);
  
  // Update clustered markers
  useEffect(() => {
    if (!isMapMode || !mapInstance || mapNotes.length === 0) {
      setClusteredMarkers([]);
      return;
    }
    
    let updateTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let rafId: number | null = null;
    let isZooming = false;
    
    const updateClusters = () => {
      const currentMap = mapInstanceRef.current;
      if (!currentMap) return;
      
      // Cancel any pending timeout updates (but allow RAF updates during zoom)
      if (updateTimeoutId) {
        clearTimeout(updateTimeoutId);
        updateTimeoutId = null;
      }
      
      // Cancel any pending RAF
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      
      // Use requestAnimationFrame for smooth updates
      const requestedRafId = requestAnimationFrame(() => {
        const currentMap = mapInstanceRef.current;
        if (!currentMap) return;
        
        try {
          const container = currentMap.getContainer();
          if (!container || !container.offsetParent) {
            // Map not ready, retry after a short delay
            updateTimeoutId = setTimeout(updateClusters, 50);
            return;
          }
          
          // Ensure map pane is ready
          const mapPane = currentMap.getPane('mapPane');
          if (!mapPane) {
            updateTimeoutId = setTimeout(updateClusters, 50);
            return;
          }
          
          // Calculate clusters with current threshold
          const clusters = detectClusters(getFilteredNotes, currentMap, clusterThreshold);
          setClusteredMarkers(clusters);
        } catch (e) {
          console.warn('Failed to update clusters:', e);
          // Retry after a short delay if calculation fails
          updateTimeoutId = setTimeout(updateClusters, 50);
        }
      });
      rafId = requestedRafId;
    };
    
    // Initial update with delay to ensure map is fully initialized
    const timeoutId = setTimeout(() => {
      updateClusters();
    }, 100);
    
    // Real-time update during zoom (using RAF for immediate feedback)
    const handleZoom = () => {
      isZooming = true;
      // Cancel any pending timeout updates
      if (updateTimeoutId) {
        clearTimeout(updateTimeoutId);
        updateTimeoutId = null;
      }
      // Use RAF for immediate, smooth updates during zoom
      updateClusters();
    };
    
    // Update after zoom animation completes
    const handleZoomEnd = () => {
      isZooming = false;
      // Cancel any pending updates
      if (updateTimeoutId) {
        clearTimeout(updateTimeoutId);
        updateTimeoutId = null;
      }
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      
      // Delay update to ensure map is fully stable after zoom animation
      updateTimeoutId = setTimeout(() => {
        updateClusters();
        // Backup update after longer delay to ensure stability
        updateTimeoutId = setTimeout(() => {
          updateClusters();
        }, 150);
      }, 100);
    };
    
    const handleMoveEnd = () => {
      if (isZooming) return; // Don't update during zoom
      // Delay update to ensure map is fully stable after move animation
      if (updateTimeoutId) clearTimeout(updateTimeoutId);
      updateTimeoutId = setTimeout(() => {
        updateClusters();
      }, 50);
    };
    
    // Listen to zoom events (during animation) for real-time updates
    mapInstance.on('zoom', handleZoom);
    // Listen to zoomend (after animation completes)
    mapInstance.on('zoomend', handleZoomEnd);
    mapInstance.on('moveend', handleMoveEnd);
    
    return () => {
      clearTimeout(timeoutId);
      if (updateTimeoutId) {
        clearTimeout(updateTimeoutId);
      }
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      if (mapInstance) {
        mapInstance.off('zoom', handleZoom);
        mapInstance.off('zoomend', handleZoomEnd);
        mapInstance.off('moveend', handleMoveEnd);
      }
    };
  }, [mapInstance, getFilteredNotes, isMapMode, clusterThreshold, detectClusters]);

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only hide drag overlay if editor is not open
    if (!isEditorOpen) {
    // Check if we're actually leaving the container (not just moving to a child element)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    // If the mouse is outside the container bounds, hide the drag overlay
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragging(false);
      }
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    // Always hide drag overlay when drag ends (even if cancelled)
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // If editor is open, don't process the drop - let NoteEditor handle it
    // The drag overlay will still show to guide users
    if (isEditorOpen) {
      setIsDragging(false);
      return;
    }

    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      // Filter image and JSON files (including HEIC)
      const imageFiles = Array.from(files).filter((file: File) => 
        file.type.startsWith('image/') || 
        file.name.toLowerCase().endsWith('.heic') ||
        file.name.toLowerCase().endsWith('.heif')
      );
      const jsonFiles = Array.from(files).filter((file: File) => 
        file.type === 'application/json' || file.name.endsWith('.json')
      );

      if (imageFiles.length > 0) {
        // If editor is open and editing a standard note, add images to current note
        if (isEditorOpen && editingNote && editingNote.variant !== 'compact') {
          try {
            const newImages: string[] = [];
            for (const file of imageFiles) {
              const base64 = await fileToBase64(file as File);
              newImages.push(base64);
            }
            const updatedNote = {
              ...editingNote,
              images: [...(editingNote.images || []), ...newImages]
            };
            onUpdateNote(updatedNote as Note);
            setEditingNote(updatedNote);
          } catch (error) {
            console.error('Failed to add images to note:', error);
          }
        } else {
          // Create a FileList-like object
          const dataTransfer = new DataTransfer();
          imageFiles.forEach((file) => {
            dataTransfer.items.add(file as File);
          });
          handleImageImport(dataTransfer.files, true);
        }
      } else if (jsonFiles.length > 0 && jsonFiles[0]) {
        // For JSON, import directly
        handleDataImport(jsonFiles[0] as File);
      }
    }
  };

  return (
    <div 
      id="map-view-container" 
      className={`relative w-full h-full z-0 bg-gray-100 ${isDragging ? 'ring-4 ring-offset-2' : ''}`}
      style={isDragging ? { boxShadow: `0 0 0 4px ${themeColor}` } : undefined}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onDragEnd={handleDragEnd}
    >
      {isDragging && (
        <div 
          className="absolute inset-0 z-[4000] backdrop-blur-sm flex items-center justify-center pointer-events-auto"
          style={{ backgroundColor: isEditorOpen ? '#3B82F633' : `${themeColor}33` }}
          onClick={() => setIsDragging(false)}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-8 border-4 pointer-events-none" style={{ borderColor: themeColor }}>
            <div className="text-center">
              <div className="mb-4 flex justify-center">
                {isEditorOpen ? (
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-blue-600">
                    <path d="M14 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M16 13H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M16 17H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M10 9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                <svg width="64" height="64" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-gray-700">
                  <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                  <path d="M8 11V5M5 8l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                )}
              </div>
              <div className="text-xl font-bold text-gray-800">
                {isEditorOpen
                  ? "Drag images to the note editor to add them"
                  : "Drop images or JSON files here to import"
                }
              </div>
            </div>
          </div>
        </div>
      )}
      <MapContainer
        key={projectId || 'no-project'}
        center={
          isMapMode
            ? (initialMapPosition?.center || defaultCenter)
            : [0, 0]
        }
        zoom={isMapMode ? (initialMapPosition?.zoom ?? 16) : -8}
        minZoom={isMapMode ? 6 : -20} 
        maxZoom={isMapMode ? 19 : 2}
        zoomSnap={0.1}  // Enable fractional zoom levels
        zoomDelta={0.1}  // Allow smaller zoom increments
        crs={isMapMode ? L.CRS.EPSG3857 : L.CRS.Simple}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        ref={(map) => {
          // Only set when map is available; avoid setting null to prevent effect thrash
          if (map && map !== mapInstance) {
            setMapInstance(map);
          }
          
          if (map && isMapMode && !mapInitRef.current.has(map)) {
            // Mark this map instance as initialized
            mapInitRef.current.add(map);
            
            map.whenReady(() => {
              // Navigation coordinates are now set before MapView mounts, so map should already be at correct position
              // No need for additional setView calls
              
              // Helper function to safely invalidate size and update view
              const safeInvalidateAndUpdate = () => {
                if (!map || !map.getContainer()) return false;
                
                // Check if map pane is initialized before calling invalidateSize
                const mapPane = map.getPane('mapPane');
                if (!mapPane) {
                  return false; // Not ready yet
                }
                
                try {
                  map.invalidateSize();
                  // Removed: Force a view update to trigger tile loading
                  // This was causing cached positions to be overwritten with incorrect values
                  // const center = map.getCenter();
                  // const zoom = map.getZoom();
                  // if (center && typeof center.lat === 'number' && typeof center.lng === 'number') {
                  //   map.setView(center, zoom, { animate: false });
                  // }
                  return true; // Success
                } catch (error) {
                  console.warn('Error updating map view:', error);
                  return false;
                }
              };
              
              // Try immediately (map should be ready after whenReady)
              if (!safeInvalidateAndUpdate()) {
                // If not ready, try after a short delay
                setTimeout(() => {
                  if (!safeInvalidateAndUpdate()) {
                    // If still not ready, try one more time after longer delay
                    setTimeout(() => {
                      safeInvalidateAndUpdate();
                    }, 200);
                  }
                }, 100);
              }
            });
          }
        }}
        doubleClickZoom={false}
      >
        <MapNavigationHandler coords={navigateToCoords} onComplete={onNavigateComplete} />
        <MapPositionTracker onPositionChange={handleMapPositionChange} />
        {isMapMode ? (
           (() => {
             const isSatellite = effectiveMapStyle === 'satellite';
             const selectedStyle = isSatellite 
               ? null 
               : (MAP_STYLE_OPTIONS.find(s => s.id === effectiveMapStyle) || MAP_STYLE_OPTIONS[0]);
             return (
               <TileLayer 
                 key={effectiveMapStyle}
                 attribution={isSatellite 
                   ? 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                   : selectedStyle!.attribution
                 } 
                 url={isSatellite ? MAP_SATELLITE_URL : selectedStyle!.url}
                 maxNativeZoom={19}
                 maxZoom={19}
                 tileSize={256}
                 zoomOffset={0}
               />
             );
           })()
        ) : (
           <>
              {project.backgroundImage && imageDimensions && (
                  <ImageOverlay
                    url={project.backgroundImage}
                    bounds={imageBounds}
                  />
              )}
           </>
        )}
        
        <MapLongPressHandler onLongPress={handleLongPress} />
        
        {isMapMode && (
          <MapCenterHandler
            center={initialMapPosition?.center || defaultCenter}
            zoom={initialMapPosition?.zoom ?? 16}
          />
        )}
        
        {isMapMode && (
          <TextLabelsLayer
            notes={getFilteredNotes}
            showTextLabels={showTextLabels}
            pinSize={pinSize}
            themeColor={themeColor}
          />
        )}

        {/* User Location Indicator - only show if location permission is granted */}
        {isMapMode && hasLocationPermission && currentLocation && mapInstance && (
          <Marker
            position={[currentLocation.lat, currentLocation.lng]}
            icon={L.divIcon({
              className: 'user-location-marker',
              html: `<div style="
                position: relative;
                width: 48px;
                height: 48px;
              ">
                <!-- Semi-transparent direction sector (48px radius, 60 degrees) -->
                <div style="
                  position: absolute;
                  top: 0;
                  left: 0;
                  width: 48px;
                  height: 48px;
                  border-radius: 50%;
                  background: conic-gradient(
                    from ${((deviceHeading || 0) - 30) % 360}deg,
                    transparent 0deg,
                    rgba(${hexToRgb(themeColor)}, 0.3) 0deg,
                    rgba(${hexToRgb(themeColor)}, 0.3) 60deg,
                    transparent 60deg
                  );
                  transform: rotate(${deviceHeading || 0}deg);
                  transition: transform 0.3s ease;
                "></div>

                <!-- Center dot (12px radius) -->
                <div style="
                  position: absolute;
                  top: 18px;
                  left: 18px;
                  width: 12px;
                  height: 12px;
                  background-color: ${themeColor};
                  border: 2px solid white;
                  border-radius: 50%;
                  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                "></div>
              </div>`,
              iconSize: [48, 48],
              iconAnchor: [24, 24]
            })}
            zIndexOffset={1000} // Always on top
          />
        )}

        {/* Location error indicator */}
        {isMapMode && locationError && (
          <div className="fixed top-20 left-4 right-4 z-[1000] bg-red-50 border border-red-200 rounded-lg p-3 shadow-lg">
            <div className="flex items-start gap-2">
              <div className="text-red-500 mt-0.5">📍</div>
              <div className="flex-1">
                <p className="text-sm text-red-800 font-medium">位置服务不可用</p>
                <p className="text-xs text-red-600 mt-1">{locationError}</p>
                <button
                  onClick={retryLocation}
                  className="mt-2 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-xs rounded-md transition-colors"
                >
                  🔄 重试
                </button>
              </div>
              <button
                onClick={() => setLocationError(null)}
                className="text-red-400 hover:text-red-600 text-lg leading-none"
                title="关闭提示"
              >
                ×
              </button>
            </div>
          </div>
        )}
        
        {isMapMode && (showTextLabels ? (
          // Text labels mode: show all markers individually without clustering
          getFilteredNotes.map(note => (
            <Marker
              key={note.id}
              position={[note.coords.lat, note.coords.lng]}
              icon={createCustomIcon(note, undefined, showTextLabels, pinSize)}
              zIndexOffset={note.isFavorite ? 100 : -100}
              eventHandlers={{
                click: (e) => {
                  e.originalEvent?.stopPropagation();
                  e.originalEvent?.stopImmediatePropagation();
                  handleMarkerClick(note, e);
                }
              }}
            />
          ))
        ) : clusteredMarkers.length > 0 && mapInstance ? (
          // Show clustered markers (only show clusters with multiple markers, single markers shown separately)
          clusteredMarkers.map((cluster) => {
            if (cluster.notes.length === 1) {
              // Single marker, display directly
              const note = cluster.notes[0];
              return (
          <Marker
            key={note.id}
            position={[note.coords.lat, note.coords.lng]}
                  icon={createCustomIcon(note, undefined, showTextLabels, pinSize)}
                  zIndexOffset={note.isFavorite ? 100 : -100}
                  eventHandlers={{
                    click: (e) => {
                      e.originalEvent?.stopPropagation();
                      e.originalEvent?.stopImmediatePropagation();
                      handleMarkerClick(note, e);
                    }
                  }}
                />
              );
            } else {
              // Multiple markers, show cluster - use sorted note IDs as stable key
              const clusterKey = cluster.notes
                .map(note => note.id)
                .sort()
                .join('-');
              return (
                <Marker
                  key={`cluster-${clusterKey}`}
                  position={cluster.position}
                  icon={createCustomIcon(cluster.notes[0], cluster.notes.length, showTextLabels, pinSize)}
                  zIndexOffset={cluster.notes.some(note => note.isFavorite) ? 100 : -100}
                  eventHandlers={{
                    click: (e) => {
                      e.originalEvent?.stopPropagation();
                      e.originalEvent?.stopImmediatePropagation();
                      handleClusterClick(cluster.notes, e);
                    }
                  }}
                />
              );
            }
          })
        ) : (
          // Show single markers (non-map mode or when no clustering)
          mapInstance && getFilteredNotes.map(note => (
            <Marker
              key={note.id}
              position={[note.coords.lat, note.coords.lng]}
              icon={createCustomIcon(note, undefined, showTextLabels, pinSize)}
              zIndexOffset={note.isFavorite ? 100 : -100}
              eventHandlers={{
                click: (e) => {
                  e.originalEvent?.stopPropagation();
                  e.originalEvent?.stopImmediatePropagation();
                  handleMarkerClick(note, e);
                }
              }}
            />
          ))
        ))}

        {/* Import preview markers */}
        {isMapMode && showImportDialog && importPreview.filter(p => !p.error).map((preview, index) => (
          <Marker
            key={`preview-${index}`}
            position={[preview.lat, preview.lng]}
            icon={L.divIcon({
              className: 'custom-icon preview-marker',
              html: `<div style="
                position: relative;
                background-color: ${themeColor}; 
                width: 40px; 
                height: 40px; 
                border-radius: 50% 50% 50% 0; 
                transform: rotate(-45deg);
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
                border: 3px solid ${themeColor};
                overflow: hidden;
                opacity: 0.7;
              ">
                <div style="
                  position: absolute;
                  inset: 0;
                  border-radius: 50% 50% 50% 0;
                  overflow: hidden;
                  transform: rotate(45deg);
                ">
                  <img src="${preview.imageUrl}" style="
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    transform: scale(1.2);
                    transform-origin: center;
                  " />
                </div>
              </div>`,
              iconSize: [40, 40],
              iconAnchor: [20, 40]
            })}
          />
        ))}

        {isMapMode && (
          <div className="absolute top-2 sm:top-4 left-2 sm:left-4 right-2 sm:right-4 z-[500] flex flex-col gap-2 pointer-events-none items-start">
              {/* First Row: Main Controls */}
              <MapControls 
                onImportPhotos={() => fileInputRef.current?.click()} 
                onImportData={() => dataImportInputRef.current?.click()}
                mapStyle={mapStyle}
                onMapStyleChange={(style) => setLocalMapStyle(style)}
                mapNotes={getFilteredNotes}
                frames={project.frames || []}
                frameLayerVisibility={frameLayerVisibility}
                setFrameLayerVisibility={setFrameLayerVisibility}
                themeColor={themeColor}
                showTextLabels={showTextLabels}
                setShowTextLabels={setShowTextLabels}
                pinSize={pinSize}
                setPinSize={setPinSize}
                clusterThreshold={clusterThreshold}
                setClusterThreshold={setClusterThreshold}
                onOpenSettings={() => setShowSettingsPanel(true)}
                showImportMenu={showImportMenu}
                setShowImportMenu={setShowImportMenu}
              />

              {/* Second Row: Sliders (hidden on small screens, available in settings) */}
              <div className="hidden sm:flex gap-1.5 sm:gap-2 pointer-events-auto"
                onPointerDown={(e) => {
                  // Don't stop propagation for slider interactions
                  const target = e.target as Element;
                  if (target.closest('.custom-horizontal-slider')) {
                    return; // Let slider handle the event
                  }
                  e.stopPropagation();
                }}
                onPointerMove={(e) => {
                  const target = e.target as Element;
                  if (target.closest('.custom-horizontal-slider')) {
                    return; // Let slider handle the event
                  }
                  e.stopPropagation();
                }}
                onPointerUp={(e) => {
                  const target = e.target as Element;
                  if (target.closest('.custom-horizontal-slider')) {
                    return; // Let slider handle the event
                  }
                  e.stopPropagation();
                }}
              >
                {/* Pin Size Control */}
                <div className="bg-white/90 backdrop-blur rounded-lg shadow-lg border border-gray-100 p-2 flex flex-col items-center gap-1">
                    <span className="text-xs font-medium text-gray-600 whitespace-nowrap">Pin Size</span>
                    <CustomHorizontalSlider
                        value={pinSize}
                        min={0.5}
                        max={2.0}
                        step={0.1}
                        onChange={setPinSize}
                        themeColor={themeColor}
                        width={90}
                        formatValue={(val) => `${val.toFixed(1)}x`}
                        mapInstance={mapInstance}
                    />
                </div>

                {/* Cluster Threshold Control */}
                <div className="bg-white/90 backdrop-blur rounded-lg shadow-lg border border-gray-100 p-2 flex flex-col items-center gap-1">
                    <span className="text-xs font-medium text-gray-600 whitespace-nowrap">Cluster Threshold</span>
                    <CustomHorizontalSlider
                        value={clusterThreshold}
                        min={1}
                        max={100}
                        step={5}
                        onChange={setClusterThreshold}
                        themeColor={themeColor}
                        width={90}
                        formatValue={(val) => `${val}px`}
                        mapInstance={mapInstance}
                    />
                </div>
              </div>

              {/* Third Row: Search Bar */}
              <SearchBarContainer>
              <div 
                  className="flex-1 max-w-md relative group pointer-events-auto"
                  onPointerDown={(e) => {
                      e.stopPropagation();
                  }}
                  onPointerMove={(e) => {
                      e.stopPropagation();
                  }}
                  onPointerUp={(e) => {
                      e.stopPropagation();
                  }}
                  onPointerCancel={(e) => {
                      e.stopPropagation();
                  }}
                  onMouseDown={(e) => {
                      e.stopPropagation();
                  }}
                  onMouseMove={(e) => {
                      e.stopPropagation();
                  }}
                  onMouseUp={(e) => {
                      e.stopPropagation();
                  }}
                  onTouchStart={(e) => {
                      e.stopPropagation();
                  }}
                  onTouchMove={(e) => {
                      e.stopPropagation();
                  }}
                  onTouchEnd={(e) => {
                      e.stopPropagation();
                  }}
                  onDoubleClick={(e) => {
                      e.stopPropagation();
                  }}
              >
                  <div 
                      className="bg-white rounded-xl shadow-lg flex items-center px-4 transition-shadow focus-within:shadow-xl relative z-10"
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
                      onMouseUp={(e) => {
                          e.stopPropagation();
                      }}
                      onTouchStart={(e) => {
                          e.stopPropagation();
                      }}
                      onTouchMove={(e) => {
                          e.stopPropagation();
                      }}
                      onTouchEnd={(e) => {
                          e.stopPropagation();
                      }}
                  >
                      <Search size={18} className="text-gray-400 flex-shrink-0" />
                      <input 
                          type="text" 
                          placeholder="Search city, place..." 
                          className="w-full p-3 bg-transparent border-none outline-none text-gray-700 placeholder-gray-400"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
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
                          onMouseUp={(e) => {
                              e.stopPropagation();
                          }}
                          onTouchStart={(e) => {
                              e.stopPropagation();
                          }}
                          onTouchMove={(e) => {
                              e.stopPropagation();
                          }}
                          onTouchEnd={(e) => {
                              e.stopPropagation();
                          }}
                      />
                      {isSearching && <Loader2 size={18} className="text-yellow-500 animate-spin" />}
                  </div>
                  {searchResults.length > 0 && (
                      <div 
                          className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 border border-gray-100"
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
                          onMouseUp={(e) => {
                              e.stopPropagation();
                          }}
                          onTouchStart={(e) => {
                              e.stopPropagation();
                          }}
                          onTouchMove={(e) => {
                              e.stopPropagation();
                          }}
                          onTouchEnd={(e) => {
                              e.stopPropagation();
                          }}
                      >
                          {searchResults.map((result: any, i) => (
                              <button
                                  key={i}
                                  onClick={(e) => {
                                      e.stopPropagation();
                                      selectSearchResult(result);
                                  }}
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
                                  onMouseUp={(e) => {
                                      e.stopPropagation();
                                  }}
                                  onTouchStart={(e) => {
                                      e.stopPropagation();
                                  }}
                                  onTouchMove={(e) => {
                                      e.stopPropagation();
                                  }}
                                  onTouchEnd={(e) => {
                                      e.stopPropagation();
                                  }}
                                  className="w-full text-left px-4 py-3 hover:bg-yellow-50 border-b border-gray-50 last:border-none transition-colors flex flex-col gap-0.5"
                              >
                                  <span className="font-medium text-gray-800 text-sm truncate w-full block">{result.display_name.split(',')[0]}</span>
                                  <span className="text-xs text-gray-400 truncate w-full block">{result.display_name}</span>
                              </button>
                          ))}
                      </div>
                  )}
              </div>
              </SearchBarContainer>
          </div>
        )}

        {mapNotes.length === 0 && (
          <div className="absolute top-24 left-0 right-0 z-[400] pointer-events-none flex justify-center">
             <div className="relative">
                <div className="bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-lg text-sm text-gray-600 animate-bounce whitespace-nowrap">
                    Long press anywhere to pin
                </div>
             </div>
          </div>
        )}

        <div className="fixed bottom-20 sm:bottom-24 left-2 sm:left-4 z-[500]">
           <MapZoomController 
             min={isMapMode ? 13 : minImageZoom} 
             max={isMapMode ? 19 : 4} 
             themeColor={themeColor}
           />
        </div>

      </MapContainer>

      {/* Frame Layer Button - Outside MapContainer, like BoardView */}
      {isMapMode && (
        <div
          className="fixed top-2 sm:top-4 right-2 sm:right-4 z-[500] pointer-events-auto flex items-center"
          style={{ height: '40px' }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="relative" ref={frameLayerRef}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowFrameLayerPanel(!showFrameLayerPanel);
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.currentTarget.style.backgroundColor = themeColor;
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                if (!showFrameLayerPanel) {
                  e.currentTarget.style.backgroundColor = '';
                }
              }}
              onMouseEnter={(e) => {
                if (!showFrameLayerPanel) {
                  e.currentTarget.style.backgroundColor = '#F3F4F6'; // gray-100
                }
              }}
              onMouseLeave={(e) => {
                if (!showFrameLayerPanel) {
                  e.currentTarget.style.backgroundColor = '';
                }
              }}
              className={`bg-white p-2 sm:p-3 rounded-xl shadow-lg transition-colors w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center ${
                showFrameLayerPanel ? 'text-white' : 'text-gray-700'
              }`}
              style={{ backgroundColor: showFrameLayerPanel ? themeColor : undefined }}
              title="Frame Layers"
            >
              <Layers size={18} className="sm:w-5 sm:h-5" />
            </button>
            {showFrameLayerPanel && (
              <div
                className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-[2000]"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-3 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide">Frame Layers</div>
                <div className="h-px bg-gray-100 mb-1" />

                {/* Show All Option */}
                <div className="px-3 py-2 flex items-center justify-between hover:bg-gray-50">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-700 font-medium">Show All</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={showAllFrames}
                    onChange={(e) => {
                      e.stopPropagation();
                      setShowAllFrames(!showAllFrames);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    className={`w-4 h-4 rounded border-2 cursor-pointer appearance-none ${
                      showAllFrames
                        ? ''
                        : 'bg-transparent'
                    }`}
                    style={{
                      backgroundColor: showAllFrames ? themeColor : 'transparent',
                      borderColor: themeColor
                    }}
                  />
                </div>

                {/* Frame Options - only show when Show All is disabled */}
                {!showAllFrames && (
                  <>
                    <div className="h-px bg-gray-100 my-1" />
                    {project.frames.map((frame) => (
                  <div key={frame.id} className="px-3 py-2 flex items-center justify-between hover:bg-gray-50">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded border border-gray-300"
                        style={{ backgroundColor: frame.color }}
                      />
                      <span className="text-sm text-gray-700 truncate" title={frame.title}>
                        {frame.title}
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={frameLayerVisibility[frame.id] ?? true}
                      onChange={(e) => {
                        e.stopPropagation();
                        setFrameLayerVisibility(prev => ({
                          ...prev,
                          [frame.id]: !prev[frame.id]
                        }));
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      className={`w-4 h-4 rounded border-2 cursor-pointer appearance-none ${
                        frameLayerVisibility[frame.id] ?? true
                          ? ''
                          : 'bg-transparent'
                      }`}
                      style={{
                        backgroundColor: (frameLayerVisibility[frame.id] ?? true) ? themeColor : 'transparent',
                        borderColor: themeColor
                      }}
                    />
                  </div>
                ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      
      {isEditorOpen && (
        <NoteEditor 
            isOpen={isEditorOpen}
            onClose={closeEditor}
            onSave={handleSaveNote}
            onDelete={onDeleteNote}
            initialNote={editingNote || {}}
            clusterNotes={currentClusterNotes.length > 1 ? currentClusterNotes : []}
            currentIndex={currentNoteIndex}
            onNext={switchToNextNote}
            onPrev={switchToPrevNote}
            onSaveWithoutClose={saveCurrentNoteWithoutClose}
            onSwitchToBoardView={(coords) => onSwitchToBoardView(coords, mapInstance)}
        />
      )}

      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleImageImport(e.target.files)}
      />
      <input
        ref={dataImportInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleDataImport(e.target.files[0]);
            e.target.value = '';
          }
        }}
      />

      {/* Import preview dialog */}
      {showImportDialog && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4">
              <h3 className="text-lg font-bold text-gray-800">Import Photo Preview</h3>
              <div className="mt-1 text-sm text-gray-600">
                Importable: {importPreview.filter(p => !p.error && !p.isDuplicate).length} | 
                Already imported: {importPreview.filter(p => !p.error && p.isDuplicate).length} | 
                Cannot import: {importPreview.filter(p => p.error).length}
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-3 gap-2">
                {importPreview.map((preview, index) => (
                  <div key={index} className="relative aspect-square">
                    <img 
                      src={preview.imageUrl} 
                      alt={`Preview ${index + 1}`}
                      className="w-full h-full object-cover rounded-lg"
                    />
                    {preview.error ? (
                      <div className="absolute inset-0 bg-red-500/20 rounded-lg flex items-center justify-center">
                        <div className="text-center text-red-600 text-xs px-2">
                          <X size={16} className="mx-auto mb-1" />
                          <span className="font-bold">{preview.error}</span>
                        </div>
                      </div>
                    ) : preview.isDuplicate ? (
                      <div className="absolute inset-0 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                        <div className="text-center text-yellow-700 text-xs px-2">
                          <Check size={16} className="mx-auto mb-1" />
                          <span className="font-bold">Already imported</span>
                        </div>
                      </div>
                    ) : (
                      <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1.5">
                        <Check size={12} />
                      </div>
                    )}
                    {!preview.error && (
                      <div className="mt-1 text-xs text-gray-600">
                        {preview.lat.toFixed(6)}, {preview.lng.toFixed(6)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            
            <div className="p-4 flex justify-end gap-2">
              <button
                onClick={handleCancelImport}
                className="px-6 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={importPreview.filter(p => !p.error && !p.isDuplicate).length === 0}
                className="px-6 py-2 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg text-gray-900 font-medium transition-colors"
                style={{ backgroundColor: themeColor }}
                onMouseEnter={(e) => {
                  if (!e.currentTarget.disabled) {
                    const darkR = Math.max(0, Math.floor(parseInt(themeColor.slice(1, 3), 16) * 0.9));
                    const darkG = Math.max(0, Math.floor(parseInt(themeColor.slice(3, 5), 16) * 0.9));
                    const darkB = Math.max(0, Math.floor(parseInt(themeColor.slice(5, 7), 16) * 0.9));
                    const darkHex = '#' + [darkR, darkG, darkB].map(x => {
                      const hex = x.toString(16);
                      return hex.length === 1 ? '0' + hex : hex;
                    }).join('').toUpperCase();
                    e.currentTarget.style.backgroundColor = darkHex;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!e.currentTarget.disabled) {
                    e.currentTarget.style.backgroundColor = themeColor;
                  }
                }}
              >
                Confirm Import ({importPreview.filter(p => !p.error && !p.isDuplicate).length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
        themeColor={themeColor}
        onThemeColorChange={(color) => {
          // This will be handled by parent component (App.tsx)
          // For now, just close the panel
          setShowSettingsPanel(false);
        }}
        currentMapStyle={mapStyleId || 'carto-light-nolabels'}
        onMapStyleChange={(styleId) => {
          onMapStyleChange?.(styleId);
          set('mapp-map-style', styleId);
        }}
        pinSize={pinSize}
        onPinSizeChange={setPinSize}
        clusterThreshold={clusterThreshold}
        onClusterThresholdChange={setClusterThreshold}
      />

      {/* Import Menu - shown when new upload button is clicked */}
      {showImportMenu && (
        <div className="fixed inset-0 z-[6000] flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black bg-opacity-50"
            onClick={() => setShowImportMenu && setShowImportMenu(false)}
          />
          <div className="relative z-[6001] bg-white rounded-xl shadow-xl border border-gray-100 py-2 w-48 mx-4">
            <button
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
                setShowImportMenu && setShowImportMenu(false);
              }}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
            >
              <ImageIcon size={16} /> Import from Photos
            </button>
            <div className="h-px bg-gray-100 my-1" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                dataImportInputRef.current?.click();
                setShowImportMenu && setShowImportMenu(false);
              }}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
            >
              <FileJson size={16} /> Import from Data
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

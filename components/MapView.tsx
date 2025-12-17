
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, ImageOverlay, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Note, Coordinates, Project } from '../types';
import { MAP_TILE_URL, MAP_TILE_URL_FALLBACK, MAP_SATELLITE_URL, MAP_ATTRIBUTION, THEME_COLOR, THEME_COLOR_DARK, MAP_STYLE_OPTIONS } from '../constants';
import { Search, Locate, Loader2, X, Check, Satellite, Plus, Image as ImageIcon, FileJson } from 'lucide-react';
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
  navigateToCoords?: { lat: number; lng: number } | null;
  onNavigateComplete?: () => void;
  onSwitchToBoardView?: (coords?: { x: number; y: number }) => void;
  themeColor?: string;
  mapStyleId?: string;
}

const MapLongPressHandler = ({ onLongPress }: { onLongPress: (coords: Coordinates) => void }) => {
  const map = useMap();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number, y: number } | null>(null);
  const touchCountRef = useRef<number>(0);
  
  // Check if target element is a UI element or marker
  const isUIElement = (target: EventTarget | null): boolean => {
    if (!target || !(target instanceof Element)) return false;
    
    const element = target as HTMLElement;
    
    // Check if it's a Leaflet marker element
    if (element.classList.contains('leaflet-marker-icon') || 
        element.closest('.leaflet-marker-icon') ||
        element.classList.contains('custom-icon') ||
        element.closest('.custom-icon')) {
      return true;
    }
    
    // Check if it's an interactive element (button, input, select, textarea, etc.)
    const interactiveTags = ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A'];
    if (interactiveTags.includes(element.tagName)) {
      return true;
    }
    
    // Check if it's inside a UI container (by checking z-index or specific class names)
    let current: HTMLElement | null = element;
    while (current) {
      // Check if it has pointer-events-auto class (UI elements usually have this)
      if (current.classList.contains('pointer-events-auto')) {
        return true;
      }
      
      // Check if it's inside a high z-index container (UI elements are usually in z-[400] or z-[500] containers)
      const zIndex = window.getComputedStyle(current).zIndex;
      if (zIndex && (zIndex === '400' || zIndex === '500' || parseInt(zIndex) >= 400)) {
        return true;
      }
      
      // Check if it's inside a specific container
      if (current.id === 'map-view-container' && current !== element) {
        // If we've reached map-view-container, we're not in the UI layer
        break;
      }
      
      current = current.parentElement;
    }
    
    return false;
  };
  
  useEffect(() => {
    const container = map.getContainer();

    const handleStart = (e: TouchEvent | MouseEvent) => {
      if (e instanceof MouseEvent && e.button !== 0) return;
      
      // Check if clicked on UI element
      if (isUIElement(e.target)) {
        return;
      }
      
      // Clear any existing timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      
      // If multi-touch (pinch zoom), don't start long press timer
      if ('touches' in e) {
        touchCountRef.current = e.touches.length;
        if (e.touches.length > 1) {
          startPosRef.current = null;
          return;
        }
      } else {
        touchCountRef.current = 1;
      }
      
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      startPosRef.current = { x: clientX, y: clientY };

      timerRef.current = setTimeout(() => {
        // Check touch count again to prevent multi-touch during wait
        if (touchCountRef.current > 1) {
          timerRef.current = null;
          startPosRef.current = null;
          return;
        }
        
        // Check again if on UI element (prevent mouse moving to UI element during wait)
        if (document.elementFromPoint(clientX, clientY) && isUIElement(document.elementFromPoint(clientX, clientY))) {
          timerRef.current = null;
          startPosRef.current = null;
          return;
        }
        
        const rect = container.getBoundingClientRect();
        const relativeX = clientX - rect.left;
        const relativeY = clientY - rect.top;
        const latlng = map.containerPointToLatLng([relativeX, relativeY]);
        if (navigator.vibrate) navigator.vibrate(50);
        onLongPress(latlng);
        startPosRef.current = null;
        timerRef.current = null;
      }, 600); 
    };

    const handleMove = (e: TouchEvent | MouseEvent) => {
       if (!startPosRef.current || !timerRef.current) return;
       
       // Update touch count
       if ('touches' in e) {
         touchCountRef.current = e.touches.length;
       }
       
       // If becomes multi-touch (pinch zoom), cancel long press timer
       if ('touches' in e && e.touches.length > 1) {
         clearTimeout(timerRef.current);
         timerRef.current = null;
         startPosRef.current = null;
         return;
       }
       
       const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
       const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
       
       // Check if moved to UI element
       if (isUIElement(e.target) || (document.elementFromPoint(clientX, clientY) && isUIElement(document.elementFromPoint(clientX, clientY)))) {
         clearTimeout(timerRef.current);
         timerRef.current = null;
         startPosRef.current = null;
         return;
       }
       
       const dx = clientX - startPosRef.current.x;
       const dy = clientY - startPosRef.current.y;
       const dist = Math.sqrt(dx*dx + dy*dy);
       if (dist > 10) {
         clearTimeout(timerRef.current);
         timerRef.current = null;
         startPosRef.current = null;
       }
    };

    const handleEnd = (e?: TouchEvent | MouseEvent) => {
       // Update touch count
       if (e && 'touches' in e) {
         touchCountRef.current = e.touches.length;
       } else {
         touchCountRef.current = 0;
       }
       
       // If clicked on marker, don't clear timer (let marker click event handle it)
       if (e && isUIElement(e.target)) {
         // Marker click, don't handle long press logic
         // Clear timer immediately to prevent long press from firing
         if (timerRef.current) {
           clearTimeout(timerRef.current);
           timerRef.current = null;
         }
         startPosRef.current = null;
         return;
       }
       
       // For non-marker clicks, also check if we moved significantly
       // If we moved, it was a drag, not a click, so don't trigger long press
       if (e && startPosRef.current) {
         const clientX = 'touches' in e ? (e.touches.length > 0 ? e.touches[0].clientX : 0) : (e as MouseEvent).clientX;
         const clientY = 'touches' in e ? (e.touches.length > 0 ? e.touches[0].clientY : 0) : (e as MouseEvent).clientY;
         const dx = clientX - startPosRef.current.x;
         const dy = clientY - startPosRef.current.y;
         const dist = Math.sqrt(dx*dx + dy*dy);
         
         if (dist > 10) {
           // Moved significantly, it was a drag
           if (timerRef.current) {
             clearTimeout(timerRef.current);
             timerRef.current = null;
           }
           startPosRef.current = null;
           return;
         }
       }
       
       if (timerRef.current) {
         clearTimeout(timerRef.current);
         timerRef.current = null;
       }
       startPosRef.current = null;
    };

    container.addEventListener('touchstart', handleStart, { passive: true });
    container.addEventListener('mousedown', handleStart);
    container.addEventListener('touchmove', handleMove, { passive: true });
    container.addEventListener('mousemove', handleMove);
    container.addEventListener('touchend', (e) => handleEnd(e));
    container.addEventListener('mouseup', handleEnd);

    return () => {
      container.removeEventListener('touchstart', handleStart);
      container.removeEventListener('mousedown', handleStart);
      container.removeEventListener('touchmove', handleMove);
      container.removeEventListener('mousemove', handleMove);
      container.removeEventListener('touchend', handleEnd);
      container.removeEventListener('mouseup', handleEnd);
    };
  }, [map, onLongPress]);

  return null;
};

// Component to handle navigation to specific coordinates
const MapNavigationHandler = ({ coords, onComplete }: { coords: { lat: number; lng: number } | null; onComplete?: () => void }) => {
    const map = useMap();
  
  useEffect(() => {
    if (coords && map) {
      // Use maximum zoom (19) to avoid merging with other markers
      const targetZoom = 19;
      const targetCenter: [number, number] = [coords.lat, coords.lng];
      
      let animationCompleted = false;
      let moveEndHandler: (() => void) | null = null;
      
      // Small delay to ensure map is fully initialized before navigation
      const initTimeout = setTimeout(() => {
        // Use setView to ensure both center and zoom are set correctly with smooth animation
        map.setView(targetCenter, targetZoom, {
          animate: true,
          duration: 1.5 // Increased duration for smoother animation
        });
      }, 50);
      
      // Ensure center and zoom are correct after animation completes
      moveEndHandler = () => {
        if (animationCompleted) return;
        
        const currentCenter = map.getCenter();
        const currentZoom = map.getZoom();
        
        // Check if center is close enough (within 0.0001 degrees) and zoom is correct
        const latDiff = Math.abs(currentCenter.lat - targetCenter[0]);
        const lngDiff = Math.abs(currentCenter.lng - targetCenter[1]);
        
        if (latDiff <= 0.0001 && lngDiff <= 0.0001 && currentZoom >= targetZoom) {
          animationCompleted = true;
          if (moveEndHandler) {
            map.off('moveend', moveEndHandler);
          }
          onComplete?.();
        } else if (latDiff > 0.0001 || lngDiff > 0.0001 || currentZoom < targetZoom) {
          // Only correct if significantly off, but still animate
          map.setView(targetCenter, targetZoom, {
            animate: true,
            duration: 0.5
          });
        }
      };
      
      map.on('moveend', moveEndHandler);
      
      // Fallback: ensure center and zoom are correct after animation should complete
      const fallbackTimeout = setTimeout(() => {
        if (!animationCompleted) {
          const currentCenter = map.getCenter();
          const currentZoom = map.getZoom();
          const latDiff = Math.abs(currentCenter.lat - targetCenter[0]);
          const lngDiff = Math.abs(currentCenter.lng - targetCenter[1]);
          
          if (latDiff > 0.0001 || lngDiff > 0.0001 || currentZoom < targetZoom) {
            map.setView(targetCenter, targetZoom, {
              animate: false
            });
          }
          
          if (moveEndHandler) {
            map.off('moveend', moveEndHandler);
          }
          animationCompleted = true;
          onComplete?.();
        }
      }, 2000); // Increased timeout to match animation duration
      
      return () => {
        clearTimeout(initTimeout);
        if (moveEndHandler) {
          map.off('moveend', moveEndHandler);
        }
        clearTimeout(fallbackTimeout);
      };
    }
  }, [coords, map, onComplete]);
  
  return null;
};

const MapControls = ({ onImportPhotos, onImportData, mapStyle, onMapStyleChange, mapNotes, themeColor = THEME_COLOR }: { 
    onImportPhotos: () => void;
    onImportData: () => void;
    mapStyle: 'standard' | 'satellite';
    onMapStyleChange: (style: 'standard' | 'satellite') => void;
    mapNotes: Note[];
    themeColor?: string;
}) => {
    const map = useMap();
    const [showImportMenu, setShowImportMenu] = useState(false);
    const [showLocateMenu, setShowLocateMenu] = useState(false);
    const [showLocationError, setShowLocationError] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
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
    
    const checkLocationPermission = async (): Promise<string> => {
        // Check if Permissions API is available
        if ('permissions' in navigator) {
            try {
                const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
                return result.state; // 'granted', 'denied', or 'prompt'
            } catch (e) {
                // Permissions API might not support 'geolocation' name in some browsers
                return 'unknown';
            }
        }
        return 'unknown';
    };
    
    const getLocationErrorMessage = (error: any, permissionState?: string): string => {
        if (!error) {
            if (permissionState === 'denied') {
                return 'Location permission was denied. Please enable location access in your browser settings.';
            }
            return 'Unable to get your current location.';
        }
        
        const errorCode = error.code;
        
        // Check error codes
        if (errorCode === 1) { // PERMISSION_DENIED
            return 'Location permission was denied. Please enable location access in your browser settings and ensure your device location services are enabled.';
        } else if (errorCode === 2) { // POSITION_UNAVAILABLE
            return 'Location information is unavailable. Possible causes:\n• Device location services are disabled\n• GPS signal is weak or unavailable\n• You may be in a location where GPS cannot work (e.g., indoors, underground)';
        } else if (errorCode === 3) { // TIMEOUT
            return 'Location request timed out. This may happen if:\n• GPS signal is too weak\n• Location services are slow to respond\n• Network connectivity issues\n\nPlease try again or check your device location settings.';
        }
        
        // Check error message for additional clues
        const errorMessage = error.message || '';
        if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
            return 'Location request timed out. Please ensure your device location services are enabled and try again.';
        }
        if (errorMessage.includes('denied') || errorMessage.includes('permission')) {
            return 'Location permission issue. Please check:\n• Browser location permissions\n• Device location services (system settings)\n• Try refreshing the page and granting permission again';
        }
        if (errorMessage.includes('unavailable') || errorMessage.includes('not available')) {
            return 'Location is currently unavailable. Please check:\n• Device location services are enabled\n• GPS/Wi-Fi location is enabled\n• You are in an area with location coverage';
        }
        
        // Default error message
        return `Unable to get your current location. Error: ${errorMessage || 'Unknown error'}\n\nPlease check:\n• Browser location permissions\n• Device location services (system settings)\n• GPS signal strength\n• Network connectivity`;
    };
    
    const [locationErrorMessage, setLocationErrorMessage] = useState<string>('');
    
    const locateToCurrentPosition = async () => {
        // Check permission state first
        let permissionState: string = 'unknown';
        try {
            permissionState = await checkLocationPermission();
            console.log('Location permission state:', permissionState);
        } catch (e) {
            console.warn('Failed to check permission state:', e);
        }
        
        // Try locating with a fallback strategy for OPPO and other Android devices
        // Strategy: Try high accuracy first, then fallback to lower accuracy if it fails
        const tryLocate = (highAccuracy: boolean, timeoutMs: number, maxAge: number): Promise<void> => {
            return new Promise((resolve, reject) => {
                try {
                    const locationControl = map.locate({
                        setView: false,
                        watch: false,
                        enableHighAccuracy: highAccuracy,
                        timeout: timeoutMs,
                        maximumAge: maxAge
                    });
                    
                    const currentPermissionState = permissionState;
                    let resolved = false;
                    
                    const handleLocationFound = (e: L.LocationEvent) => {
                        if (resolved) return;
                        resolved = true;
                        console.log('Location found:', e.latlng, `(highAccuracy: ${highAccuracy})`);
            map.flyTo(e.latlng, 16);
                        // Clean up listeners
                        locationControl.off("locationfound", handleLocationFound);
                        locationControl.off("locationerror", handleLocationError);
                        resolve();
                    };
                    
                    const handleLocationError = (e: L.ErrorEvent) => {
                        if (resolved) return;
                        console.warn("Location error:", e, `(highAccuracy: ${highAccuracy})`);
                        console.warn("Error code:", e.code);
                        console.warn("Error message:", e.message);
                        
                        // Clean up listeners
                        locationControl.off("locationfound", handleLocationFound);
                        locationControl.off("locationerror", handleLocationError);
                        reject(e);
                    };
                    
                    locationControl.on("locationfound", handleLocationFound);
                    locationControl.on("locationerror", handleLocationError);
                } catch (error: any) {
                    reject(error);
                }
        });
    };
        
        // Try high accuracy first (for better precision)
        try {
            await tryLocate(true, 15000, 60000); // 15s timeout, allow 60s cached location
        } catch (firstError: any) {
            console.warn("High accuracy location failed, trying lower accuracy:", firstError);
            
            // Fallback to lower accuracy (better compatibility with OPPO and other Android devices)
            try {
                await tryLocate(false, 15000, 300000); // 15s timeout, allow 5min cached location
            } catch (secondError: any) {
                console.warn("Lower accuracy location also failed:", secondError);
                
                // Both attempts failed, show error message
                const finalError = secondError || firstError;
                checkLocationPermission().then(state => {
                    const errorMsg = getLocationErrorMessage(finalError, state || permissionState);
                    setLocationErrorMessage(errorMsg);
                    setShowLocationError(true);
                }).catch(() => {
                    const errorMsg = getLocationErrorMessage(finalError, permissionState);
                    setLocationErrorMessage(errorMsg);
                    setShowLocationError(true);
                });
            }
        }
    };
    
    const locateToLatestPin = () => {
        if (mapNotes.length > 0) {
            const latestNote = mapNotes[mapNotes.length - 1];
            map.flyTo([latestNote.coords.lat, latestNote.coords.lng], 16);
        }
    };
    
    // Close menus when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowImportMenu(false);
            }
            if (locateMenuRef.current && !locateMenuRef.current.contains(event.target as Node)) {
                setShowLocateMenu(false);
            }
        };
        if (showImportMenu || showLocateMenu) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [showImportMenu, showLocateMenu]);
    
    return (
        <div 
            className="flex flex-row gap-[6px] pointer-events-auto"
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
                    <div className="absolute left-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-[2000]">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                locateToCurrentPosition();
                                setShowLocateMenu(false);
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            onPointerMove={(e) => e.stopPropagation()}
                            onPointerUp={(e) => e.stopPropagation()}
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
                            onPointerDown={(e) => e.stopPropagation()}
                            onPointerMove={(e) => e.stopPropagation()}
                            onPointerUp={(e) => e.stopPropagation()}
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
            <div className="relative" ref={menuRef}>
                <button 
                    onClick={(e) => { 
                        e.stopPropagation(); 
                        setShowImportMenu(!showImportMenu);
                    }}
                    onPointerDown={(e) => {
                        e.stopPropagation();
                        e.currentTarget.style.backgroundColor = themeColor;
                    }}
                    onPointerUp={(e) => {
                        e.stopPropagation();
                        if (!showImportMenu) {
                            e.currentTarget.style.backgroundColor = '';
                        }
                    }}
                    onPointerMove={(e) => e.stopPropagation()}
                    onMouseEnter={(e) => {
                        if (!showImportMenu) {
                            e.currentTarget.style.backgroundColor = '#F3F4F6'; // gray-100
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (!showImportMenu) {
                            e.currentTarget.style.backgroundColor = '';
                        }
                    }}
                    className="bg-white p-2 sm:p-3 rounded-xl shadow-lg text-gray-700 transition-colors w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center"
                    title="Import"
                >
                    <svg width="18" height="18" className="sm:w-5 sm:h-5" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                        <path d="M8 11V5M5 8l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </button>
                {showImportMenu && (
                    <div className="absolute left-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-[2000]">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onImportPhotos();
                                setShowImportMenu(false);
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            onPointerMove={(e) => e.stopPropagation()}
                            onPointerUp={(e) => e.stopPropagation()}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
                        >
                            <ImageIcon size={16} /> Import from Photos
                        </button>
                        <div className="h-px bg-gray-100 my-1" />
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onImportData();
                                setShowImportMenu(false);
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            onPointerMove={(e) => e.stopPropagation()}
                            onPointerUp={(e) => e.stopPropagation()}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
                        >
                            <FileJson size={16} /> Import from Data
                        </button>
                    </div>
                )}
            </div>
            
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

const MapZoomController = ({min, max, step = 1}: {min: number, max: number, step?: number}) => {
    const map = useMap();
    const [zoom, setZoom] = useState(map.getZoom());
    useMapEvents({
        zoomend: () => setZoom(map.getZoom())
    });
    return (
      <ZoomSlider value={zoom} min={min} max={max} step={step} onChange={(val) => map.setZoom(val)} />
    );
};

// Ensure map is properly centered after initialization (only once)
const MapCenterHandler = ({ center, zoom }: { center: [number, number], zoom: number }) => {
    const map = useMap();
    const hasCenteredRef = useRef(false);
    
    useEffect(() => {
        // 只在首次初始化时执行一次
        if (hasCenteredRef.current || !map) return;
        
        // 等待地图完全初始化后再设置视图
        map.whenReady(() => {
            if (hasCenteredRef.current) return;
            
            // 使用 invalidateSize 确保地图尺寸正确
            map.invalidateSize();
            // 使用 setTimeout 确保在下一个事件循环中执行，此时容器尺寸应该已经正确
            setTimeout(() => {
                if (!hasCenteredRef.current) {
                    map.invalidateSize();
                    // 重新设置视图以确保居中（仅首次）
                    map.setView(center, zoom, { animate: false });
                    hasCenteredRef.current = true;
                }
            }, 0);
        });
    }, []); // 空依赖数组，只在组件挂载时执行一次
    
    return null;
};

export const MapView: React.FC<MapViewProps> = ({ project, onAddNote, onUpdateNote, onDeleteNote, onToggleEditor, onImportDialogChange, onUpdateProject, fileInputRef: externalFileInputRef, navigateToCoords, onNavigateComplete, onSwitchToBoardView, themeColor = THEME_COLOR, mapStyleId = 'carto-light-nolabels' }) => {
  if (!project) {
    return null;
  }
  const notes = project.notes;
  const [editingNote, setEditingNote] = useState<Partial<Note> | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
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
  
  // Image import related state
  const [importPreview, setImportPreview] = useState<Array<{
    file: File;
    imageUrl: string;
    lat: number;
    lng: number;
    error?: string;
    isDuplicate?: boolean;
    imageFingerprint?: string;
  }>>([]);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dataImportInputRef = useRef<HTMLInputElement>(null);
  
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
    
    // When clicking marker, always edit the passed note (for clustered markers, pass the bottommost one)
    console.log('Marker clicked:', note.id);
    setCurrentClusterNotes([]);
    setCurrentNoteIndex(0);
    setEditingNote(note);
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
    } else {
      // 新Note必须指定variant
      const fullNote: Note = {
        ...noteData,
        variant: noteData.variant || 'standard',
        isFavorite: noteData.isFavorite ?? false
      } as Note;
      onAddNote(fullNote);
    }
  };

  const closeEditor = () => {
      setIsEditorOpen(false);
      onToggleEditor(false);
      setEditingNote(null);
      setCurrentClusterNotes([]);
      setCurrentNoteIndex(0);
  };

  // Handle image import
  const handleImageImport = async (files: FileList | null, showLimitMessage = false) => {
    if (!files || files.length === 0) return;
    
    // Filter to include HEIC files
    const imageFiles = Array.from(files).filter((file: File) => 
      file.type.startsWith('image/') || 
      file.name.toLowerCase().endsWith('.heic') ||
      file.name.toLowerCase().endsWith('.heif')
    );
    
    const fileArray = imageFiles; // No limit on number of images
    const previews: Array<{
      file: File;
      imageUrl: string;
      lat: number;
      lng: number;
      error?: string;
      isDuplicate?: boolean;
      imageFingerprint?: string;
    }> = [];
    
    // 缓存已加载的图片数据，避免重复从 IndexedDB 读取
    const fingerprintCache = new Map<string, string>();

    for (const file of fileArray) {
      try {
        // IMPORTANT: Read EXIF data from original file FIRST (before any processing)
        // This is crucial for OPPO and other Android devices where gallery picker
        // may return processed files without EXIF, or HEIC conversion may lose EXIF
        let exifDataFromOriginal = null;
        let lat = null;
        let lng = null;
        
        // Try to read EXIF from original file first (before HEIC conversion)
        try {
          exifDataFromOriginal = await exifr.parse(file, {
            gps: true,
            translateKeys: false,
            translateValues: false,
            reviveValues: true,
            pick: ['GPSLatitude', 'GPSLongitude', 'GPSLatitudeRef', 'GPSLongitudeRef', 'latitude', 'longitude', 'GPS']
          });
          
          // If GPS not found, try full EXIF read
          if (!exifDataFromOriginal || (!exifDataFromOriginal.latitude && !exifDataFromOriginal.GPSLatitude && !exifDataFromOriginal.GPS)) {
            exifDataFromOriginal = await exifr.parse(file, {
              translateKeys: false,
              translateValues: false,
              reviveValues: true,
              pick: true as any
            });
          }
          
          // Extract GPS from original file if found
          if (exifDataFromOriginal) {
            if (exifDataFromOriginal.latitude !== undefined && exifDataFromOriginal.longitude !== undefined) {
              lat = Number(exifDataFromOriginal.latitude);
              lng = Number(exifDataFromOriginal.longitude);
            } else if (exifDataFromOriginal.GPSLatitude !== undefined && exifDataFromOriginal.GPSLongitude !== undefined) {
              lat = Number(exifDataFromOriginal.GPSLatitude);
              lng = Number(exifDataFromOriginal.GPSLongitude);
              if (exifDataFromOriginal.GPSLatitudeRef === 'S') lat = -lat;
              if (exifDataFromOriginal.GPSLongitudeRef === 'W') lng = -lng;
            } else if (exifDataFromOriginal.GPS) {
              if (exifDataFromOriginal.GPS.latitude !== undefined && exifDataFromOriginal.GPS.longitude !== undefined) {
                lat = Number(exifDataFromOriginal.GPS.latitude);
                lng = Number(exifDataFromOriginal.GPS.longitude);
              } else if (exifDataFromOriginal.GPS.GPSLatitude !== undefined && exifDataFromOriginal.GPS.GPSLongitude !== undefined) {
                lat = Number(exifDataFromOriginal.GPS.GPSLatitude);
                lng = Number(exifDataFromOriginal.GPS.GPSLongitude);
                if (exifDataFromOriginal.GPS.GPSLatitudeRef === 'S') lat = -lat;
                if (exifDataFromOriginal.GPS.GPSLongitudeRef === 'W') lng = -lng;
              }
            }
            
            if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
              console.log('GPS found in original file:', file.name, { lat, lng });
            }
          }
        } catch (originalExifError) {
          console.warn('Failed to read EXIF from original file:', originalExifError);
        }
        
        // Convert HEIC to JPEG if needed before processing
        let processedFile = file;
        const isHeic = file.type === 'image/heic' || 
                       file.type === 'image/heif' || 
                       file.name.toLowerCase().endsWith('.heic') ||
                       file.name.toLowerCase().endsWith('.heif');
        
        if (isHeic) {
          try {
            // Dynamically import heic2any to avoid issues with ESM/CommonJS
            const heic2anyModule = await import('heic2any');
            // heic2any can be exported as default or named export
            const heic2anyFn = (heic2anyModule as any).default || heic2anyModule;
            
            // Try multiple conversion methods for better compatibility with iPhone 15 Pro HEIF
            const conversionMethods = [
              { toType: 'image/jpeg', quality: 0.9, extension: '.jpg', mimeType: 'image/jpeg' },
              { toType: 'image/jpeg', quality: 0.8, extension: '.jpg', mimeType: 'image/jpeg' },
              { toType: 'image/png', quality: undefined, extension: '.png', mimeType: 'image/png' }
            ];
            
            let lastError: any = null;
            let converted = false;
            
            for (const method of conversionMethods) {
              try {
                const options: any = {
                  blob: file,
                  toType: method.toType
                };
                if (method.quality !== undefined) {
                  options.quality = method.quality;
                }
                
                const convertedBlob = await heic2anyFn(options);
                
                // heic2any returns an array, get the first item
                const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
                
                if (!blob) {
                  throw new Error('Conversion returned empty result');
                }
                
                // Create a new File object from the converted blob
                const newFileName = file.name.replace(/\.(heic|heif)$/i, method.extension);
                processedFile = new File([blob], newFileName, {
                  type: method.mimeType,
                  lastModified: file.lastModified
                });
                converted = true;
                break;
              } catch (error: any) {
                console.log(`HEIC conversion failed with ${method.toType} (quality: ${method.quality}):`, error);
                lastError = error;
                // Continue to next method
                continue;
              }
            }
            
            if (!converted) {
              // All conversion methods failed
              console.error('All HEIC conversion methods failed. Last error:', lastError);
              const errorMessage = lastError?.message || 'Unknown error';
              
              // Check for specific error types
              let userFriendlyError = `HEIC/HEIF 图片转换失败: ${errorMessage}\n\n请尝试将图片转换为 JPEG/PNG 格式后重试。`;
              if (errorMessage.includes('ERR_LIBHEIF') || errorMessage.includes('format not supported')) {
                userFriendlyError = `无法转换此 HEIC/HEIF 文件

可能原因：
• iPhone 15 Pro 等新设备使用了更新的 HEIF 格式
• 浏览器端转换库暂不支持此格式

解决方案（推荐按顺序尝试）：
1. 【最简单】在 iPhone 上更改设置：
   设置 > 相机 > 格式 > 选择"兼容性最佳"
   这样新照片会直接保存为 JPEG 格式

2. 使用 Mac 预览应用转换：
   打开图片 > 文件 > 导出 > 选择 JPEG 格式

3. 使用在线转换工具：
   • https://cloudconvert.com/heic-to-jpg
   • https://convertio.co/zh/heic-jpg/
   • https://heictojpeg.com/

4. 使用 App Store 中的转换应用

注意：这是浏览器端转换库的技术限制，不是应用的问题。`;
              }
              
              previews.push({
                file,
                imageUrl: URL.createObjectURL(file),
                lat: 0,
                lng: 0,
                error: userFriendlyError
              });
              continue;
            }
          } catch (error: any) {
            console.error('HEIC conversion failed:', error);
            const errorMessage = error?.message || 'Unknown error';
            previews.push({
              file,
              imageUrl: URL.createObjectURL(file),
              lat: 0,
              lng: 0,
              error: `HEIC/HEIF 图片转换失败: ${errorMessage}。请将图片转换为 JPEG/PNG 格式后重试。`
            });
            continue;
          }
        }
        
        // If GPS was already extracted from original file, use it
        // Otherwise, try reading from processed file (for cases where original file didn't have EXIF)
        let exifData = null;
        
        if (lat === null || lng === null) {
          // GPS not found in original file, try reading from processed file
          console.log('GPS not found in original file, trying processed file:', processedFile.name);
          
          // Read EXIF data with comprehensive options for better compatibility
          // Support multiple phone manufacturers (Xiaomi, OPPO, etc.)
          // For Android gallery picker, we need to read all EXIF segments
          exifData = await exifr.parse(processedFile, {
            gps: true,
            translateKeys: false,
            translateValues: false,
            reviveValues: true,
            pick: ['GPSLatitude', 'GPSLongitude', 'GPSLatitudeRef', 'GPSLongitudeRef', 'latitude', 'longitude', 'GPS']
          });
          
          // If GPS data not found, try reading all EXIF data without filters
          if (!exifData || (!exifData.latitude && !exifData.GPSLatitude && !exifData.GPS)) {
            console.log('GPS not found in primary parse, trying full EXIF read for:', processedFile.name);
            // Try reading with all segments enabled (important for Android gallery)
            exifData = await exifr.parse(processedFile, {
              translateKeys: false,
              translateValues: false,
              reviveValues: true,
              pick: true as any  // Read all EXIF segments
            });
            
            console.log('Full EXIF data for', processedFile.name, ':', exifData);
          }
          
          // If still no GPS data, try reading as ArrayBuffer (better for Android)
          if (!exifData || (!exifData.latitude && !exifData.GPSLatitude && !exifData.GPS)) {
            console.log('GPS still not found, trying ArrayBuffer read for:', processedFile.name);
            try {
              const arrayBuffer = await processedFile.arrayBuffer();
              exifData = await exifr.parse(arrayBuffer, {
                translateKeys: false,
                translateValues: false,
                reviveValues: true,
                pick: true as any
              });
              console.log('ArrayBuffer EXIF data for', processedFile.name, ':', exifData);
            } catch (arrayBufferError) {
              console.warn('ArrayBuffer read failed:', arrayBufferError);
            }
          }
          
          // Try multiple ways to extract GPS coordinates from processed file
          // Different manufacturers may store GPS data in different formats
          if (exifData) {
            // Method 1: Direct latitude/longitude (standard format, most common)
            if (exifData.latitude !== undefined && exifData.longitude !== undefined) {
              lat = Number(exifData.latitude);
              lng = Number(exifData.longitude);
            }
            // Method 2: GPSLatitude/GPSLongitude with ref (Xiaomi, some Android)
            else if (exifData.GPSLatitude !== undefined && exifData.GPSLongitude !== undefined) {
              lat = Number(exifData.GPSLatitude);
              lng = Number(exifData.GPSLongitude);
              // Apply reference (N/S, E/W)
              if (exifData.GPSLatitudeRef === 'S') lat = -lat;
              if (exifData.GPSLongitudeRef === 'W') lng = -lng;
            }
            // Method 3: GPS object (some formats)
            else if (exifData.GPS) {
              if (exifData.GPS.latitude !== undefined && exifData.GPS.longitude !== undefined) {
                lat = Number(exifData.GPS.latitude);
                lng = Number(exifData.GPS.longitude);
              } else if (exifData.GPS.GPSLatitude !== undefined && exifData.GPS.GPSLongitude !== undefined) {
                lat = Number(exifData.GPS.GPSLatitude);
                lng = Number(exifData.GPS.GPSLongitude);
                if (exifData.GPS.GPSLatitudeRef === 'S') lat = -lat;
                if (exifData.GPS.GPSLongitudeRef === 'W') lng = -lng;
              }
            }
            // Method 4: Try to parse from GPS array format [degrees, minutes, seconds]
            // Some manufacturers store GPS as arrays
            else if (exifData.GPSLatitude && Array.isArray(exifData.GPSLatitude)) {
              const latArray = exifData.GPSLatitude;
              const lngArray = exifData.GPSLongitude;
              if (latArray.length >= 3 && lngArray.length >= 3) {
                lat = latArray[0] + latArray[1] / 60 + latArray[2] / 3600;
                lng = lngArray[0] + lngArray[1] / 60 + lngArray[2] / 3600;
                if (exifData.GPSLatitudeRef === 'S') lat = -lat;
                if (exifData.GPSLongitudeRef === 'W') lng = -lng;
              }
            }
            // Method 5: Try alternative key names (case variations)
            else {
              const keys = Object.keys(exifData);
              const latKey = keys.find(k => k.toLowerCase().includes('lat') && !k.toLowerCase().includes('ref'));
              const lngKey = keys.find(k => k.toLowerCase().includes('lng') || (k.toLowerCase().includes('lon') && !k.toLowerCase().includes('ref')));
              
              if (latKey && lngKey) {
                lat = Number(exifData[latKey]);
                lng = Number(exifData[lngKey]);
                // Check for ref keys
                const latRefKey = keys.find(k => k.toLowerCase().includes('lat') && k.toLowerCase().includes('ref'));
                const lngRefKey = keys.find(k => (k.toLowerCase().includes('lng') || k.toLowerCase().includes('lon')) && k.toLowerCase().includes('ref'));
                if (latRefKey && exifData[latRefKey] === 'S') lat = -lat;
                if (lngRefKey && exifData[lngRefKey] === 'W') lng = -lng;
              }
            }
          }
        }
        
        // Validate coordinates
        if (lat === null || lng === null || isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
          console.warn('Could not extract GPS coordinates from:', processedFile.name);
          console.warn('File type:', processedFile.type);
          console.warn('File size:', processedFile.size);
          console.warn('Available EXIF keys:', exifData ? Object.keys(exifData) : 'No EXIF data');
          if (exifData) {
            console.warn('EXIF data sample:', JSON.stringify(exifData, null, 2).substring(0, 1000));
            // Log all GPS-related keys
            const gpsKeys = Object.keys(exifData).filter(k => 
              k.toLowerCase().includes('gps') || 
              k.toLowerCase().includes('lat') || 
              k.toLowerCase().includes('lon') || 
              k.toLowerCase().includes('lng')
            );
            console.warn('GPS-related keys:', gpsKeys);
            if (gpsKeys.length > 0) {
              gpsKeys.forEach(key => {
                console.warn(`  ${key}:`, exifData[key]);
              });
            }
          } else {
            console.warn('No EXIF data found at all');
          }
          previews.push({
            file: processedFile,
            imageUrl: URL.createObjectURL(processedFile),
            lat: 0,
            lng: 0,
            error: 'Missing location data'
          });
          continue;
        }
        
        // Calculate image fingerprint
        const imageUrl = URL.createObjectURL(processedFile);
        const imageFingerprint = await calculateImageFingerprint(processedFile, imageUrl, lat, lng);
        
        // Check if this image has already been imported (lightweight comparison, no filename)
        let isDuplicate = false;
        
        for (const note of notes) {
          if (!note.images || note.images.length === 0) continue;
          
          for (const existingImage of note.images) {
            try {
              let imageData = fingerprintCache.get(existingImage) || null;
              if (!imageData) {
                imageData = await getImageDataForFingerprint(existingImage);
                if (imageData) {
                  fingerprintCache.set(existingImage, imageData);
                }
              }
              if (!imageData) continue;

              const existingFingerprint = await calculateFingerprintFromBase64(imageData, note);
              
              // Debug: log fingerprints for comparison
              console.log('Comparing fingerprints:', {
                new: imageFingerprint,
                existing: existingFingerprint,
                match: imageFingerprint === existingFingerprint
              });
              
              if (imageFingerprint === existingFingerprint) {
                isDuplicate = true;
                console.log('Duplicate detected: exact fingerprint match');
                break;
              }
              
              // Fallback: compare by width and height only (without pixel)
              const currentParts = imageFingerprint.split('_');
              const existingParts = existingFingerprint.split('_');
              
              // Fingerprint format: lat_lng_topLeft_bottomLeft_bottomRight
              if (currentParts.length >= 2 && existingParts.length >= 2) {
                const currentBase = currentParts.slice(0, 2).join('_');
                const existingBase = existingParts.slice(0, 2).join('_');
                
                if (currentBase === existingBase) {
                  isDuplicate = true;
                  console.log('Duplicate detected: width and height match');
                  break;
                }
              }
            } catch (error) {
              console.error('Error comparing fingerprints:', error);
            }
          }
          if (isDuplicate) break;
        }
        
        previews.push({
          file: processedFile,
          imageUrl: imageUrl,
          lat: lat,
          lng: lng,
          isDuplicate: isDuplicate,
          imageFingerprint: imageFingerprint
        });
      } catch (error) {
        console.error('Error reading EXIF data from:', file.name, error);
        previews.push({
          file,
          imageUrl: URL.createObjectURL(file),
          lat: 0,
          lng: 0,
          error: 'Unable to read image or location data'
        });
      }
    }
    
    setImportPreview(previews);
    setShowImportDialog(true);
    onImportDialogChange?.(true);
    
    // If there's valid location data, fly to that position
    const validPreviews = previews.filter(p => !p.error);
    if (validPreviews.length > 0 && mapInstance) {
      const firstValid = validPreviews[0];
      mapInstance.flyTo([firstValid.lat, firstValid.lng], 16, { duration: 1.5 });
    }
  };

  // Confirm import
  const handleConfirmImport = async () => {
    // Filter out errors and duplicates
    const validPreviews = importPreview.filter(p => !p.error && !p.isDuplicate);
    const duplicateCount = importPreview.filter(p => !p.error && p.isDuplicate).length;
    
    // Calculate board position for imported notes (same logic as handleLongPress)
    const boardNotes = notes.filter(n => n.boardX !== undefined && n.boardY !== undefined);
    const noteWidth = 256; // Default width for standard notes
    const noteHeight = 256; // Default height for standard notes
    const spacing = 50;
    const aspectRatioThreshold = 8; // If width/height > 8, start a new row
    
    let spawnX = 100;
    let spawnY = 100;
    
    if (boardNotes.length > 0) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      
      boardNotes.forEach(note => {
        const existingNoteWidth = (note.variant === 'compact') ? 180 : 256;
        const existingNoteHeight = (note.variant === 'compact') ? 180 : 256;
        const noteLeft = note.boardX || 0;
        const noteRight = noteLeft + existingNoteWidth;
        const noteTop = note.boardY || 0;
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
          spawnX = minX;
          spawnY = maxY + spacing;
        } else {
          // Continue current row: add to the right, aligned to top
          spawnX = maxX + spacing;
          spawnY = minY;
        }
      } else {
        spawnX = 100;
        spawnY = 100;
      }
    } else {
      spawnX = 100;
      spawnY = 100;
    }
    
    for (let i = 0; i < validPreviews.length; i++) {
      const preview = validPreviews[i];
      try {
        // Convert image to base64 (with compression, HEIC already converted)
        const base64 = await fileToBase64(preview.file);
        
        // Calculate board position for this note (offset by index)
        const currentBoardX = spawnX + i * (noteWidth + spacing);
        const currentBoardY = spawnY;
        
        // Create new note
        const newNote: Note = {
          id: generateId(),
          text: '',
          coords: {
            lat: preview.lat,
            lng: preview.lng
          },
          images: [base64],
          createdAt: Date.now(),
          variant: 'standard',
          isFavorite: false,
          emoji: '',
          tags: [],
          fontSize: 3,
          boardX: currentBoardX,
          boardY: currentBoardY,
          groupName: undefined,
          groupId: undefined
        };
        
        onAddNote(newNote);
      } catch (error) {
        console.error('Failed to import image:', error);
      }
    }
    
    // Show message if there were duplicates
    if (duplicateCount > 0) {
      alert(`Successfully imported ${validPreviews.length} new image(s). ${duplicateCount} duplicate(s) were skipped.`);
    }
    
    // Clear preview
    importPreview.forEach(p => URL.revokeObjectURL(p.imageUrl));
    setImportPreview([]);
    setShowImportDialog(false);
    onImportDialogChange?.(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Cancel import
  const handleCancelImport = () => {
    importPreview.forEach(p => URL.revokeObjectURL(p.imageUrl));
    setImportPreview([]);
    setShowImportDialog(false);
    onImportDialogChange?.(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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

  const createCustomIcon = (note: Note, count?: number) => {
      const isFavorite = note.isFavorite === true;
      const scale = isFavorite ? 2 : 1;
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
            color: ${themeColor};
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
        // Show emoji, background is yellow
        content = `<span style="transform: rotate(45deg); font-size: 20px; line-height: 1; z-index: 1; position: relative;">${note.emoji}</span>`;
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
  // Increased from 25 to 40 for better clustering
  const CLUSTER_DISTANCE_THRESHOLD = 40;
  
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
  const detectClusters = useCallback((notes: Note[], map: L.Map, threshold: number = CLUSTER_DISTANCE_THRESHOLD): Array<{ notes: Note[], position: [number, number] }> => {
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
  }, [sortNotes, calculatePinDistance]);
  
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
          
          // Calculate clusters
          const clusters = detectClusters(mapNotes, currentMap);
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
  }, [mapInstance, mapNotes, isMapMode]);

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
    // Check if we're actually leaving the container (not just moving to a child element)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    // If the mouse is outside the container bounds, hide the drag overlay
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragging(false);
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    // Always hide drag overlay when drag ends (even if cancelled)
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
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
          style={{ backgroundColor: `${themeColor}33` }}
          onClick={() => setIsDragging(false)}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-8 border-4 pointer-events-none" style={{ borderColor: themeColor }}>
            <div className="text-center">
              <div className="mb-4 flex justify-center">
                <svg width="64" height="64" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-gray-700">
                  <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                  <path d="M8 11V5M5 8l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="text-xl font-bold text-gray-800">Drop images or JSON files here to import</div>
            </div>
          </div>
        </div>
      )}
      <MapContainer 
        key={project.id} 
        center={
          isMapMode 
            ? (mapNotes.length > 0 
                ? [mapNotes[mapNotes.length - 1].coords.lat, mapNotes[mapNotes.length - 1].coords.lng]
                : defaultCenter)
            : [0, 0]
        } 
        zoom={isMapMode ? 16 : -8}
        minZoom={isMapMode ? 6 : -20} 
        maxZoom={isMapMode ? 19 : 2}
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
                  // Force a view update to trigger tile loading
                  const center = map.getCenter();
                  const zoom = map.getZoom();
                  if (center && typeof center.lat === 'number' && typeof center.lng === 'number') {
                    map.setView(center, zoom, { animate: false });
                  }
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
            center={
              mapNotes.length > 0 
                ? [mapNotes[mapNotes.length - 1].coords.lat, mapNotes[mapNotes.length - 1].coords.lng]
                : defaultCenter
            } 
            zoom={16} 
          />
        )}
        
        {isMapMode && clusteredMarkers.length > 0 ? (
          // Show clustered markers (only show clusters with multiple markers, single markers shown separately)
          clusteredMarkers.map((cluster, index) => {
            if (cluster.notes.length === 1) {
              // Single marker, display directly
              const note = cluster.notes[0];
              return (
          <Marker 
            key={note.id} 
            position={[note.coords.lat, note.coords.lng]}
                  icon={createCustomIcon(note)}
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
              // Multiple markers, show cluster
              return (
                <Marker 
                  key={`cluster-${index}`}
                  position={cluster.position}
                  icon={createCustomIcon(cluster.notes[0], cluster.notes.length)}
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
          isMapMode && mapNotes.map(note => (
            <Marker 
              key={note.id} 
              position={[note.coords.lat, note.coords.lng]}
              icon={createCustomIcon(note)}
              eventHandlers={{ 
                click: (e) => {
                  e.originalEvent?.stopPropagation();
                  e.originalEvent?.stopImmediatePropagation();
                  handleMarkerClick(note, e);
                }
              }}
            />
          ))
        )}

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
          <div className="absolute top-2 sm:top-4 left-2 sm:left-4 right-2 sm:right-4 z-[500] flex gap-1.5 sm:gap-2 pointer-events-none items-start">
              <MapControls 
                onImportPhotos={() => fileInputRef.current?.click()} 
                onImportData={() => dataImportInputRef.current?.click()}
                mapStyle={mapStyle}
                onMapStyleChange={(style) => setLocalMapStyle(style)}
                mapNotes={mapNotes}
                themeColor={themeColor}
              />
              <div 
                  className="flex-1 max-w-md relative group pointer-events-auto"
                  onPointerDown={(e) => {
                      e.stopPropagation();
                      e.stopImmediatePropagation();
                  }}
                  onPointerMove={(e) => {
                      e.stopPropagation();
                      e.stopImmediatePropagation();
                  }}
                  onPointerUp={(e) => {
                      e.stopPropagation();
                      e.stopImmediatePropagation();
                  }}
                  onPointerCancel={(e) => {
                      e.stopPropagation();
                      e.stopImmediatePropagation();
                  }}
                  onMouseDown={(e) => {
                      e.stopPropagation();
                      e.stopImmediatePropagation();
                  }}
                  onMouseMove={(e) => {
                      e.stopPropagation();
                      e.stopImmediatePropagation();
                  }}
                  onMouseUp={(e) => {
                      e.stopPropagation();
                      e.stopImmediatePropagation();
                  }}
                  onTouchStart={(e) => {
                      e.stopPropagation();
                      e.stopImmediatePropagation();
                  }}
                  onTouchMove={(e) => {
                      e.stopPropagation();
                      e.stopImmediatePropagation();
                  }}
                  onTouchEnd={(e) => {
                      e.stopPropagation();
                      e.stopImmediatePropagation();
                  }}
                  onDoubleClick={(e) => {
                      e.stopPropagation();
                      e.stopImmediatePropagation();
                  }}
              >
                  <div 
                      className="bg-white rounded-xl shadow-lg flex items-center px-4 transition-shadow focus-within:shadow-xl relative z-10"
                      onPointerDown={(e) => {
                          e.stopPropagation();
                          e.stopImmediatePropagation();
                      }}
                      onPointerMove={(e) => {
                          e.stopPropagation();
                          e.stopImmediatePropagation();
                      }}
                      onPointerUp={(e) => {
                          e.stopPropagation();
                          e.stopImmediatePropagation();
                      }}
                      onMouseDown={(e) => {
                          e.stopPropagation();
                          e.stopImmediatePropagation();
                      }}
                      onMouseMove={(e) => {
                          e.stopPropagation();
                          e.stopImmediatePropagation();
                      }}
                      onMouseUp={(e) => {
                          e.stopPropagation();
                          e.stopImmediatePropagation();
                      }}
                      onTouchStart={(e) => {
                          e.stopPropagation();
                          e.stopImmediatePropagation();
                      }}
                      onTouchMove={(e) => {
                          e.stopPropagation();
                          e.stopImmediatePropagation();
                      }}
                      onTouchEnd={(e) => {
                          e.stopPropagation();
                          e.stopImmediatePropagation();
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
                              e.stopImmediatePropagation();
                          }}
                          onPointerMove={(e) => {
                              e.stopPropagation();
                              e.stopImmediatePropagation();
                          }}
                          onPointerUp={(e) => {
                              e.stopPropagation();
                              e.stopImmediatePropagation();
                          }}
                          onMouseDown={(e) => {
                              e.stopPropagation();
                              e.stopImmediatePropagation();
                          }}
                          onMouseMove={(e) => {
                              e.stopPropagation();
                              e.stopImmediatePropagation();
                          }}
                          onMouseUp={(e) => {
                              e.stopPropagation();
                              e.stopImmediatePropagation();
                          }}
                          onTouchStart={(e) => {
                              e.stopPropagation();
                              e.stopImmediatePropagation();
                          }}
                          onTouchMove={(e) => {
                              e.stopPropagation();
                              e.stopImmediatePropagation();
                          }}
                          onTouchEnd={(e) => {
                              e.stopPropagation();
                              e.stopImmediatePropagation();
                          }}
                      />
                      {isSearching && <Loader2 size={18} className="text-yellow-500 animate-spin" />}
                  </div>
                  {searchResults.length > 0 && (
                      <div 
                          className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 border border-gray-100"
                          onPointerDown={(e) => {
                              e.stopPropagation();
                              e.stopImmediatePropagation();
                          }}
                          onPointerMove={(e) => {
                              e.stopPropagation();
                              e.stopImmediatePropagation();
                          }}
                          onPointerUp={(e) => {
                              e.stopPropagation();
                              e.stopImmediatePropagation();
                          }}
                          onMouseDown={(e) => {
                              e.stopPropagation();
                              e.stopImmediatePropagation();
                          }}
                          onMouseMove={(e) => {
                              e.stopPropagation();
                              e.stopImmediatePropagation();
                          }}
                          onMouseUp={(e) => {
                              e.stopPropagation();
                              e.stopImmediatePropagation();
                          }}
                          onTouchStart={(e) => {
                              e.stopPropagation();
                              e.stopImmediatePropagation();
                          }}
                          onTouchMove={(e) => {
                              e.stopPropagation();
                              e.stopImmediatePropagation();
                          }}
                          onTouchEnd={(e) => {
                              e.stopPropagation();
                              e.stopImmediatePropagation();
                          }}
                      >
                          {searchResults.map((result: any, i) => (
                              <button
                                  key={i}
                                  onClick={(e) => {
                                      e.stopPropagation();
                                      e.stopImmediatePropagation();
                                      selectSearchResult(result);
                                  }}
                                  onPointerDown={(e) => {
                                      e.stopPropagation();
                                      e.stopImmediatePropagation();
                                  }}
                                  onPointerMove={(e) => {
                                      e.stopPropagation();
                                      e.stopImmediatePropagation();
                                  }}
                                  onPointerUp={(e) => {
                                      e.stopPropagation();
                                      e.stopImmediatePropagation();
                                  }}
                                  onMouseDown={(e) => {
                                      e.stopPropagation();
                                      e.stopImmediatePropagation();
                                  }}
                                  onMouseMove={(e) => {
                                      e.stopPropagation();
                                      e.stopImmediatePropagation();
                                  }}
                                  onMouseUp={(e) => {
                                      e.stopPropagation();
                                      e.stopImmediatePropagation();
                                  }}
                                  onTouchStart={(e) => {
                                      e.stopPropagation();
                                      e.stopImmediatePropagation();
                                  }}
                                  onTouchMove={(e) => {
                                      e.stopPropagation();
                                      e.stopImmediatePropagation();
                                  }}
                                  onTouchEnd={(e) => {
                                      e.stopPropagation();
                                      e.stopImmediatePropagation();
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
             step={isMapMode ? 1 : 0.1}
           />
        </div>

      </MapContainer>
      
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
            onSwitchToBoardView={onSwitchToBoardView}
        />
      )}

      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
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
    </div>
  );
};


import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, ImageOverlay, GeoJSON, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

const MapClickHandler = ({ onClick }: { onClick: () => void }) => {
  useMapEvents({
    click: () => {
      onClick();
    },
  });
  return null;
};
import { Note, Coordinates, Project, Frame } from '../types';
import { MAP_TILE_URL, MAP_TILE_URL_FALLBACK, MAP_SATELLITE_URL, MAP_ATTRIBUTION, THEME_COLOR, THEME_COLOR_DARK, MAP_STYLE_OPTIONS } from '../constants';
import { searchRegionBoundaries, fetchRelationGeometry, OverpassElement } from '../utils/overpass';
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
import { MapMarkers } from './map/MapMarkers';
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
import { Search, Locate, Loader2, X, Check, Satellite, Plus, Image as ImageIcon, FileJson, Type, Layers, Settings, Globe, ChevronLeft, ChevronRight, Copy, Edit3, Save } from 'lucide-react';
import exifr from 'exifr';
import { NoteEditor } from './NoteEditor';
import { generateId, fileToBase64 } from '../utils';
import { loadImage } from '../utils/storage';
import { ZoomSlider } from './ZoomSlider';
import { ImportPreviewDialog } from './ImportPreviewDialog';

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
  showBorderPanel?: boolean;
  setShowBorderPanel?: (show: boolean) => void;
  borderGeoJSON?: any | null;
  setBorderGeoJSON?: (data: any | null) => void;
  onMapClick?: () => void;
  isUIVisible?: boolean;
}

// MapLongPressHandler moved to components/map/MapLongPressHandler.tsx



// Component to block map container from receiving pointer events in capture phase

export const MapView: React.FC<MapViewProps> = ({ project, onAddNote, onUpdateNote, onDeleteNote, onToggleEditor, onImportDialogChange, onUpdateProject, fileInputRef: externalFileInputRef, navigateToCoords, projectId, onNavigateComplete, onSwitchToBoardView, themeColor = THEME_COLOR, mapStyleId = 'carto-light-nolabels', onMapStyleChange, showImportMenu, setShowImportMenu, showBorderPanel, setShowBorderPanel, borderGeoJSON, setBorderGeoJSON, onMapClick, isUIVisible = true }) => {
  if (!project) {
    return null;
        }
  const notes = project.notes;
  const [editingNote, setEditingNote] = useState<Partial<Note> | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [preSelectedNotes, setPreSelectedNotes] = useState<Note[] | null>(null);
  const [currentPreviewImageIndex, setCurrentPreviewImageIndex] = useState(0);
  const selectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedNote = useMemo(() => 
    selectedNoteId ? notes.find(n => n.id === selectedNoteId) : null
  , [selectedNoteId, notes]);

  // Reset index when selected note changes
  useEffect(() => {
    setCurrentPreviewImageIndex(0);
  }, [selectedNoteId]);

  // Clear selection when exiting preview mode
  useEffect(() => {
    if (isUIVisible) {
      setSelectedNoteId(null);
      setPreSelectedNotes(null);
      setCurrentPreviewImageIndex(0);
    }
  }, [isUIVisible]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (selectionTimerRef.current) {
        clearTimeout(selectionTimerRef.current);
      }
    };
  }, []);

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
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const mapInitRef = useRef<WeakSet<L.Map>>(new WeakSet());
  
  const [imageDimensions, setImageDimensions] = useState<[number, number] | null>(null);
  const [minImageZoom, setMinImageZoom] = useState(-20);
  
  // Marker clustering related state
  const [clusteredMarkers, setClusteredMarkers] = useState<Array<{ notes: Note[], position: [number, number] }>>([]);
  const [currentNoteIndex, setCurrentNoteIndex] = useState(0);
  const [currentClusterNotes, setCurrentClusterNotes] = useState<Note[]>([]);
  

  
  
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
  

  // Text labels display mode
  const [showTextLabels, setShowTextLabels] = useState(false);

  // Shortcut key T to toggle text labels
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't toggle if user is typing in an input or textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      if (e.key.toLowerCase() === 't' && !isEditorOpen) {
        setShowTextLabels(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditorOpen]);

    // Pin size control
    const [pinSize, setPinSize] = useState(1.0); // Scale factor for pin size

  // Cluster threshold control
  const [clusterThreshold, setClusterThreshold] = useState(40); // Distance threshold for clustering

  // Frame description editing state
  const [editingFrameDescription, setEditingFrameDescription] = useState<string | null>(null);

  // Settings panel
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);

  // Location error retry tracking
  const [hasRetriedLocation, setHasRetriedLocation] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  // Border feature local states
  const [borderSearchQuery, setBorderSearchQuery] = useState('');
  const [borderSearchResults, setBorderSearchResults] = useState<any[]>([]);
  const [isSearchingBorder, setIsSearchingBorder] = useState(false);
  const [borderSearchError, setBorderSearchError] = useState<string | null>(null);
  const [borderSearchMode, setBorderSearchMode] = useState<'region' | 'place'>('region');
  
  // Ghost note state for search results
  const [pendingPlaceNote, setPendingPlaceNote] = useState<{
    coords: { lat: number, lng: number },
    name: string
  } | null>(null);

  const handleBorderSearch = async () => {
    if (!borderSearchQuery.trim()) return;
    
    setIsSearchingBorder(true);
    setBorderSearchError(null);
    setBorderSearchResults([]);
    
    try {
      const query = borderSearchQuery.trim();
      // Use dynamic limit and address details
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=15&addressdetails=1${borderSearchMode === 'region' ? '&featuretype=settlement,boundary,territory' : ''}`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Search failed');
      const results = await response.json();
      
      if (results.length === 0) {
        setBorderSearchError('No matching results found');
      } else {
        // Sort results to prioritize relations and ways for region mode
        const sortedResults = borderSearchMode === 'region'
          ? [...results].sort((a, b) => {
              const score = (item: any) => (item.osm_type === 'relation' ? 2 : item.osm_type === 'way' ? 1 : 0);
              return score(b) - score(a);
            })
          : results;
        setBorderSearchResults(sortedResults);
      }
    } catch (err) {
      console.error('Search failed:', err);
      setBorderSearchError('Search failed, please try again');
    } finally {
      setIsSearchingBorder(false);
    }
  };

  const handleSelectBorder = async (result: any) => {
    setIsSearchingBorder(true);
    try {
      if (borderSearchMode === 'place' || result.osm_type === 'node') {
        // For places or nodes, just fly to the location
        const lat = parseFloat(result.lat);
        const lon = parseFloat(result.lon);
        const placeName = result.display_name.split(',')[0];

        if (mapInstance) {
          mapInstance.flyTo([lat, lon], 17, { duration: 1.5 });
        }

        // Check if a note already exists at this approximate location (within ~10m)
        const isDuplicate = notes.some(n => 
          Math.abs(n.coords.lat - lat) < 0.0001 && 
          Math.abs(n.coords.lng - lon) < 0.0001
        );

        if (!isDuplicate) {
          setPendingPlaceNote({ lat, lng: lon, name: placeName });
        }
      } else {
        // For regions, fetch geometry and draw border
        const geojson = await fetchRelationGeometry(result.osm_id, result.osm_type);
        if (setBorderGeoJSON) {
          setBorderGeoJSON(geojson);
        }
        
        // Auto-zoom to the border
        if (mapInstance && geojson) {
          const L = await import('leaflet');
          const layer = L.default.geoJSON(geojson);
          mapInstance.fitBounds(layer.getBounds(), { padding: [20, 20], duration: 1.5 });
        }
      }
      
      // Close panel after selection
      if (setShowBorderPanel) setShowBorderPanel(false);
      setBorderSearchResults([]);
      setBorderSearchQuery('');
    } catch (err) {
      console.error('Search interaction failed:', err);
      setBorderSearchError('Failed to fetch details');
    } finally {
      setIsSearchingBorder(false);
    }
  };

  const handleConvertPendingToNote = () => {
    if (!pendingPlaceNote) return;

    const newNote: Note = {
      id: generateId(),
      coords: { lat: pendingPlaceNote.lat, lng: pendingPlaceNote.lng },
      text: pendingPlaceNote.name,
      emoji: '📍',
      fontSize: 3,
      images: [],
      tags: [],
      variant: 'standard',
      createdAt: Date.now(),
      boardX: 0,
      boardY: 0
    };

    onAddNote(newNote);
    setPendingPlaceNote(null);
  };

  const handleToggleBorderPanel = () => {
    if (setShowBorderPanel) setShowBorderPanel(!showBorderPanel);
  };

  const handleCopyBorder = async () => {
    if (!borderGeoJSON) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(borderGeoJSON));
      alert('Border GeoJSON copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy border:', err);
      alert('Failed to copy border to clipboard');
    }
  };

  
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
    setLocationError,
    requestLocation,
    getCurrentBrowserLocation,
    checkLocationPermission
  } = useGeolocation(isMapMode);

  // Auto-hide location error after 2 seconds
  useEffect(() => {
    if (locationError) {
      const timer = setTimeout(() => {
        // We can't directly set locationError to null since it's managed by the hook
        // Instead, we'll trigger a new location request to clear the error state
        setHasRetriedLocation(false);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [locationError]);

  // Enhanced location request with auto-retry and navigation
  const handleLocateCurrentPosition = useCallback(async () => {
    try {
      setIsLocating(true);
      setHasRetriedLocation(false);
      setLocationError(null); // Clear any previous errors
      console.log('Requesting current location...');

      // Request location
      await requestLocation();

      // Wait a bit for the location to be set, then navigate
      setTimeout(() => {
        if (currentLocation && mapInstance) {
          console.log('Location obtained, navigating to:', currentLocation);
          mapInstance.flyTo([currentLocation.lat, currentLocation.lng], 16, {
            duration: 1.5
          });
        } else {
          console.warn('Location not available after request');
        }
        setIsLocating(false);
      }, 500); // Increased timeout for mobile devices

    } catch (error) {
      console.log('Location request failed, trying retry...');
      // If first attempt fails and we haven't retried yet, try again
      if (!hasRetriedLocation) {
        setHasRetriedLocation(true);
        // Wait a moment before retry
        setTimeout(async () => {
          try {
            await requestLocation();
            // If retry succeeds, navigate
            setTimeout(() => {
              if (currentLocation && mapInstance) {
                console.log('Location obtained after retry, navigating to:', currentLocation);
                mapInstance.flyTo([currentLocation.lat, currentLocation.lng], 16, {
                  duration: 1.5
                });
              }
              setIsLocating(false);
            }, 500);
          } catch (retryError) {
            // If retry also fails, show error notification
            console.error('Location request failed after retry:', retryError);
            setIsLocating(false);
          }
        }, 1000); // Wait 1 second before retry
      } else {
        console.error('Location request failed:', error);
        setIsLocating(false);
      }
    }
  }, [requestLocation, hasRetriedLocation, currentLocation, mapInstance]);

  // Check if camera is available
  const isCameraAvailable = () => {
    return location.protocol === 'https:' ||
           location.hostname === 'localhost' ||
           location.hostname === '127.0.0.1' &&
           navigator.mediaDevices &&
           navigator.mediaDevices.getUserMedia;
  };

  // Camera import functionality
  const handleImportFromCamera = async () => {
    try {
      // Check if we're on HTTPS (required for camera access)
      if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        throw new Error('Camera access requires HTTPS. Please access this site over HTTPS or use localhost for development.');
      }

      // Check if camera API is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API is not supported in this browser. Please use a modern browser with camera support.');
      }

      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' } // Use back camera if available
      });

      // Create video element to capture from camera
      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();

      // Wait for video to be ready
      await new Promise((resolve) => {
        video.onloadedmetadata = resolve;
      });

      // Create canvas to capture frame
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }

      // Capture frame
      ctx.drawImage(video, 0, 0);

      // Stop camera
      stream.getTracks().forEach(track => track.stop());

      // Convert to blob
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else throw new Error('Failed to convert canvas to blob');
        }, 'image/jpeg', 0.8);
      });

      // Get current location
      const userLocation = await getCurrentBrowserLocation();
      if (!userLocation) {
        throw new Error('Unable to get current location');
      }

      // Create note with captured image
      const imageFile = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const base64 = await fileToBase64(imageFile);

      const newNote: Note = {
        id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        coords: { lat: userLocation.lat, lng: userLocation.lng },
        text: '',
        emoji: '📷',
        fontSize: 3,
        images: [base64],
        tags: [],
        variant: 'image',
        createdAt: Date.now(),
        boardX: 0,
        boardY: 0
      };

      // Add the note
      onAddNote(newNote);

      // Optional: Fly to the new location
      if (mapInstance) {
        mapInstance.flyTo([userLocation.lat, userLocation.lng], 16);
      }

    } catch (error) {
      console.error('Failed to import from camera:', error);
      alert(`相机导入失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

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

  // Map layers management hook
  const {
    frameLayerVisibility,
    setFrameLayerVisibility,
    showAllFrames,
    setShowAllFrames,
    showFrameLayerPanel,
    setShowFrameLayerPanel,
    frameLayerRef,
    getFilteredNotes
  } = useMapLayers({
    notes,
    projectFrames: project.frames
  });

  // Find single selected frame for description panel
  const activeFrame = useMemo(() => {
    if (showAllFrames || !project.frames) return null;
    const visibleFrameIds = Object.entries(frameLayerVisibility)
      .filter(([_, visible]) => visible)
      .map(([id, _]) => id);
    
    if (visibleFrameIds.length === 1) {
      return project.frames.find(f => f.id === visibleFrameIds[0]) || null;
    }
    return null;
  }, [showAllFrames, project.frames, frameLayerVisibility]);

  // Reset frame description editing state when active frame changes
  useEffect(() => {
    setEditingFrameDescription(null);
  }, [activeFrame?.id]);

  const handleSaveFrameDescription = async () => {
    if (!activeFrame || editingFrameDescription === null) return;
    
    const updatedFrames = project.frames?.map(f => 
      f.id === activeFrame.id ? { ...f, description: editingFrameDescription } : f
    ) || [];
    
    await onUpdateProject?.({
      ...project,
      frames: updatedFrames
    });
    setEditingFrameDescription(null);
  };

  // Map styling management hook
  const {
    mapStyle,
    effectiveMapStyle,
    localMapStyle,
    setLocalMapStyle,
    handleLocalMapStyleChange,
    handleMapStyleChange,
    tileLayerConfig
  } = useMapStyling({
    mapStyleId,
    onMapStyleChange
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

    // 预览模式下的特殊交互处理
    if (!isUIVisible) {
      if (selectionTimerRef.current) {
        clearTimeout(selectionTimerRef.current);
        selectionTimerRef.current = null;
      }
      
      setPreSelectedNotes(null);
      // 点击点位显示 label，隐藏其他 label
      if (selectedNoteId === note.id) {
        setSelectedNoteId(null);
      } else {
        setSelectedNoteId(null);
        // 延迟设置新选中点，确保“先恢复”的视觉效果或逻辑
        selectionTimerRef.current = setTimeout(() => {
          setSelectedNoteId(note.id);
          selectionTimerRef.current = null;
        }, 50);
      }
      return;
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
    
    // 预览模式下点击集合点也恢复状态
    if (!isUIVisible) {
      if (selectionTimerRef.current) {
        clearTimeout(selectionTimerRef.current);
        selectionTimerRef.current = null;
      }
      setSelectedNoteId(null);
      // 预选中集合中的所有点
      setPreSelectedNotes(clusterNotes);
      return;
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

  const handleMapClickInternal = useCallback(() => {
    if (!isUIVisible) {
      if (selectionTimerRef.current) {
        clearTimeout(selectionTimerRef.current);
        selectionTimerRef.current = null;
      }
      setSelectedNoteId(null);
      setPreSelectedNotes(null);
    }
    if (pendingPlaceNote) {
      setPendingPlaceNote(null);
    }
    if (onMapClick) {
      onMapClick();
    }
  }, [pendingPlaceNote, onMapClick, isUIVisible]);
  
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
        <MapClickHandler onClick={handleMapClickInternal} />
        {isMapMode ? (
               <TileLayer 
                 key={effectiveMapStyle}
            {...tileLayerConfig}
                 maxNativeZoom={19}
                 maxZoom={19}
                 tileSize={256}
                 zoomOffset={0}
               />
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
        
        <MapLongPressHandler onLongPress={handleLongPress} isPreviewMode={!isUIVisible} />

        {pendingPlaceNote && (
          <Marker
            position={[pendingPlaceNote.lat, pendingPlaceNote.lng]}
            icon={L.divIcon({
              className: 'custom-pending-marker',
              html: `
                <div class="flex flex-col items-center">
                  <div style="
                    background-color: white;
                    padding: 6px 12px;
                    border-radius: 12px;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.15);
                    border: 2px solid ${themeColor};
                    white-space: nowrap;
                    font-size: 14px;
                    font-weight: 600;
                    color: #1f2937;
                    cursor: pointer;
                    animation: bounce-in 0.3s ease-out;
                  ">
                    ${pendingPlaceNote.name}
                  </div>
                  <div style="
                    width: 0;
                    height: 0;
                    border-left: 6px solid transparent;
                    border-right: 6px solid transparent;
                    border-top: 6px solid ${themeColor};
                  "></div>
                </div>
                <style>
                  @keyframes bounce-in {
                    0% { transform: scale(0.3); opacity: 0; }
                    70% { transform: scale(1.05); opacity: 1; }
                    100% { transform: scale(1); }
                  }
                </style>
              `,
              iconSize: [120, 40],
              iconAnchor: [60, 40]
            })}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e);
                handleConvertPendingToNote();
              }
            }}
          />
        )}

        {isMapMode && borderGeoJSON && (
          <GeoJSON 
            data={borderGeoJSON} 
            style={{ 
              color: themeColor, 
              weight: 3, 
              opacity: 0.8,
              fillColor: themeColor,
              fillOpacity: 0.1,
              dashArray: '5, 10'
            }} 
          />
        )}
        
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
            clusteredMarkers={clusteredMarkers}
            selectedNoteId={selectedNoteId}
            preSelectedNotes={preSelectedNotes}
            isPreviewMode={!isUIVisible}
            onSelectNote={(noteId) => {
              const note = notes.find(n => n.id === noteId);
              if (note) {
                setPreSelectedNotes(null);
                setSelectedNoteId(noteId);
              }
            }}
            onClearSelection={() => {
              setPreSelectedNotes(null);
              setSelectedNoteId(null);
            }}
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
          <div className="fixed top-20 left-4 right-4 z-[1000] bg-red-50 border border-red-200 rounded-lg p-3 shadow-lg animate-in slide-in-from-top-2 fade-in duration-300">
            <div className="flex items-start gap-2">
              <div className="text-red-500 mt-0.5">📍</div>
              <div className="flex-1">
                <p className="text-sm text-red-800 font-medium">位置服务不可用</p>
                <p className="text-xs text-red-600 mt-1 whitespace-pre-line">{locationError}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => handleLocateCurrentPosition()}
                    disabled={isLocating}
                    className="px-3 py-1 bg-red-100 hover:bg-red-200 disabled:bg-gray-100 disabled:cursor-not-allowed text-red-700 text-xs rounded transition-colors flex items-center gap-1"
                  >
                    {isLocating ? <Loader2 size={12} className="animate-spin" /> : null}
                    重试
                  </button>
                  <button
                    onClick={() => {
                      // 手动清除错误状态并停止定位
                      setLocationError(null);
                      setHasRetriedLocation(false);
                      setIsLocating(false);
                    }}
                    className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded transition-colors"
                  >
                    关闭
                  </button>
                </div>
              </div>
              <button
                onClick={() => {
                  // 关闭按钮：清除所有相关状态
                  setLocationError(null);
                  setHasRetriedLocation(false);
                  setIsLocating(false);
                }}
                className="text-red-500 hover:text-red-700 p-1 hover:bg-red-100 rounded-full transition-colors"
                aria-label="关闭位置错误提示"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}
        
        {isMapMode && clusteredMarkers.length > 0 && mapInstance ? (
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
                  zIndexOffset={note.isFavorite ? 200 : 0}
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
                  zIndexOffset={cluster.notes.some(note => note.isFavorite) ? 200 : 0}
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
              zIndexOffset={note.isFavorite ? 200 : 0}
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
        {isMapMode && showImportDialog && importPreview.filter(p => !p.error && p.lat !== null && p.lng !== null).map((preview, index) => (
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

        {isMapMode && (isUIVisible || !isUIVisible) && (
          <div className="absolute top-2 sm:top-4 left-2 sm:left-4 right-2 sm:right-4 z-[500] flex flex-col gap-2 pointer-events-none">
              {/* First Row: Main Controls */}
              <div className="flex justify-between items-start w-full pointer-events-none">
                {isUIVisible ? (
                  <MapControls 
                    onLocateCurrentPosition={handleLocateCurrentPosition}
                    isLocating={isLocating}
                    mapStyle={mapStyle}
                    onMapStyleChange={handleLocalMapStyleChange}
                    mapNotes={getFilteredNotes}
                    themeColor={themeColor}
                    showTextLabels={showTextLabels}
                    setShowTextLabels={setShowTextLabels}
                    pinSize={pinSize}
                    setPinSize={setPinSize}
                    clusterThreshold={clusterThreshold}
                    setClusterThreshold={setClusterThreshold}
                    onOpenSettings={() => setShowSettingsPanel(true)}
                  />
                ) : (
                  <div />
                )}

                {/* Top Right Spacer */}
                <div />
              </div>

              {/* Second Row: Sliders (hidden on small screens, available in settings) */}
              {isUIVisible && (
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
              )}
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

        {isUIVisible && (
          <div className="fixed bottom-20 sm:bottom-24 left-2 sm:left-4 z-[500]">
             <MapZoomController
               min={isMapMode ? 13 : minImageZoom}
               max={isMapMode ? 19 : 4}
               themeColor={themeColor}
             />
          </div>
        )}

      </MapContainer>

      {/* Border & Frame Layer Buttons - Top Right */}
      {isMapMode && (isUIVisible || !isUIVisible) && (
        <div
          className="fixed top-2 sm:top-4 right-2 sm:right-4 z-[500] pointer-events-auto flex items-center gap-1.5 sm:gap-2"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Border Button & Panel */}
          <div className="relative">
            <button
              onClick={handleToggleBorderPanel}
              className={`bg-white p-2 sm:p-3 rounded-xl shadow-lg transition-all w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center ${
                showBorderPanel ? 'text-white' : 'text-gray-700'
              } hover:scale-105 active:scale-95`}
              style={{ backgroundColor: showBorderPanel ? themeColor : undefined }}
              title="Search Region or Place"
            >
              <Search size={18} className="sm:w-5 sm:h-5" />
            </button>

            {/* Border Search Panel */}
            {showBorderPanel && (
              <div
                className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 z-[2000] animate-in fade-in slide-in-from-top-4"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-gray-800">Map Search</h3>
                  <div className="flex items-center gap-2">
                    {borderGeoJSON && (
                      <>
                        <button
                          onClick={handleCopyBorder}
                          className="p-1.5 rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100 transition-colors border border-gray-100"
                          title="Copy Border GeoJSON"
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          onClick={() => setBorderGeoJSON?.(null)}
                          className="text-[10px] font-bold px-2 py-1 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors border border-red-100"
                        >
                          Clear Border
                        </button>
                      </>
                    )}
                    <button onClick={() => setShowBorderPanel?.(false)} className="text-gray-400 hover:text-gray-600">
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {/* Mode Switcher Capsule */}
                <div className="flex p-1 bg-gray-100 rounded-xl mb-4 relative overflow-hidden">
                  <div 
                    className="absolute inset-y-1 rounded-lg bg-white shadow-sm transition-all duration-200"
                    style={{ 
                      width: 'calc(50% - 4px)',
                      left: borderSearchMode === 'region' ? '4px' : 'calc(50%)'
                    }}
                  />
                  <button
                    onClick={() => setBorderSearchMode('region')}
                    className={`flex-1 py-1.5 text-xs font-bold relative z-10 transition-colors ${
                      borderSearchMode === 'region' ? 'text-gray-800' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Region Border
                  </button>
                  <button
                    onClick={() => setBorderSearchMode('place')}
                    className={`flex-1 py-1.5 text-xs font-bold relative z-10 transition-colors ${
                      borderSearchMode === 'place' ? 'text-gray-800' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Place
                  </button>
                </div>

                <div className="flex gap-2 mb-3">
                  <div className="relative flex-1">
                    <input
                      autoFocus
                      type="text"
                      placeholder={borderSearchMode === 'region' ? "Search region (e.g. London)" : "Search place (e.g. Cafe)"}
                      value={borderSearchQuery}
                      onChange={(e) => setBorderSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleBorderSearch()}
                      className="w-full pl-3 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                    {isSearchingBorder && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2">
                        <Loader2 size={14} className="animate-spin text-gray-400" />
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleBorderSearch}
                    disabled={isSearchingBorder || !borderSearchQuery.trim()}
                    className="px-3 py-2 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50"
                    style={{ backgroundColor: themeColor }}
                  >
                    Search
                  </button>
                </div>

                {borderSearchError && (
                  <div className="text-xs text-red-500 mb-3 px-1">{borderSearchError}</div>
                )}

                {borderSearchResults.length > 0 && (
                  <div className="max-h-60 overflow-y-auto border-results-list pr-1">
                    <style>{`
                      .border-results-list::-webkit-scrollbar {
                        width: 4px;
                      }
                      .border-results-list::-webkit-scrollbar-track {
                        background: transparent;
                      }
                      .border-results-list::-webkit-scrollbar-thumb {
                        background: ${themeColor}44;
                        border-radius: 10px;
                      }
                      .border-results-list::-webkit-scrollbar-thumb:hover {
                        background: ${themeColor}88;
                      }
                    `}</style>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">Select a region:</div>
                    <div className="space-y-1">
                      {borderSearchResults.map((result: any) => (
                        <button
                          key={`${result.osm_type}-${result.osm_id}`}
                          onClick={() => handleSelectBorder(result)}
                          className="w-full text-left p-2.5 hover:bg-gray-50 rounded-xl transition-colors border border-transparent hover:border-gray-100 flex flex-col gap-0.5"
                        >
                          <div className="text-sm font-medium text-gray-800 flex items-baseline gap-1 flex-wrap">
                            <span>{result.display_name.split(',')[0]}</span>
                            {(() => {
                              const addr = result.address;
                              const self = result.display_name.split(',')[0].trim();
                              const parts = result.display_name.split(',').map((p: string) => p.trim());
                              
                              // 1. Try to find parent from address object with wide range of keys
                              let parent = addr?.city || addr?.town || addr?.village || 
                                           addr?.municipality || addr?.county || 
                                           addr?.state_district || addr?.city_district ||
                                           addr?.suburb || addr?.neighbourhood || addr?.state;

                              // 2. If parent is same as self or missing, fallback to display_name parts
                              if (!parent || parent === self) {
                                // Find the first part that isn't the name itself, isn't a number (zip), and isn't "China"
                                parent = parts.find((p: string) => 
                                  p !== self && 
                                  !/^\d+$/.test(p) && 
                                  p !== '中国' && 
                                  p !== 'China'
                                );
                              }
                              
                              if (parent && parent !== self) {
                                return (
                                  <span className="text-xs text-gray-400 font-normal italic">
                                    , {parent}
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {(isUIVisible || !isUIVisible) && (
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
                <div className="absolute right-0 top-full flex gap-2 items-start pointer-events-none mt-2">
                  {/* Frame Description Panel */}
                  {activeFrame && (
                    <div 
                      className="w-72 sm:w-80 bg-white rounded-xl shadow-xl border border-gray-100 flex flex-col pointer-events-auto overflow-hidden animate-in fade-in slide-in-from-right-4"
                      style={{ maxHeight: '60vh' }}
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <div className="p-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: activeFrame.color }} />
                          <h3 className="font-bold text-gray-800 truncate text-xs">{activeFrame.title}</h3>
                        </div>
                        {editingFrameDescription === null ? (
                          <button 
                            onClick={() => setEditingFrameDescription(activeFrame.description || '')}
                            className="p-1 hover:bg-gray-200 rounded transition-colors text-gray-500"
                            title="Edit Description"
                          >
                            <Edit3 size={12} />
                          </button>
                        ) : (
                          <button 
                            onClick={handleSaveFrameDescription}
                            className="p-1 hover:bg-green-100 text-green-600 rounded transition-colors"
                            title="Save Description"
                          >
                            <Save size={12} />
                          </button>
                        )}
                      </div>
                      
                      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar bg-white">
                        {editingFrameDescription !== null ? (
                          <textarea
                            autoFocus
                            value={editingFrameDescription}
                            onChange={(e) => setEditingFrameDescription(e.target.value)}
                            className="w-full h-full min-h-[100px] bg-transparent border-none focus:ring-0 p-0 text-xs text-gray-800 placeholder-gray-400 resize-none"
                            placeholder="Add a description for this layer..."
                          />
                        ) : (
                          <div className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap break-words">
                            {activeFrame.description || (
                              <span className="text-gray-400 italic">No description added yet. Click edit icon.</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Frame List Panel */}
                  <div
                    className="w-56 bg-white rounded-xl shadow-xl border border-gray-100 py-2 pointer-events-auto shrink-0"
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
                        {project.frames?.map((frame) => (
                    <div 
                      key={frame.id} 
                      className="px-3 py-2 flex items-center justify-between hover:bg-gray-50 cursor-pointer group"
                      onClick={(e) => {
                        e.stopPropagation();
                        const isMulti = e.ctrlKey || e.metaKey || e.shiftKey;
                        if (isMulti) {
                          setFrameLayerVisibility(prev => ({
                            ...prev,
                            [frame.id]: !prev[frame.id]
                          }));
                        } else {
                          const newVisibility: Record<string, boolean> = {};
                          project.frames?.forEach(f => {
                            newVisibility[f.id] = f.id === frame.id;
                          });
                          setFrameLayerVisibility(newVisibility);
                        }
                      }}
                    >
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
                        readOnly
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        className={`w-4 h-4 rounded border-2 cursor-pointer appearance-none pointer-events-none ${
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
                </div>
              )}
            </div>
          )}
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

      {/* 预览模式选中展示面板 */}
      {!isUIVisible && selectedNote && (
        <div 
          className="fixed top-4 left-4 z-[1000] w-72 sm:w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-in slide-in-from-left-8 duration-500 ease-out pointer-events-auto flex flex-col"
          style={{ maxHeight: 'calc(100vh - 2rem)' }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-4 pb-2 flex items-start justify-between gap-3 border-b border-gray-100 shrink-0">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              {selectedNote.emoji && (
                <span className="text-2xl mt-0.5 shrink-0">{selectedNote.emoji}</span>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold text-gray-900 leading-tight line-clamp-2 break-words">
                  {(selectedNote.text || '').split('\n')[0].trim() || 'Untitled Note'}
                </h3>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {/* 文字内容 - 第一个回车后的内容作为正文 */}
            {selectedNote.text && (() => {
              const firstNewlineIndex = selectedNote.text.indexOf('\n');
              if (firstNewlineIndex === -1) return null;
              
              const displayDetailText = selectedNote.text.substring(firstNewlineIndex).trim();
              if (!displayDetailText) return null;

              return (
                <div className="px-4 py-3 text-gray-800 text-sm leading-relaxed whitespace-pre-wrap break-words border-b border-gray-50 bg-gray-50/30">
                  {displayDetailText}
                </div>
              );
            })()}

            {/* Large Image with Navigation */}
            {(() => {
              const allImages = [...(selectedNote.images || [])];
              if (selectedNote.sketch) allImages.push(selectedNote.sketch);
              
              if (allImages.length === 0) return null;

              return (
                <div className="relative group aspect-[4/3] bg-gray-100 flex items-center justify-center shrink-0">
                  <img
                    src={allImages[currentPreviewImageIndex]}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                  
                  {/* Navigation Arrows */}
                  {allImages.length > 1 && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentPreviewImageIndex(prev => (prev - 1 + allImages.length) % allImages.length);
                        }}
                        className="absolute left-2 p-1.5 bg-black/30 hover:bg-black/50 text-white rounded-full transition-colors backdrop-blur-sm"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentPreviewImageIndex(prev => (prev + 1) % allImages.length);
                        }}
                        className="absolute right-2 p-1.5 bg-black/30 hover:bg-black/50 text-white rounded-full transition-colors backdrop-blur-sm"
                      >
                        <ChevronRight size={18} />
                      </button>
                      
                      {/* Indicator dots */}
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1 px-2 py-1 bg-black/20 backdrop-blur-md rounded-full">
                        {allImages.map((_, idx) => (
                          <div
                            key={idx}
                            className={`w-1 h-1 rounded-full transition-all ${
                              idx === currentPreviewImageIndex ? 'bg-white w-2' : 'bg-white/40'
                            }`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
          </div>
          
          <style>{`
            .custom-scrollbar::-webkit-scrollbar {
              width: 4px;
            }
            .custom-scrollbar::-webkit-scrollbar-track {
              background: transparent;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb {
              background: #E5E7EB;
              border-radius: 10px;
            }
          `}</style>
        </div>
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
                    {!preview.error && preview.lat !== null && preview.lng !== null && (
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
        onMapStyleChange={handleMapStyleChange}
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
            {isCameraAvailable() ? (
              <>
                <div className="h-px bg-gray-100 my-1" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleImportFromCamera();
                    setShowImportMenu && setShowImportMenu(false);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
                >
                  <Plus size={16} /> Import from Camera
                </button>
              </>
            ) : (
              <>
                <div className="h-px bg-gray-100 my-1" />
                <div className="px-4 py-2.5 text-xs text-gray-500 flex items-center gap-2">
                  <Plus size={16} className="opacity-50" />
                  <span>Camera requires HTTPS</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

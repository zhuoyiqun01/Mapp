import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, GeoJSON, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { set } from 'idb-keyval';
import { Search, Locate, Loader2, X, Satellite, Plus, Image as ImageIcon, FileJson, Type, Settings, Globe } from 'lucide-react';

import { Note, Coordinates, Project, Frame } from '../types';
import { MAP_TILE_URL, MAP_TILE_URL_FALLBACK, MAP_SATELLITE_URL, MAP_ATTRIBUTION, THEME_COLOR, THEME_COLOR_DARK, MAP_STYLE_OPTIONS } from '../constants';
import { useMapPosition } from '@/components/hooks/useMapPosition';
import { useGeolocation } from '@/components/hooks/useGeolocation';
import { useImageImport } from '@/components/hooks/useImageImport';
import { useMapLayers } from '@/components/hooks/useMapLayers';
import { useMapStyling } from '@/components/hooks/useMapStyling';
import { useCameraImport } from '@/components/hooks/useCameraImport';
import { useBorderSearch } from '@/components/hooks/useBorderSearch';
import { useMapClustering } from '@/components/hooks/useMapClustering';
import { useMapInitialization } from '@/components/hooks/useMapInitialization';
import { useNotePositioning } from '@/components/hooks/useNotePositioning';
import { useDataImport } from '@/components/hooks/useDataImport';
import { useFileDrop } from '@/components/hooks/useFileDrop';
import { MapLongPressHandler } from './map/MapLongPressHandler';
import { MapNavigationHandler } from './map/MapNavigationHandler';
import { TextLabelsLayer } from './map/TextLabelsLayer';
import { MapPositionTracker } from './map/MapPositionTracker';
import { MapCenterHandler } from './map/MapCenterHandler';
import { MapZoomController } from './map/MapZoomController';
import { MapControls } from './map/MapControls';
import { MapSearchPanel } from './map/controls/MapSearchPanel';
import { MapLayerControl } from './map/controls/MapLayerControl';
import { NotePreviewCard } from './map/overlays/NotePreviewCard';
import { ClusterMarkerLayer } from './map/layers/ClusterMarkerLayer';
import { MapClickHandler } from './map/MapClickHandler';
import { SettingsPanel } from './SettingsPanel';
import { CustomHorizontalSlider } from './ui/CustomHorizontalSlider';
import { parseNoteContent } from '../utils';
import exifr from 'exifr';
import { NoteEditor } from './NoteEditor';
import { generateId } from '../utils';
import { hexToRgb, isPhotoTakenRecently } from '../utils/mapUtils';
import { calculateImageFingerprint, calculateFingerprintFromBase64 } from '../utils/imageProcessing';
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
  fileInputRef?: React.RefObject<HTMLInputElement | null>;
}

export const MapView: React.FC<MapViewProps> = ({ project, onAddNote, onUpdateNote, onDeleteNote, onToggleEditor, onImportDialogChange, onUpdateProject, fileInputRef: externalFileInputRef, navigateToCoords, projectId, onNavigateComplete, onSwitchToBoardView, themeColor = THEME_COLOR, mapStyleId = 'carto-light-nolabels', onMapStyleChange, showImportMenu, setShowImportMenu, showBorderPanel, setShowBorderPanel, borderGeoJSON, setBorderGeoJSON, onMapClick, isUIVisible = true }) => {
  if (!project) return null;
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

  const { mapInstance, mapRefCallback } = useMapInitialization();

  // Marker clustering related state (reserved for future use)
  
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

  // 当关闭全局 label 开关时，同时收起当前已展开/选中的 labels
  useEffect(() => {
    if (!showTextLabels) {
      setPreSelectedNotes(null);
      setSelectedNoteId(null);
    }
  }, [showTextLabels]);

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

  // Current marker index being viewed

  const defaultCenter: [number, number] = [28.1847, 112.9467];
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
  } = useGeolocation(true);

  const { handleImportFromCamera, isCameraAvailable } = useCameraImport({
    getCurrentBrowserLocation,
    mapInstance,
    onAddNote
  });

  const borderSearchState = useBorderSearch({
    mapInstance,
    notes,
    onAddNote,
    setBorderGeoJSON,
    setShowBorderPanel
  });
  const { pendingPlaceNote, setPendingPlaceNote, handleConvertPendingToNote } = borderSearchState;

  const handleToggleBorderPanel = () => {
    if (setShowBorderPanel) setShowBorderPanel(!showBorderPanel);
  };

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

  // Map position management hook
  const { initialMapPosition, handleMapPositionChange } = useMapPosition({
    isMapMode: true,
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

  const { handleDataImport } = useDataImport({ project, onUpdateProject });
  const { computeBoardPosition } = useNotePositioning(notes);
  const { isDragging, rootProps, dismissDropZone } = useFileDrop({
    isEditorOpen,
    themeColor,
    handleImageImport,
    handleDataImport
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

  const { clusteredMarkers, sortNotes } = useMapClustering({
    mapInstance,
    getFilteredNotes: () => getFilteredNotes,
    clusterThreshold
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


  const handleLongPress = useCallback(
    (coords: Coordinates) => {
      const { boardX, boardY } = computeBoardPosition();
      const newNote: Partial<Note> = {
        id: generateId(),
        createdAt: Date.now(),
        coords,
        fontSize: 3,
        emoji: '',
        text: '',
        images: [],
        tags: [],
        variant: 'standard',
        isFavorite: false,
        color: '#FFFDF5',
        boardX,
        boardY
      };
      setEditingNote(newNote);
      setIsEditorOpen(true);
      onToggleEditor(true);
    },
    [computeBoardPosition, onToggleEditor]
  );

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

    // 普通地图模式：第一次点击 pin 只展开当前点对应的 label（或 label 组），不直接打开编辑器
    setPreSelectedNotes([note]);
    setSelectedNoteId(note.id);
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

    if (!isUIVisible) {
      // 预览模式：点击集合点时，仅在地图上展开该簇的标签
      if (selectionTimerRef.current) {
        clearTimeout(selectionTimerRef.current);
        selectionTimerRef.current = null;
      }
      setSelectedNoteId(null);
      setPreSelectedNotes(sortedClusterNotes);
      return;
    }

    // 正常地图模式：点击集合点时，仅展开该簇内的 labels，由 TextLabelsLayer 处理二次点击
    setSelectedNoteId(null);
    setPreSelectedNotes(sortedClusterNotes);
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
  };


  const handleMapClickInternal = useCallback((e: L.LeafletMouseEvent) => {
    // 若点击的是展开的 label（或 label 组），不要清空选择，让 TextLabelsLayer 的 onSelectNote 处理
    const target = e.originalEvent?.target as HTMLElement;
    if (target?.closest?.('.pre-selected-labels-container') || target?.closest?.('.pre-selected-label-item')) {
      return;
    }
    if (!isUIVisible) {
      if (selectionTimerRef.current) {
        clearTimeout(selectionTimerRef.current);
        selectionTimerRef.current = null;
      }
      setSelectedNoteId(null);
      setPreSelectedNotes(null);
    } else {
      setPreSelectedNotes(null);
      setSelectedNoteId(null);
    }
    if (pendingPlaceNote) {
      setPendingPlaceNote(null);
    }
    if (onMapClick) {
      onMapClick();
    }
  }, [pendingPlaceNote, onMapClick, isUIVisible]);

  return (
    <div
      id="map-view-container"
      className={`relative w-full h-full z-0 bg-gray-100 ${rootProps.className}`}
      style={rootProps.style}
      onDragEnter={rootProps.onDragEnter}
      onDragOver={rootProps.onDragOver}
      onDragLeave={rootProps.onDragLeave}
      onDrop={rootProps.onDrop}
      onDragEnd={rootProps.onDragEnd}
    >
      {isDragging && (
        <div 
          className="absolute inset-0 z-[4000] backdrop-blur-sm flex items-center justify-center pointer-events-auto"
          style={{ backgroundColor: isEditorOpen ? '#3B82F633' : `${themeColor}33` }}
          onClick={dismissDropZone}
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
        center={initialMapPosition?.center || defaultCenter}
        zoom={initialMapPosition?.zoom ?? 16}
        minZoom={6}
        maxZoom={19}
        zoomSnap={0.1}
        zoomDelta={0.1}
        crs={L.CRS.EPSG3857}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        ref={mapRefCallback}
        doubleClickZoom={false}
      >
        <MapNavigationHandler coords={navigateToCoords} onComplete={onNavigateComplete} />
        <MapPositionTracker onPositionChange={handleMapPositionChange} />
        <MapClickHandler onClick={handleMapClickInternal} />
        <TileLayer 
          key={effectiveMapStyle}
          {...tileLayerConfig}
          maxNativeZoom={19}
          maxZoom={19}
          tileSize={256}
          zoomOffset={0}
        />
        
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

        {borderGeoJSON && (
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
        
        <MapCenterHandler 
          center={initialMapPosition?.center || defaultCenter}
          zoom={initialMapPosition?.zoom ?? 16}
        />
        
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
            if (!note) return;

            setPreSelectedNotes(null);
            setSelectedNoteId(noteId);

            // 预览模式下仅高亮/预览，不打开编辑器
            if (!isUIVisible) {
              return;
            }

            // 正常地图模式下，二次点击 label 打开对应 NoteEditor
            setEditingNote(note);
            setIsEditorOpen(true);
            onToggleEditor(true);
          }}
          onClearSelection={() => {
            setPreSelectedNotes(null);
            setSelectedNoteId(null);
          }}
        />

        {/* User Location Indicator - only show if location permission is granted */}
        {hasLocationPermission && currentLocation && mapInstance && (
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
        {locationError && (
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
        
        <ClusterMarkerLayer
          clusteredMarkers={clusteredMarkers}
          fallbackNotes={getFilteredNotes}
          showTextLabels={showTextLabels}
          pinSize={pinSize}
          themeColor={themeColor}
          mapInstance={mapInstance}
          onMarkerClick={handleMarkerClick}
          onClusterClick={handleClusterClick}
        />

        {/* Import preview markers */}
        {showImportDialog && importPreview.filter(p => !p.error && p.lat !== null && p.lng !== null).map((preview, index) => (
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

        {(isUIVisible || !isUIVisible) && (
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
               min={13}
               max={19}
               themeColor={themeColor}
             />
          </div>
        )}

      </MapContainer>

      {/* Border & Frame Layer Buttons - Top Right */}
      {(isUIVisible || !isUIVisible) && (
        <div
          className="fixed top-2 sm:top-4 right-2 sm:right-4 z-[500] pointer-events-auto flex items-center gap-1.5 sm:gap-2"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <MapSearchPanel
            isOpen={!!showBorderPanel}
            onToggle={handleToggleBorderPanel}
            themeColor={themeColor}
            borderSearch={borderSearchState}
            borderGeoJSON={borderGeoJSON}
            onClearBorder={() => setBorderGeoJSON?.(null)}
            onClose={() => setShowBorderPanel?.(false)}
          />
          <MapLayerControl
            showPanel={showFrameLayerPanel}
            onTogglePanel={() => setShowFrameLayerPanel(!showFrameLayerPanel)}
            themeColor={themeColor}
            frames={project.frames}
            frameLayerVisibility={frameLayerVisibility}
            setFrameLayerVisibility={setFrameLayerVisibility}
            showAllFrames={showAllFrames}
            setShowAllFrames={setShowAllFrames}
            activeFrame={activeFrame}
            editingFrameDescription={editingFrameDescription}
            setEditingFrameDescription={setEditingFrameDescription}
            onSaveFrameDescription={handleSaveFrameDescription}
            frameLayerRef={frameLayerRef}
          />
        </div>
      )}
      
      {isEditorOpen && (
        <NoteEditor 
          isOpen={isEditorOpen}
          onClose={closeEditor}
          onSave={handleSaveNote}
          onDelete={onDeleteNote}
          initialNote={editingNote || {}}
          onSwitchToBoardView={(coords) => onSwitchToBoardView(coords, mapInstance)}
          themeColor={themeColor}
        />
      )}

      {/* 预览模式选中展示面板 */}
      {!isUIVisible && selectedNote && (
        <NotePreviewCard
          note={selectedNote}
          currentImageIndex={currentPreviewImageIndex}
          onImageIndexChange={setCurrentPreviewImageIndex}
        />
      )}

      {/* 隐藏的文件输入 */}
      <input
        ref={(el) => {
          (fileInputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
          if (externalFileInputRef) (externalFileInputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
        }}
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

      <ImportPreviewDialog
        isOpen={showImportDialog}
        importPreview={importPreview}
        themeColor={themeColor}
        onConfirm={handleConfirmImport}
        onCancel={handleCancelImport}
        showCoordinates={true}
      />

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

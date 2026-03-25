import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, GeoJSON, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { set } from 'idb-keyval';

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
import { useCsvImport } from '@/components/hooks/useCsvImport';
import { MapLongPressHandler } from './map/MapLongPressHandler';
import { MapNavigationHandler } from './map/MapNavigationHandler';
import { TextLabelsLayer } from './map/TextLabelsLayer';
import { MapPositionTracker } from './map/MapPositionTracker';
import { MapCenterHandler } from './map/MapCenterHandler';
import { MapControls } from './map/MapControls';
import { MapSearchPanel } from './map/controls/MapSearchPanel';
import { MapLayerControl } from './map/controls/MapLayerControl';
import { NotePreviewCard } from './map/overlays/NotePreviewCard';
import { MapLocationErrorBanner } from './map/overlays/MapLocationErrorBanner';
import { MapImportMenuModal } from './map/overlays/MapImportMenuModal';
import { MapTopRightEditToggle } from './map/overlays/MapTopRightEditToggle';
import { MapToolbarSliders } from './map/overlays/MapToolbarSliders';
import { MapPreviewTopRightToolbar } from './map/overlays/MapPreviewTopRightToolbar';
import { ClusterMarkerLayer } from './map/layers/ClusterMarkerLayer';
import { MapClickHandler } from './map/MapClickHandler';
import { MapShiftBoxSelect } from './map/MapShiftBoxSelect';
import { MapConnectionLinesOverlay } from './map/MapConnectionLinesOverlay';
import { SettingsPanel } from './SettingsPanel';
import { ChromeIconButton } from './ui/ChromeIconButton';
import { parseNoteContent } from '../utils';
import exifr from 'exifr';
import { NoteEditor } from './NoteEditor';
import { generateId } from '../utils';
import { hexToRgb, isPhotoTakenRecently } from '../utils/map/mapUtils';
import { calculateImageFingerprint, calculateFingerprintFromBase64 } from '../utils/media/imageProcessing';
import { loadImage } from '../utils/persistence/storage';
import { ImportPreviewDialog } from './ImportPreviewDialog';
import { buildMapTabExportPayload } from '../utils/map/mapTabExportPayload';
import { buildStandaloneMapTabHtml } from '../utils/map/mapTabExportHtml';
import { downloadTextFile } from '../utils/graph/graphExportHtml';
import {
  mapChromeSurfaceStyle,
  mapChromeHoverBackground,
  DEFAULT_MAP_UI_CHROME_OPACITY,
  DEFAULT_MAP_UI_CHROME_BLUR_PX
} from '../utils/map/mapChromeStyle';

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
  onThemeColorChange?: (color: string) => void;
  mapUiChromeOpacity?: number;
  mapUiChromeBlurPx?: number;
  onMapUiChromeOpacityChange?: (opacity: number) => void;
  onMapUiChromeBlurPxChange?: (blurPx: number) => void;
  isRouteMode?: boolean;
  setIsRouteMode?: (v: boolean) => void;
  waypoints?: Note[];
  setWaypoints?: (w: Note[]) => void;
  /** 与 App 中「界面外观」一致的面板玻璃样式（设置、编辑器等） */
  panelChromeStyle?: React.CSSProperties;
}

export const MapView: React.FC<MapViewProps> = ({
  project,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onToggleEditor,
  onImportDialogChange,
  onUpdateProject,
  fileInputRef: externalFileInputRef,
  navigateToCoords,
  projectId,
  onNavigateComplete,
  onSwitchToBoardView,
  themeColor = THEME_COLOR,
  mapStyleId = 'carto-light-nolabels',
  onMapStyleChange,
  showImportMenu,
  setShowImportMenu,
  showBorderPanel,
  setShowBorderPanel,
  borderGeoJSON,
  setBorderGeoJSON,
  onMapClick,
  isUIVisible = true,
  onThemeColorChange,
  mapUiChromeOpacity = DEFAULT_MAP_UI_CHROME_OPACITY,
  mapUiChromeBlurPx = DEFAULT_MAP_UI_CHROME_BLUR_PX,
  onMapUiChromeOpacityChange,
  onMapUiChromeBlurPxChange,
  isRouteMode: _isRouteMode,
  setIsRouteMode: _setIsRouteMode,
  waypoints: _waypoints,
  setWaypoints: _setWaypoints,
  panelChromeStyle: panelChromeStyleProp
}) => {
  if (!project) return null;
  const notes = project.notes;
  const connections = project.connections || [];
  const mapChromeSurface =
    panelChromeStyleProp ?? mapChromeSurfaceStyle(mapUiChromeOpacity, mapUiChromeBlurPx);
  const mapChromeHoverBg = mapChromeHoverBackground(mapUiChromeOpacity);
  const [editingNote, setEditingNote] = useState<Partial<Note> | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(() => new Set());
  const [preSelectedNotes, setPreSelectedNotes] = useState<Note[] | null>(null);
  const [currentPreviewImageIndex, setCurrentPreviewImageIndex] = useState(0);
  const selectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connectionHighlightNoteIds, setConnectionHighlightNoteIds] = useState<string[] | null>(null);
  const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null);
  // 拖拽时的乐观坐标覆盖：避免聚类重算延迟导致 marker 被 React 用旧 position 回弹
  const [noteCoordOverrides, setNoteCoordOverrides] = useState<Record<string, Coordinates>>({});
  const isMarkerDraggingRef = useRef(false);
  const ignoreNextMarkerClickRef = useRef(false);
  const ignoreNextMapClickRef = useRef(false);

  const selectedNote = useMemo(
    () => (selectedNoteId ? notes.find((n) => n.id === selectedNoteId) : null),
    [selectedNoteId, notes]
  );
  const hoveredNote = useMemo(
    () => (hoveredNoteId ? notes.find((n) => n.id === hoveredNoteId) ?? null : null),
    [hoveredNoteId, notes]
  );

  // Reset preview image index when selected or hovered note changes
  useEffect(() => {
    setCurrentPreviewImageIndex(0);
  }, [selectedNoteId, hoveredNoteId]);

  // 当前选中点及其所有通过 connections 直接相连的端点，强制在聚类中拆分为单独 pin
  const forceSingleNoteIds = useMemo(() => {
    const seeds = new Set<string>(selectedNoteIds);
    if (selectedNoteId) seeds.add(selectedNoteId);
    if (seeds.size === 0) return [] as string[];
    const ids = new Set<string>(seeds);
    seeds.forEach((id) => {
      connections.forEach((conn) => {
        if (conn.fromNoteId === id || conn.toNoteId === id) {
          ids.add(conn.fromNoteId);
          ids.add(conn.toNoteId);
        }
      });
    });
    return Array.from(ids);
  }, [selectedNoteIds, selectedNoteId, connections]);

  // Clear selection and hover when exiting preview mode
  useEffect(() => {
    if (isUIVisible) {
      setSelectedNoteId(null);
      setSelectedNoteIds(new Set());
      setPreSelectedNotes(null);
      setCurrentPreviewImageIndex(0);
      setConnectionHighlightNoteIds(null);
      setHoveredNoteId(null);
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
  /** 仅用于检测全局 label 是否从「开」变为「关」，避免选中态变化时误清簇展开列表 */
  const prevShowTextLabelsRef = useRef(showTextLabels);

  /** 地图顶栏「编辑」：展开 Pin/Label/Cluster 滑块，交互与 Board 顶栏 Done 一致 */
  const [isMapToolbarEditMode, setIsMapToolbarEditMode] = useState(false);

  useEffect(() => {
    if (!isUIVisible) setIsMapToolbarEditMode(false);
  }, [isUIVisible]);

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

  // 当关闭全局 label 开关时：
  // - 仍保留当前选中态（便于非 label 模式下继续显示连接相关 label）
  // - 只收起“簇展开列表”
  // - 根据 selectedNoteId 重新计算 connectionHighlightNoteIds，让非 label 模式下也能显示连接端点 label
  useEffect(() => {
    if (!isUIVisible) return;

    // 清理可能正在等待的选中延迟（避免在 label 切换瞬间出现竞态）
    if (selectionTimerRef.current) {
      clearTimeout(selectionTimerRef.current);
      selectionTimerRef.current = null;
    }

    if (!showTextLabels) {
      // 仅当用户关闭全局 label 开关时收起簇展开；不要在 selectedNoteId/Ids 变化时清空，
      // 否则点击簇会先 setPreSelectedNotes 再被本 effect 立即清掉，表现为 label 组一闪即逝。
      if (prevShowTextLabelsRef.current) {
        setPreSelectedNotes(null);
      }
      prevShowTextLabelsRef.current = showTextLabels;
      setHoveredNoteId(null);

      const seeds = new Set<string>(selectedNoteIds);
      if (selectedNoteId) seeds.add(selectedNoteId);
      if (seeds.size > 0) {
        const ids = new Set<string>(seeds);
        seeds.forEach((id) => {
          connections.forEach((conn) => {
            if (conn.fromNoteId === id || conn.toNoteId === id) {
              ids.add(conn.fromNoteId);
              ids.add(conn.toNoteId);
            }
          });
        });
        setConnectionHighlightNoteIds(Array.from(ids));
      } else {
        setConnectionHighlightNoteIds(null);
      }
    } else {
      prevShowTextLabelsRef.current = showTextLabels;
      // 打开 label 模式时，不需要额外的 connectionHighlightNoteIds 收缩逻辑
      setConnectionHighlightNoteIds(null);
    }
  }, [showTextLabels, isUIVisible, selectedNoteId, selectedNoteIds, connections]);

  // Pin size control
  const [pinSize, setPinSize] = useState(1.0); // Scale factor for pin size
  // Label size control (independent)
  const [labelSize, setLabelSize] = useState(1.0);

  // Cluster threshold control
  const [clusterThreshold, setClusterThreshold] = useState(40); // Distance threshold for clustering

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
  const { handleCsvImport } = useCsvImport({ project, onUpdateProject, mapInstance });
  const { computeBoardPosition } = useNotePositioning(notes);
  const { isDragging, rootProps, dismissDropZone } = useFileDrop({
    isEditorOpen,
    themeColor,
    handleImageImport,
    handleDataImport,
    handleCsvImport
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
    clusterThreshold,
    forceSingleNoteIds
  });

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
    if (ignoreNextMarkerClickRef.current || isMarkerDraggingRef.current) {
      return;
    }
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
      // 预览模式下：点击点位时，只显示该点及其连线相邻点的 label
      if (selectedNoteId === note.id) {
        setSelectedNoteId(null);
        setConnectionHighlightNoteIds(null);
      } else {
        setSelectedNoteId(null);
        // 计算与当前点通过连线相连的所有点（包括自身）
        const relatedIds = new Set<string>();
        relatedIds.add(note.id);
        connections.forEach(conn => {
          if (conn.fromNoteId === note.id || conn.toNoteId === note.id) {
            relatedIds.add(conn.fromNoteId);
            relatedIds.add(conn.toNoteId);
          }
        });
        const idsArray = Array.from(relatedIds);
        // label 显示模式下不收缩为仅连线相关 label，保持全部显示
        setConnectionHighlightNoteIds(showTextLabels ? null : idsArray);

        // 延迟设置新选中点，确保“先恢复”的视觉效果或逻辑
        selectionTimerRef.current = setTimeout(() => {
          setSelectedNoteId(note.id);
          selectionTimerRef.current = null;
        }, 50);
      }
      return;
    }

    // 普通地图模式：点击 pin 选中；Shift+点击切换多选（与 Board 一致）
    setPreSelectedNotes(null);
    const additive = !!(e?.originalEvent?.shiftKey);
    let nextSet: Set<string>;
    if (additive) {
      nextSet = new Set(selectedNoteIds);
      if (nextSet.has(note.id)) nextSet.delete(note.id);
      else nextSet.add(note.id);
    } else {
      nextSet = new Set([note.id]);
    }
    setSelectedNoteIds(nextSet);
    const primary =
      nextSet.size === 0
        ? null
        : nextSet.has(note.id)
          ? note.id
          : Array.from(nextSet)[0];
    setSelectedNoteId(primary);

    const relatedIds = new Set<string>();
    nextSet.forEach((id) => {
      relatedIds.add(id);
      connections.forEach((conn) => {
        if (conn.fromNoteId === id || conn.toNoteId === id) {
          relatedIds.add(conn.fromNoteId);
          relatedIds.add(conn.toNoteId);
        }
      });
    });
    setConnectionHighlightNoteIds(showTextLabels ? null : Array.from(relatedIds));
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
      setSelectedNoteIds(new Set());
      setPreSelectedNotes(sortedClusterNotes);
      return;
    }

    // 正常地图模式：点击集合点时，仅展开该簇内的 labels，由 TextLabelsLayer 处理二次点击
    setSelectedNoteId(null);
    setSelectedNoteIds(new Set());
    setPreSelectedNotes(sortedClusterNotes);
  };

  const handleMarkerDrag = useCallback((note: Note, e: any) => {
    const marker = e?.target as L.Marker | undefined;
    const latLng = marker?.getLatLng?.();
    if (!latLng) return;

    isMarkerDraggingRef.current = true;

    setNoteCoordOverrides((prev) => ({
      ...prev,
      [note.id]: {
        lat: latLng.lat,
        lng: latLng.lng
      }
    }));
  }, []);

  const handleMarkerDragEnd = useCallback((note: Note, e: L.DragEndEvent) => {
    const marker = e.target as L.Marker;
    const latLng = marker.getLatLng();
    if (!latLng) return;

    // 乐观更新：先把坐标写到本地覆盖表，保证 marker 位置不会在聚类重算前回弹
    setNoteCoordOverrides((prev) => ({
      ...prev,
      [note.id]: {
        lat: latLng.lat,
        lng: latLng.lng
      }
    }));

    isMarkerDraggingRef.current = false;
    ignoreNextMarkerClickRef.current = true;
    // 允许 dragend 触发的 click 不再影响本次交互
    setTimeout(() => {
      ignoreNextMarkerClickRef.current = false;
    }, 0);

    onUpdateNote({
      ...note,
      coords: {
        lat: latLng.lat,
        lng: latLng.lng
      }
    });
  }, [onUpdateNote]);

  
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

  // 非 tab 模式：点击“已选中 label”右侧编辑按钮打开编辑器
  const handleEditNoteFromLabel = useCallback((noteId: string) => {
    if (!isUIVisible) return;
    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    setPreSelectedNotes(null);
    setSelectedNoteIds(new Set([noteId]));
    setSelectedNoteId(noteId);
    setEditingNote(note);
    setIsEditorOpen(true);
    onToggleEditor(true);
  }, [isUIVisible, notes, onToggleEditor]);

  const handleMapShiftBoxSelectClaimed = useCallback(() => {
    ignoreNextMapClickRef.current = true;
  }, []);

  const handleMapBoxSelectCommit = useCallback(
    ({ ids, additive }: { ids: string[]; additive: boolean }) => {
      const next = additive
        ? (() => {
            const n = new Set(selectedNoteIds);
            ids.forEach((id) => n.add(id));
            return n;
          })()
        : new Set(ids);

      const primary =
        next.size === 0 ? null : ids.length > 0 ? ids[ids.length - 1] : Array.from(next)[0];

      const rel = new Set<string>(next);
      next.forEach((id) => {
        connections.forEach((conn) => {
          if (conn.fromNoteId === id || conn.toNoteId === id) {
            rel.add(conn.fromNoteId);
            rel.add(conn.toNoteId);
          }
        });
      });

      setSelectedNoteIds(next);
      setSelectedNoteId(primary);
      setConnectionHighlightNoteIds(showTextLabels ? null : next.size === 0 ? null : Array.from(rel));
    },
    [selectedNoteIds, connections, showTextLabels]
  );

  const handleMapClickInternal = useCallback((e: L.LeafletMouseEvent) => {
    // 若点击的是展开的 label（或 label 组），不要清空选择，让 TextLabelsLayer 的 onSelectNote 处理
    const target = e.originalEvent?.target as HTMLElement;
    if (
      target?.closest?.('.pre-selected-labels-container') ||
      target?.closest?.('.pre-selected-label-item') ||
      target?.closest?.('.custom-text-label-edit-btn') ||
      // Clicking a pin should not clear selection (otherwise label may show but edit button won't).
      target?.closest?.('.custom-icon') ||
      target?.closest?.('.leaflet-marker-icon') ||
      target?.closest?.('.custom-pending-marker')
    ) {
      return;
    }
    if (ignoreNextMapClickRef.current) {
      ignoreNextMapClickRef.current = false;
      return;
    }
    // 与 Board 一致：按住 Shift 点空白地图不取消多选（仍处理 pending / onMapClick）
    if (isUIVisible && e.originalEvent?.shiftKey) {
      if (pendingPlaceNote) {
        setPendingPlaceNote(null);
      }
      if (onMapClick) {
        onMapClick();
      }
      return;
    }
    if (!isUIVisible) {
      if (selectionTimerRef.current) {
        clearTimeout(selectionTimerRef.current);
        selectionTimerRef.current = null;
      }
      setSelectedNoteId(null);
      setSelectedNoteIds(new Set());
      setPreSelectedNotes(null);
      setConnectionHighlightNoteIds(null);
      setHoveredNoteId(null);
    } else {
      setPreSelectedNotes(null);
      setSelectedNoteId(null);
      setSelectedNoteIds(new Set());
      setConnectionHighlightNoteIds(null);
      setHoveredNoteId(null);
    }
    if (pendingPlaceNote) {
      setPendingPlaceNote(null);
    }
    if (onMapClick) {
      onMapClick();
    }
  }, [pendingPlaceNote, onMapClick, isUIVisible]);

  const exportStandaloneMapTab = useCallback(async () => {
    if (!mapInstance || isUIVisible) return;
    try {
      const payload = await buildMapTabExportPayload(project, themeColor, mapStyleId, mapInstance, {
        pinSize,
        labelSize,
        clusterThreshold,
        showTextLabels,
        borderGeoJSON: borderGeoJSON ?? null
      });
      const html = buildStandaloneMapTabHtml(payload);
      const safe = (project.name || 'map').replace(/[/\\?%*:|"<>]/g, '_');
      downloadTextFile(`${safe}-map-tab-demo.html`, html, 'text/html;charset=utf-8');
    } catch (e) {
      console.error(e);
      window.alert('导出失败，请稍后再试');
    }
  }, [
    mapInstance,
    isUIVisible,
    project,
    themeColor,
    mapStyleId,
    pinSize,
    labelSize,
    clusterThreshold,
    showTextLabels,
    borderGeoJSON
  ]);

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
          className="absolute inset-0 z-[4000] flex items-center justify-center pointer-events-auto"
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
                  : "Drop images, JSON or CSV files here to import"
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
        style={{
          height: '100%',
          width: '100%',
          // When using blank map style, show a clean white background.
          backgroundColor: effectiveMapStyle === 'blank' ? '#ffffff' : undefined
        }}
        zoomControl={false}
        ref={mapRefCallback}
        doubleClickZoom={false}
        boxZoom={false}
      >
        <MapNavigationHandler coords={navigateToCoords} onComplete={onNavigateComplete} />
        <MapPositionTracker onPositionChange={handleMapPositionChange} />
        <MapClickHandler onClick={handleMapClickInternal} />
        {isUIVisible && (
          <MapShiftBoxSelect
            enabled={isUIVisible}
            notes={getFilteredNotes}
            noteCoordOverrides={noteCoordOverrides}
            onBoxCommit={handleMapBoxSelectCommit}
            onInteractionClaimed={handleMapShiftBoxSelectClaimed}
            themeColor={themeColor}
          />
        )}
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
          labelSize={labelSize}
          themeColor={themeColor}
          clusteredMarkers={clusteredMarkers}
          selectedNoteId={selectedNoteId}
          selectedNoteIds={selectedNoteIds}
          preSelectedNotes={preSelectedNotes}
          isPreviewMode={!isUIVisible}
          connectionHighlightNoteIds={connectionHighlightNoteIds}
          hoveredNoteId={hoveredNoteId}
          noteCoordOverrides={noteCoordOverrides}
          onEditNote={handleEditNoteFromLabel}
          onSelectNote={(noteId) => {
            setSelectedNoteIds(new Set([noteId]));
            setSelectedNoteId(noteId);
          }}
          onClearSelection={() => {
            setPreSelectedNotes(null);
            setSelectedNoteId(null);
            setSelectedNoteIds(new Set());
            setConnectionHighlightNoteIds(null);
          }}
        />

        {/* 选中某个点后的连线：用屏幕坐标覆盖层绘制，与地图同步缩放，避免抖动 */}
        <MapConnectionLinesOverlay
          selectedNoteId={selectedNoteId}
          selectedNoteIds={selectedNoteIds}
          connections={connections}
          notes={notes}
          themeColor={themeColor}
          noteCoordOverrides={noteCoordOverrides}
          pinSize={pinSize}
          labelSize={labelSize}
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

        <MapLocationErrorBanner
          locationError={locationError}
          isLocating={isLocating}
          onRetry={handleLocateCurrentPosition}
          onClose={() => {
            setLocationError(null);
            setHasRetriedLocation(false);
            setIsLocating(false);
          }}
        />
        
        <ClusterMarkerLayer
          clusteredMarkers={clusteredMarkers}
          fallbackNotes={getFilteredNotes}
          showTextLabels={showTextLabels}
          pinSize={pinSize}
          themeColor={themeColor}
          mapInstance={mapInstance}
          onMarkerClick={handleMarkerClick}
          onClusterClick={handleClusterClick}
          onMarkerHover={(note) => setHoveredNoteId(note?.id ?? null)}
          noteCoordOverrides={noteCoordOverrides}
          selectedNoteId={selectedNoteId}
          selectedNoteIds={selectedNoteIds}
          isPreviewMode={!isUIVisible}
          onMarkerDragEnd={handleMarkerDragEnd}
          onMarkerDrag={handleMarkerDrag}
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

        {isUIVisible && (
          <div
            data-allow-context-menu
            className="fixed top-2 sm:top-4 left-2 sm:left-4 right-2 sm:right-4 z-[500] flex flex-col gap-2 pointer-events-none"
          >
              <div className="flex justify-between items-center w-full pointer-events-none gap-2">
                <div className="flex flex-row flex-wrap gap-1.5 sm:gap-2 pointer-events-auto items-center min-h-10 sm:min-h-12">
                  <MapLayerControl
                    showPanel={showFrameLayerPanel}
                    onTogglePanel={() => setShowFrameLayerPanel(!showFrameLayerPanel)}
                    themeColor={themeColor}
                    chromeSurfaceStyle={mapChromeSurface}
                    chromeHoverBackground={mapChromeHoverBg}
                    frames={project.frames}
                    frameLayerVisibility={frameLayerVisibility}
                    setFrameLayerVisibility={setFrameLayerVisibility}
                    showAllFrames={showAllFrames}
                    setShowAllFrames={setShowAllFrames}
                    frameLayerRef={frameLayerRef}
                  />
                  <MapControls
                    onLocateCurrentPosition={handleLocateCurrentPosition}
                    isLocating={isLocating}
                    mapNotes={getFilteredNotes}
                    themeColor={themeColor}
                    chromeSurfaceStyle={mapChromeSurface}
                    chromeHoverBackground={mapChromeHoverBg}
                    showTextLabels={showTextLabels}
                    setShowTextLabels={setShowTextLabels}
                    onOpenSettings={() => setShowSettingsPanel(true)}
                  />
                </div>
                <div
                  className="flex h-10 sm:h-12 gap-3 pointer-events-auto items-center shrink-0"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MapSearchPanel
                    isOpen={!!showBorderPanel}
                    onToggle={handleToggleBorderPanel}
                    themeColor={themeColor}
                    chromeSurfaceStyle={mapChromeSurface}
                    chromeHoverBackground={mapChromeHoverBg}
                    borderSearch={borderSearchState}
                    borderGeoJSON={borderGeoJSON}
                    onClearBorder={() => setBorderGeoJSON?.(null)}
                    onClose={() => setShowBorderPanel?.(false)}
                  />
                  <MapTopRightEditToggle
                    isEditMode={isMapToolbarEditMode}
                    themeColor={themeColor}
                    chromeSurfaceStyle={mapChromeSurface}
                    chromeHoverBackground={mapChromeHoverBg}
                    onEnterEdit={() => setIsMapToolbarEditMode(true)}
                    onExitEdit={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setIsMapToolbarEditMode(false);
                    }}
                  />
                </div>
              </div>

              {isMapToolbarEditMode && (
                <MapToolbarSliders
                  pinSize={pinSize}
                  setPinSize={setPinSize}
                  labelSize={labelSize}
                  setLabelSize={setLabelSize}
                  clusterThreshold={clusterThreshold}
                  setClusterThreshold={setClusterThreshold}
                  themeColor={themeColor}
                  chromeSurfaceStyle={mapChromeSurface}
                  mapInstance={mapInstance}
                />
              )}
          </div>
        )}

        {mapNotes.length === 0 && (
          <div className="absolute top-24 left-0 right-0 z-[400] pointer-events-none flex justify-center">
             <div className="relative">
                <div
                    className="px-4 py-2 rounded-full shadow-lg text-sm text-gray-600 animate-bounce whitespace-nowrap border border-gray-100/80"
                    style={mapChromeSurface}
                >
                    Long press anywhere to pin
                </div>
             </div>
          </div>
        )}

      </MapContainer>

      {/* 预览模式：顶栏仅保留搜索、图层与导出（与正常模式顶栏分离） */}
      {!isUIVisible && (
        <MapPreviewTopRightToolbar
          showBorderPanel={!!showBorderPanel}
          onToggleBorderPanel={handleToggleBorderPanel}
          themeColor={themeColor}
          chromeSurfaceStyle={mapChromeSurface}
          chromeHoverBackground={mapChromeHoverBg}
          borderSearch={borderSearchState}
          borderGeoJSON={borderGeoJSON}
          onClearBorder={() => setBorderGeoJSON?.(null)}
          onCloseBorderPanel={() => setShowBorderPanel?.(false)}
          showFrameLayerPanel={showFrameLayerPanel}
          onToggleFrameLayerPanel={() => setShowFrameLayerPanel(!showFrameLayerPanel)}
          frames={project.frames}
          frameLayerVisibility={frameLayerVisibility}
          setFrameLayerVisibility={setFrameLayerVisibility}
          showAllFrames={showAllFrames}
          setShowAllFrames={setShowAllFrames}
          frameLayerRef={frameLayerRef}
          onExportStandaloneTab={() => void exportStandaloneMapTab()}
        />
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
          panelChromeStyle={mapChromeSurface}
        />
      )}

      {/* 预览模式选中展示面板 */}
      {!isUIVisible && (hoveredNote ?? selectedNote) && (
        <NotePreviewCard
          note={hoveredNote ?? selectedNote!}
          currentImageIndex={currentPreviewImageIndex}
          onImageIndexChange={setCurrentPreviewImageIndex}
          chromeSurfaceStyle={mapChromeSurface}
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
        accept=".json,application/json,.csv,text/csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const isCsv =
              file.type === 'text/csv' ||
              file.name.toLowerCase().endsWith('.csv');
            if (isCsv) {
              handleCsvImport(file);
            } else {
              handleDataImport(file);
            }
            e.target.value = '';
          }
        }}
      />

      <ImportPreviewDialog
        isOpen={showImportDialog}
        importPreview={importPreview}
        themeColor={themeColor}
        panelChromeStyle={mapChromeSurface}
        onConfirm={handleConfirmImport}
        onCancel={handleCancelImport}
        showCoordinates={true}
      />

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
        settingsContextView="map"
        themeColor={themeColor}
        onThemeColorChange={(color) => {
          onThemeColorChange?.(color);
        }}
        mapUiChromeOpacity={mapUiChromeOpacity}
        onMapUiChromeOpacityChange={onMapUiChromeOpacityChange ?? (() => {})}
        mapUiChromeBlurPx={mapUiChromeBlurPx}
        onMapUiChromeBlurPxChange={onMapUiChromeBlurPxChange ?? (() => {})}
        currentMapStyle={mapStyleId || 'carto-light-nolabels'}
        onMapStyleChange={handleMapStyleChange}
        pinSize={pinSize}
        onPinSizeChange={setPinSize}
        clusterThreshold={clusterThreshold}
        onClusterThresholdChange={setClusterThreshold}
        labelSize={labelSize}
        onLabelSizeChange={setLabelSize}
        graphProject={project}
        onGraphProjectPatch={
          onUpdateProject ? (patch) => void onUpdateProject({ ...project, ...patch }) : undefined
        }
      />

      <MapImportMenuModal
        open={!!showImportMenu}
        chromeSurfaceStyle={mapChromeSurface}
        onClose={() => setShowImportMenu?.(false)}
        onImportPhotos={() => fileInputRef.current?.click()}
        onImportData={() => dataImportInputRef.current?.click()}
        onImportCamera={handleImportFromCamera}
        cameraAvailable={isCameraAvailable()}
      />
    </div>
  );
};

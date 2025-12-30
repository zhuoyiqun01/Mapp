import { useState, useCallback } from 'react';
import { ViewMode } from '../types';
import { getViewPositionCache, setViewPositionCache } from '../../utils/storage';

interface NavigationCoords {
  lat: number;
  lng: number;
  zoom?: number;
}

interface BoardCoords {
  x: number;
  y: number;
}

interface UseViewStateReturn {
  // View state
  viewMode: ViewMode;
  isEditorOpen: boolean;
  isBoardEditMode: boolean;

  // Navigation state
  navigateToMapCoords: NavigationCoords | null;
  navigateToBoardCoords: BoardCoords | null;

  // Actions
  setViewMode: (mode: ViewMode) => void;
  setIsEditorOpen: (open: boolean) => void;
  setIsBoardEditMode: (edit: boolean) => void;

  // Navigation actions
  navigateToMap: (coords?: NavigationCoords) => void;
  navigateToBoard: (coords?: BoardCoords) => void;
  clearMapNavigation: () => void;
  clearBoardNavigation: () => void;

  // Position saving
  saveMapPosition: (projectId: string, mapInstance: any) => void;
  saveBoardPosition: (projectId: string, x: number, y: number, scale: number) => void;
}

export const useViewState = (): UseViewStateReturn => {
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isBoardEditMode, setIsBoardEditMode] = useState(false);

  const [navigateToMapCoords, setNavigateToMapCoords] = useState<NavigationCoords | null>(null);
  const [navigateToBoardCoords, setNavigateToBoardCoords] = useState<BoardCoords | null>(null);

  // Navigation actions
  const navigateToMap = useCallback((coords?: NavigationCoords) => {
    setNavigateToMapCoords(coords || null);
  }, []);

  const navigateToBoard = useCallback((coords?: BoardCoords) => {
    setNavigateToBoardCoords(coords || null);
  }, []);

  const clearMapNavigation = useCallback(() => {
    setNavigateToMapCoords(null);
  }, []);

  const clearBoardNavigation = useCallback(() => {
    setNavigateToBoardCoords(null);
  }, []);

  // Position saving
  const saveMapPosition = useCallback((projectId: string, mapInstance: any) => {
    if (!projectId || !mapInstance) return;

    try {
      const center = mapInstance.getCenter();
      const zoom = mapInstance.getZoom();
      if (center && typeof center.lat === 'number' && typeof center.lng === 'number') {
        setViewPositionCache(projectId, 'map', { center: [center.lat, center.lng], zoom });
        console.log('[ViewState] Saved map position:', { center, zoom, projectId });
      }
    } catch (err) {
      console.warn('[ViewState] Failed to save map position:', err);
    }
  }, []);

  const saveBoardPosition = useCallback((projectId: string, x: number, y: number, scale: number) => {
    if (!projectId) return;
    setViewPositionCache(projectId, 'board', { x, y, scale });
    console.log('[ViewState] Saved board position:', { x, y, scale, projectId });
  }, []);

  return {
    viewMode,
    isEditorOpen,
    isBoardEditMode,
    navigateToMapCoords,
    navigateToBoardCoords,
    setViewMode,
    setIsEditorOpen,
    setIsBoardEditMode,
    navigateToMap,
    navigateToBoard,
    clearMapNavigation,
    clearBoardNavigation,
    saveMapPosition,
    saveBoardPosition
  };
};


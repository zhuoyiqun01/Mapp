import { useState, useEffect, useRef } from 'react';
import { get } from 'idb-keyval';

interface UseAppStateReturn {
  // Theme
  themeColor: string;
  setThemeColor: (color: string) => void;

  // Sidebar
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  sidebarButtonY: number;
  setSidebarButtonY: (y: number) => void;

  // Map import menu
  showMapImportMenu: boolean;
  setShowMapImportMenu: (show: boolean) => void;

  // File input ref
  mapViewFileInputRef: React.RefObject<HTMLInputElement>;

  // Loading states
  isRunningCleanup: boolean;
  setIsRunningCleanup: (running: boolean) => void;
  showCleanupMenu: boolean;
  setShowCleanupMenu: (show: boolean) => void;

  // Sidebar drag
  sidebarButtonDragRef: React.MutableRefObject<{
    isDragging: boolean;
    startY: number;
    startButtonY: number;
  }>;
}

export const useAppState = (): UseAppStateReturn => {
  const [themeColor, setThemeColor] = useState('#3B82F6');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarButtonY, setSidebarButtonY] = useState(96);
  const [showMapImportMenu, setShowMapImportMenu] = useState(false);
  const [isRunningCleanup, setIsRunningCleanup] = useState(false);
  const [showCleanupMenu, setShowCleanupMenu] = useState(false);

  const mapViewFileInputRef = useRef<HTMLInputElement | null>(null);
  const sidebarButtonDragRef = useRef({ isDragging: false, startY: 0, startButtonY: 0 });

  // Load theme color on mount
  useEffect(() => {
    const loadThemeColor = async () => {
      try {
        const saved = await get('app-theme-color');
        if (saved) {
          setThemeColor(saved);
        }
      } catch (error) {
        console.warn('Failed to load theme color:', error);
      }
    };

    loadThemeColor();
  }, []);

  // Set initial sidebar button position
  useEffect(() => {
    const centerY = (window.innerHeight - 50) / 2;
    setSidebarButtonY(centerY);
  }, []);

  return {
    themeColor,
    setThemeColor,
    isSidebarOpen,
    setIsSidebarOpen,
    sidebarButtonY,
    setSidebarButtonY,
    showMapImportMenu,
    setShowMapImportMenu,
    mapViewFileInputRef,
    isRunningCleanup,
    setIsRunningCleanup,
    showCleanupMenu,
    setShowCleanupMenu,
    sidebarButtonDragRef
  };
};







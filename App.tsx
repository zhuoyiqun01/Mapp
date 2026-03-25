
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Map as MapIcon, Grid, Menu, Loader2, Table2, GitBranch, Cloud, CloudOff, CheckCircle2, AlertCircle, RefreshCw, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapView } from './components/MapView';
import { BoardView } from './components/BoardView';
import { TableView } from './components/TableView';
import { GraphView } from './components/GraphView';
import { ProjectManager } from './components/ProjectManager';
import { Note, ViewMode, Project } from './types';
import { get, set } from 'idb-keyval';
import { MAP_STYLE_OPTIONS } from './constants';
import { useProjectState } from './components/hooks/useProjectState';
import { useViewState } from './components/hooks/useViewState';
import { useAppState } from './components/hooks/useAppState';
import { 
  syncProjectsToCloud, 
  loadProjectsFromCloud, 
  mergeProjects, 
  shouldSync,
  getLastSyncTime,
  type SyncStatus 
} from './utils/persistence/sync';
import {
  migrateFromOldFormat,
  deleteImage,
  deleteSketch,
  getViewPositionCache,
  clearViewPositionCache,
  checkStorageUsage,
  checkStorageDetails,
  analyzeStorageRedundancy,
  cleanupCorruptedImages,
  cleanupLargeImages,
  cleanupDuplicateImages,
  analyzeDuplicateImages,
  attemptImageRecovery,
  loadNoteImages,
  findOrphanedData,
  cleanupOrphanedData,
  cleanBrokenReferences,
  loadAllProjects,
  ProjectSummary
} from './utils/persistence/storage';
import { mapChromeSurfaceStyle, mapChromeHoverBackground } from './utils/map/mapChromeStyle';
import { applyThemeChromeCssVars } from './utils/theme/themeChrome';

export default function App() {
  const emptyNotes = useMemo(() => [], []);
  const emptyFrames = useMemo(() => [], []);

  // Use custom hooks for state management
  const projectState = useProjectState();

  const viewState = useViewState();
  const appState = useAppState();

  // Extract commonly used values for easier access
  const {
    projects,
    projectSummaries,
    activeProject,
    currentProjectId,
    setCurrentProjectId,
    setActiveProject,
    duplicateProject,
    isLoading,
    setIsLoading,
    isLoadingProject,
    setIsLoadingProject,
    loadingProgress,
    setLoadingProgress,
    isDeletingProject
  } = projectState;

  const {
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
  } = viewState;

  // 保存board位置（现在只在拖拽结束时调用，类似MapPositionTracker的moveend事件）
  const saveBoardPositionDirect = useCallback((projectId: string, x: number, y: number, scale: number) => {
    saveBoardPosition(projectId, x, y, scale);
  }, [saveBoardPosition]);

  const {
    themeColor,
    setThemeColor,
    isSidebarOpen,
    setIsSidebarOpen,
    sidebarButtonY,
    setSidebarButtonY,
    showMapImportMenu,
    setShowMapImportMenu,
    showBorderPanel,
    setShowBorderPanel,
    borderGeoJSON,
    setBorderGeoJSON,
    mapViewFileInputRef,
    isRunningCleanup,
    setIsRunningCleanup,
    showCleanupMenu,
    setShowCleanupMenu,
    sidebarButtonDragRef,
    isRouteMode,
    setIsRouteMode,
    waypoints,
    setWaypoints
  } = appState;
  



  // Load complete project data with progress

  // Cleanup orphaned data (images and sketches not referenced by any project)
  const handleCleanupOrphanedData = useCallback(async (forceDeleteDuplicates: boolean = false) => {
    if (isRunningCleanup) {
      console.log('Cleanup already running, skipping...');
      return;
    }

    try {
      setIsRunningCleanup(true);
      console.log(`Starting ${forceDeleteDuplicates ? 'aggressive' : 'safe'} orphaned data cleanup...`);

      // Show loading state
      setIsLoadingProject(true);
      setLoadingProgress(0);

      // Step 1: Find orphaned data (30%)
      setLoadingProgress(30);
      const orphanedData = await findOrphanedData();
      console.log(`Found ${orphanedData.orphanedImages.length} orphaned images, ${orphanedData.orphanedSketches.length} orphaned sketches, ${orphanedData.orphanedBackgrounds.length} orphaned backgrounds`);

      // Step 2: Clean up orphaned data (60%)
      setLoadingProgress(60);
      const cleanupResult = await cleanupOrphanedData();
      console.log(`Cleaned up ${cleanupResult.imagesCleaned} orphaned images, ${cleanupResult.sketchesCleaned} orphaned sketches, ${cleanupResult.backgroundsCleaned} orphaned backgrounds, freed ${(cleanupResult.spaceFreed / (1024 * 1024)).toFixed(2)}MB`);

      // Step 3: Clean up duplicate images (90%)
      setLoadingProgress(90);
      const duplicateOptions = forceDeleteDuplicates ? { forceDeleteSuspicious: true } : {};
      const duplicateCleanupResult = await cleanupDuplicateImages(true, duplicateOptions);
      if (duplicateCleanupResult) {
        const suspiciousAction = forceDeleteDuplicates ? 'force deleted' : 'skipped';
        console.log(`Cleaned up ${duplicateCleanupResult.imagesCleaned} duplicate images (${duplicateCleanupResult.skippedSuspicious} suspicious ${suspiciousAction}), freed ${duplicateCleanupResult.spaceFreed.toFixed(2)}MB`);

        if (duplicateCleanupResult.suspiciousGroups.length > 0 && !forceDeleteDuplicates) {
          console.warn(`⚠️ Skipped ${duplicateCleanupResult.suspiciousGroups.length} suspicious duplicate groups. Use force mode to clean them.`);
        }
      }

      // Step 4: Refresh projects (95%)
      setLoadingProgress(95);
      await projectState.loadProjects();

      // Step 5: Complete (100%)
      setLoadingProgress(100);

      console.log(`${forceDeleteDuplicates ? 'Aggressive' : 'Safe'} orphaned data cleanup completed`);
    } catch (error) {
      console.error('Cleanup failed:', error);
    } finally {
      setIsLoadingProject(false);
      setLoadingProgress(0);
      setIsRunningCleanup(false);
    }
  }, [isRunningCleanup]);

  // Convert ProjectSummary to basic Project for display
  const summariesToProjects = useCallback((summaries: ProjectSummary[]): Project[] => {
    return summaries.map(summary => ({
      id: summary.id,
      name: summary.name,
      type: summary.type,
      createdAt: summary.createdAt,
      backgroundImage: undefined,
      notes: [], // Empty for now, will be loaded when selected
      frames: [],
      connections: [],
      backgroundOpacity: 1,
      themeColor: themeColor
    }));
  }, []);
  
  // Check and repair project data
  const handleCheckData = useCallback(async () => {
    try {
      console.log('Starting data check and repair...');

      // Show loading state
      setIsLoadingProject(true);
      setLoadingProgress(0);

      // Step 1: Attempt to recover missing images (25%)
      setLoadingProgress(25);
      const recoveryResult = await attemptImageRecovery();
      if (recoveryResult.imagesRecovered > 0 || recoveryResult.sketchesRecovered > 0) {
        console.log(`Recovered ${recoveryResult.imagesRecovered} images and ${recoveryResult.sketchesRecovered} sketches`);
      }

      // Step 2: Clean up corrupted data (30%)
      setLoadingProgress(30);
      const cleanupResult = await cleanupCorruptedImages();
      if (cleanupResult.imagesCleaned > 0 || cleanupResult.sketchesCleaned > 0) {
        console.log(`Cleaned ${cleanupResult.imagesCleaned} corrupted images and ${cleanupResult.sketchesCleaned} corrupted sketches`);
      }

      // Step 3: Analyze and clean up duplicate images (50%)
      setLoadingProgress(50);
      const duplicateCleanupResult = await cleanupDuplicateImages(true); // autoDelete = true
      if (duplicateCleanupResult) {
        if (duplicateCleanupResult.suspiciousGroups.length > 0) {
          console.warn(`⚠️ Found ${duplicateCleanupResult.suspiciousGroups.length} suspicious duplicate groups that were NOT deleted:`);
          duplicateCleanupResult.suspiciousGroups.forEach(group => {
            console.warn(`  ${group.count} duplicates (${group.reason}): ${group.ids.join(', ')}`);
          });
        }
        if (duplicateCleanupResult.imagesCleaned > 0) {
          console.log(`✅ Cleaned ${duplicateCleanupResult.imagesCleaned} normal duplicate images, freed ${duplicateCleanupResult.spaceFreed.toFixed(2)}MB`);
        }
      }

      // Step 4: Clean up large images (>2MB) (70%)
      setLoadingProgress(70);
      const largeCleanupResult = await cleanupLargeImages(2);
      if (largeCleanupResult.imagesCleaned > 0) {
        console.log(`Cleaned ${largeCleanupResult.imagesCleaned} large images, freed ${largeCleanupResult.spaceFreed.toFixed(2)}MB`);
      }

      // Step 5: Detailed duplicate analysis (90%)
      setLoadingProgress(90);
      const detailedAnalysis = await analyzeDuplicateImages();
      if (detailedAnalysis) {
        console.log('📊 Detailed duplicate analysis:');
        console.log(`   Total duplicate groups: ${detailedAnalysis.duplicateGroups.length}`);
        console.log(`   Suspicious groups: ${detailedAnalysis.suspiciousGroups.length}`);

        if (detailedAnalysis.suspiciousGroups.length > 0) {
          console.log('🚨 Suspicious duplicate groups (investigate these):');
          detailedAnalysis.suspiciousGroups.forEach((group, index) => {
            console.log(`   ${index + 1}. ${group.reason}`);
            console.log(`      Hash: ${group.hash.substring(0, 16)}`);
            console.log(`      Count: ${group.count}`);
            console.log(`      IDs: ${group.ids.join(', ')}`);
            console.log(`      Timestamps: ${group.timestamps.map(t => new Date(t).toISOString()).join(', ')}`);
          });
        }
      }

      // Step 6: Refresh projects (95%)
      setLoadingProgress(95);
      await projectState.loadProjects();

      // Step 7: Complete (100%)
      setLoadingProgress(100);

      console.log('Data check and repair completed');
    } catch (error) {
      console.error('Data check failed:', error);
    } finally {
      setIsLoadingProject(false);
      setLoadingProgress(0);
    }
  }, []);

  // Clean broken resource references in a project
  const handleCleanupBrokenReferences = useCallback(async (project: Project) => {
    try {
      console.log(`Cleaning broken resource references for project: ${project.name}`);

      // Show loading state
      setIsLoadingProject(true);
      setLoadingProgress(0);

      // Clean broken references
      setLoadingProgress(50);
      const cleanedNotes = await cleanBrokenReferences(project.notes);

      // Update project with cleaned notes
      setLoadingProgress(80);
      const cleanedProject = {
        ...project,
        notes: cleanedNotes
      };

      await projectState.updateProject(cleanedProject);
      setLoadingProgress(100);

      console.log(`Successfully cleaned broken references for project: ${project.name}`);
      alert(`已清理项目 "${project.name}" 中的断链资源引用`);
    } catch (error) {
      console.error('Failed to clean broken references:', error);
      alert('清理断链引用时出错，请查看控制台日志');
    } finally {
      setIsLoadingProject(false);
      setLoadingProgress(0);
    }
  }, [projectState]);

  // Project selection handler with loading
  const handleSelectProject = useCallback(async (id: string) => {
    if (currentProjectId && currentProjectId !== id) {
      console.log('[App] Clearing cache for old project:', currentProjectId);
      clearViewPositionCache(currentProjectId);
    }

    setIsSidebarOpen(false);
    clearMapNavigation();
    clearBoardNavigation();

    await projectState.selectProject(id);
  }, [currentProjectId, projectState, clearMapNavigation, clearBoardNavigation]);

  // Cloud Sync State
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);


  // UI Visibility State (Tab key toggle)
  const [isUIVisible, setIsUIVisible] = useState(true);

  
  // Map Style State
  const [mapStyle, setMapStyle] = useState<string>('carto-light-nolabels');

  const [mapUiChromeOpacity, setMapUiChromeOpacity] = useState(0.9);
  const [mapUiChromeBlurPx, setMapUiChromeBlurPx] = useState(8);

  const panelChromeStyle = useMemo(
    () => mapChromeSurfaceStyle(mapUiChromeOpacity, mapUiChromeBlurPx),
    [mapUiChromeOpacity, mapUiChromeBlurPx]
  );

  const mapChromeHoverBg = useMemo(
    () => mapChromeHoverBackground(mapUiChromeOpacity),
    [mapUiChromeOpacity]
  );

  useEffect(() => {
    applyThemeChromeCssVars(document.documentElement, themeColor);
  }, [themeColor]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--map-ui-chrome-opacity', String(mapUiChromeOpacity));
    const b = Math.min(48, Math.max(0, Math.round(mapUiChromeBlurPx)));
    root.style.setProperty('--map-ui-chrome-blur-px', b === 0 ? '0px' : `${b}px`);
  }, [mapUiChromeOpacity, mapUiChromeBlurPx]);

  // Load Theme Color from IndexedDB
  useEffect(() => {
    const loadThemeColor = async () => {
      try {
        const savedColor = await get<string>('mapp-theme-color');
        if (savedColor) {
          setThemeColor(savedColor);
          // Update CSS variables
          const darkR = Math.max(0, Math.floor(parseInt(savedColor.slice(1, 3), 16) * 0.9));
          const darkG = Math.max(0, Math.floor(parseInt(savedColor.slice(3, 5), 16) * 0.9));
          const darkB = Math.max(0, Math.floor(parseInt(savedColor.slice(5, 7), 16) * 0.9));
          const darkHex = '#' + [darkR, darkG, darkB].map(x => {
            const hex = x.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
          }).join('').toUpperCase();
          
          document.documentElement.style.setProperty('--theme-color', savedColor);
          document.documentElement.style.setProperty('--theme-color-dark', darkHex);
          
          // Update meta theme-color
          const metaThemeColor = document.querySelector('meta[name="theme-color"]');
          if (metaThemeColor) {
            metaThemeColor.setAttribute('content', savedColor);
          }
        }
      } catch (err) {
        console.error("Failed to load theme color", err);
      }
    };
    loadThemeColor();
  }, []);

  // Load Map Style from IndexedDB
  useEffect(() => {
    const loadMapStyle = async () => {
      try {
        const savedStyle = await get<string>('mapp-map-style');
        if (savedStyle) {
          setMapStyle(savedStyle);
        }
      } catch (err) {
        console.error("Failed to load map style", err);
      }
    };
    loadMapStyle();
  }, []);

  useEffect(() => {
    const loadMapUiChrome = async () => {
      try {
        const savedOpacity = await get<number>('mapp-map-ui-chrome-opacity');
        if (typeof savedOpacity === 'number' && !Number.isNaN(savedOpacity)) {
          setMapUiChromeOpacity(Math.min(1, Math.max(0.15, savedOpacity)));
        }
        const savedBlur = await get<number>('mapp-map-ui-chrome-blur-px');
        if (typeof savedBlur === 'number' && !Number.isNaN(savedBlur)) {
          setMapUiChromeBlurPx(Math.min(48, Math.max(0, Math.round(savedBlur))));
        }
      } catch (err) {
        console.error('Failed to load map UI chrome settings', err);
      }
    };
    loadMapUiChrome();
  }, []);

  // Load Projects from IndexedDB and Cloud
  useEffect(() => {
    const loadProjects = async () => {
      try {
        // 1. 快速加载项目（只显示项目列表）
        await projectState.loadProjects();
        
        // 2. 后台执行所有维护和同步任务（不阻塞UI）
        setTimeout(async () => {
          try {
            // 检查存储使用情况和详情
            const storageUsage = await checkStorageUsage();
            if (storageUsage) {
              console.log(`Storage usage: ${storageUsage.used.toFixed(2)}MB used, ${storageUsage.available.toFixed(2)}MB available (${storageUsage.percentage.toFixed(1)}%)`);
              if (storageUsage.percentage > 80) {
                console.warn('Storage usage is high, images may be automatically cleaned up by browser');
              }
            }

            // 检查存储详情
            const storageDetails = await checkStorageDetails();
            if (storageDetails) {
              console.log('Storage details:', {
                totalKeys: storageDetails.totalKeys,
                images: storageDetails.imageKeys,
                sketches: storageDetails.sketchKeys,
                projects: storageDetails.projectKeys,
                totalImageSize: `${storageDetails.totalImageSize.toFixed(2)}MB`,
                largestImages: storageDetails.largestImages.slice(0, 5).map(img =>
                  `${img.key.split('-').pop()}: ${img.size.toFixed(2)}MB`
                )
              });
            }

            // 分析存储冗余
            const redundancyAnalysis = await analyzeStorageRedundancy();
            if (redundancyAnalysis) {
              console.log('Storage redundancy analysis:', {
                uniqueImages: redundancyAnalysis.uniqueImages,
                duplicateImages: redundancyAnalysis.duplicateImages,
                uniqueSketches: redundancyAnalysis.uniqueSketches,
                duplicateSketches: redundancyAnalysis.duplicateSketches,
                redundantSpace: `${redundancyAnalysis.redundantSpace.toFixed(2)}MB`,
                topDuplicateGroups: redundancyAnalysis.duplicateGroups.slice(0, 3).map(group => ({
                  hash: group.hash.substring(0, 8),
                  count: group.count,
                  totalSize: `${group.size.toFixed(2)}MB`,
                  ids: group.ids.slice(0, 3).join(', ') + (group.ids.length > 3 ? '...' : '')
                }))
              });
        }
        
            // 数据迁移（后台执行）
            await migrateFromOldFormat();

            // 保守清理明显损坏的数据（后台执行）
            const cleanupResult = await cleanupCorruptedImages();
            if (cleanupResult.imagesCleaned > 0 || cleanupResult.sketchesCleaned > 0) {
              console.log(`Cleaned ${cleanupResult.imagesCleaned} corrupted images and ${cleanupResult.sketchesCleaned} corrupted sketches`);
            }
        
            // 云端同步（后台执行）
        // 检查 Supabase 是否配置，避免不必要的尝试
        const hasSupabaseConfig = import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY;
        
        if (hasSupabaseConfig) {
          try {
            setSyncStatus('syncing');
            const cloudResult = await loadProjectsFromCloud();
            
            if (cloudResult.success && cloudResult.projects) {
                  // 获取完整的本地项目数据用于合并
                  const fullLocalProjects = await loadAllProjects(true);
              // 合并本地和云端数据
                  const merged = mergeProjects(fullLocalProjects, cloudResult.projects);
              
              // 如果合并后的数据与本地不同，更新本地
                  const localIds = new Set(fullLocalProjects.map(p => p.id));
              const mergedIds = new Set(merged.map(p => p.id));
                  const hasChanges = fullLocalProjects.length !== merged.length ||
                [...localIds].some(id => !mergedIds.has(id)) ||
                merged.some(p => {
                      const local = fullLocalProjects.find(lp => lp.id === p.id);
                  return !local || (local.version || 0) < (p.version || 0);
                });
        
              if (hasChanges) {
                // Note: Projects are now managed by useProjectState hook
                // Update project summaries
                await projectState.loadProjects();
              }
              
              // 如果云端有更新，同步到云端
              if (!cloudResult.isNewDevice) {
                await syncProjectsToCloud(merged);
              }
              
              setSyncStatus('success');
              setTimeout(() => setSyncStatus('idle'), 2000);
            } else if (cloudResult.error) {
              console.warn('Cloud load failed, using local data:', cloudResult.error);
              setSyncStatus('error');
              setSyncError(cloudResult.error);
              setTimeout(() => {
                setSyncStatus('idle');
                setSyncError(null);
              }, 3000);
        } else {
              // 新设备，上传本地数据到云端
                  const fullLocalProjects = await loadAllProjects(true);
                  if (fullLocalProjects.length > 0) {
                    await syncProjectsToCloud(fullLocalProjects);
              }
              setSyncStatus('success');
              setTimeout(() => setSyncStatus('idle'), 2000);
            }
          } catch (err) {
            console.error("云端同步失败:", err);
            setSyncStatus('error');
            setSyncError(err instanceof Error ? err.message : '同步失败');
            setTimeout(() => {
              setSyncStatus('idle');
              setSyncError(null);
            }, 3000);
             }
        }
          } catch (error) {
            console.warn('Background tasks failed:', error);
          }
        }, 200);
      } catch (err) {
        console.error("Failed to load projects", err);
        setIsLoading(false);
      }
    };
    loadProjects();
  }, []);


  // Disable browser two-finger zoom and long-press interactions
  useEffect(() => {
    const preventZoom = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    };

    const preventGesture = (e: Event) => {
      e.preventDefault();
    };

    const preventContextMenu = (e: Event) => {
      const target = e.target as HTMLElement;
      // 允许在 UI 上使用右键：输入框、按钮、或带 data-allow-context-menu 的容器内
      if (
        target.closest('[data-allow-context-menu]') ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'BUTTON'
      ) {
        return;
      }
      e.preventDefault();
    };

    const preventLongPress = (e: TouchEvent) => {
      // Prevent long-press context menu on mobile
      if (e.touches.length === 1) {
        // For single touch, we'll rely on CSS -webkit-touch-callout: none
        // But we can still prevent other long-press behaviors
      }
    };

    // Tab key to toggle UI visibility
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && !isEditorOpen && !isBoardEditMode) {
        e.preventDefault();
        setIsUIVisible(prev => !prev);
      }
    };

    // Prevent two-finger zoom
    document.addEventListener('touchstart', preventZoom, { passive: false });
    document.addEventListener('touchmove', preventZoom, { passive: false });

    // Prevent gesture events
    document.addEventListener('gesturestart', preventGesture);
    document.addEventListener('gesturechange', preventGesture);
    document.addEventListener('gestureend', preventGesture);

    // Prevent context menu (right-click/long-press menu)
    document.addEventListener('contextmenu', preventContextMenu);

    // Prevent long-press selection on iOS
    document.addEventListener('touchstart', preventLongPress, { passive: true });

    // Tab key handler
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('touchstart', preventZoom);
      document.removeEventListener('touchmove', preventZoom);
      document.removeEventListener('gesturestart', preventGesture);
      document.removeEventListener('gesturechange', preventGesture);
      document.removeEventListener('gestureend', preventGesture);
      document.removeEventListener('contextmenu', preventContextMenu);
      document.removeEventListener('touchstart', preventLongPress);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Save to IndexedDB and Cloud
  useEffect(() => {
    if (!isLoading && projects.length > 0) {
      // Note: Projects are now automatically saved by useProjectState hook
      
      // 2. 延迟同步到云端（防抖，避免频繁同步，仅在 Supabase 配置时执行）
      const hasSupabaseConfig = import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      if (hasSupabaseConfig) {
        if (syncTimeoutRef.current) {
          clearTimeout(syncTimeoutRef.current);
        }
        
        syncTimeoutRef.current = setTimeout(async () => {
          if (shouldSync()) {
            try {
              setSyncStatus('syncing');
              const result = await syncProjectsToCloud(projects);
              
              if (result.success) {
                setSyncStatus('success');
                setTimeout(() => setSyncStatus('idle'), 2000);
              } else {
                setSyncStatus('error');
                setSyncError(result.error || '同步失败');
                setTimeout(() => {
                  setSyncStatus('idle');
                  setSyncError(null);
                }, 3000);
              }
            } catch (err) {
              console.error("云端同步失败:", err);
              setSyncStatus('error');
              setSyncError(err instanceof Error ? err.message : '同步失败');
              setTimeout(() => {
                setSyncStatus('idle');
                setSyncError(null);
              }, 3000);
            }
          }
        }, 2000); // 2秒后同步
      }
    }
    
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [projects, isLoading]);




  const addNote = async (note: Note) => {
    if (!currentProjectId) return;
    await projectState.addNoteToProject(currentProjectId, note);
  };

  const updateNote = async (updatedNote: Note) => {
    if (!currentProjectId) return;
    await projectState.updateNoteInProject(currentProjectId, updatedNote.id, updatedNote);
  };

  const deleteNote = async (noteId: string) => {
    if (!currentProjectId) return;
    
    // Find the note to delete (to get its images)
    const noteToDelete = activeProject?.notes.find(n => n.id === noteId);
    
    // Delete note's images if they are stored separately
    if (noteToDelete) {
      // Delete images
      if (noteToDelete.images && noteToDelete.images.length > 0) {
        for (const imageData of noteToDelete.images) {
          if (imageData.startsWith('img-')) {
            // It's an image ID, delete it
            try {
              await deleteImage(imageData);
            } catch (error) {
              console.error('Failed to delete image:', error);
            }
          }
          // If it's Base64 (legacy), no need to delete
        }
      }
      
      // Delete sketch
      if (noteToDelete.sketch && noteToDelete.sketch.startsWith('img-')) {
        try {
          await deleteSketch(noteToDelete.sketch);
        } catch (error) {
          console.error('Failed to delete sketch:', error);
        }
      }
    }
    
    // Delete note from project (this will also update connections)
    await projectState.deleteNoteFromProject(currentProjectId, noteId);
  };

  // 批量删除便签 - 优化版本，一次性处理多个便签
  const deleteNotesBatch = async (noteIds: string[]) => {
    if (!currentProjectId || noteIds.length === 0) return;

    console.log('Batch deleting notes:', noteIds);

    // 收集所有要删除的便签
    const notesToDelete = activeProject?.notes.filter(n => noteIds.includes(n.id)) || [];

    // 批量删除资源
    for (const noteToDelete of notesToDelete) {
      // Delete images
      if (noteToDelete.images && noteToDelete.images.length > 0) {
        for (const imageData of noteToDelete.images) {
          if (imageData.startsWith('img-')) {
            try {
              await deleteImage(imageData);
            } catch (error) {
              console.error('Failed to delete image:', error);
            }
          }
        }
      }

      // Delete sketch
      if (noteToDelete.sketch && noteToDelete.sketch.startsWith('img-')) {
        try {
          await deleteSketch(noteToDelete.sketch);
        } catch (error) {
          console.error('Failed to delete sketch:', error);
        }
      }
    }

    // 清理相关的连接
    const remainingConnections = activeProject.connections?.filter(conn =>
      !noteIds.includes(conn.fromNoteId) && !noteIds.includes(conn.toNoteId)
    ) || [];

    // 一次性更新项目，删除所有便签并清理连接
    const updatedProject = {
      ...activeProject,
      notes: activeProject.notes.filter(note => !noteIds.includes(note.id)),
      connections: remainingConnections
    };

    await projectState.updateProject(updatedProject);
  };

  const handleExportCSV = (project: Project) => {
    // 只导出标准便签（不包括小便签和纯文本）
    const standardNotes = project.notes;
    
    if (standardNotes.length === 0) {
      alert("该项目没有标准便签数据可导出。");
      return;
    }
    
    // 创建CSV内容
    // 支持多个分组：分组1、分组2、分组3
    const headers = ['文本内容', 'Tag1', 'Tag2', 'Tag3', '分组1', '分组2', '分组3'];
    const rows = standardNotes.map(note => {
      // 文本内容
      const text = note.text || '';
      
      // 标签
      const tags = note.tags || [];
      const tag1 = tags[0]?.label || '';
      const tag2 = tags[1]?.label || '';
      const tag3 = tags[2]?.label || '';
      
      // 分组（支持多个分组）
      const groupNames = note.groupNames || [];
      // 如果没有 groupNames，使用 groupName（向后兼容）
      const allGroups = groupNames.length > 0 
        ? groupNames 
        : (note.groupName ? [note.groupName] : []);
      
      const group1 = allGroups[0] || '';
      const group2 = allGroups[1] || '';
      const group3 = allGroups[2] || '';
      
      return [text, tag1, tag2, tag3, group1, group2, group3];
    });

    // 生成CSV
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // 下载文件
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${project.name}-数据.csv`;
    link.click();
  };

  const handleCreateProject = async (project: Project) => {
    const projectId = await projectState.createProject({
      name: project.name
    });

    setViewMode('map');
    setIsSidebarOpen(false);
    await projectState.selectProject(projectId);
  };

  const handleDeleteProject = async (id: string) => {
    await projectState.deleteProject(id);
  };

  const handleDuplicateProject = async (project: Project) => {
    await duplicateProject(project);
  };

  const handleUpdateProject = async (projectOrId: Project | string, updates?: Partial<Project>) => {
    if (typeof projectOrId === 'string') {
      // Update by id and updates
      const currentProject = activeProject;
      if (currentProject && updates) {
        await projectState.updateProject({ ...currentProject, ...updates });
      }
    } else {
      // Update by full project object
      await projectState.updateProject(projectOrId);
    }
  };

  const handleThemeColorChange = async (color: string) => {
    // Update React state first
    setThemeColor(color);

    // Calculate dark variant
    const darkR = Math.max(0, Math.floor(parseInt(color.slice(1, 3), 16) * 0.9));
    const darkG = Math.max(0, Math.floor(parseInt(color.slice(3, 5), 16) * 0.9));
    const darkB = Math.max(0, Math.floor(parseInt(color.slice(5, 7), 16) * 0.9));
    const darkHex = '#' + [darkR, darkG, darkB].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('').toUpperCase();

    // Update CSS variables for immediate visual feedback
    document.documentElement.style.setProperty('--theme-color', color);
    document.documentElement.style.setProperty('--theme-color-dark', darkHex);

    // Update meta theme-color
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', color);
    }

    // Save to IndexedDB
    await set('mapp-theme-color', color);
    await set('mapp-theme-color-dark', darkHex);
  };

  const handleMapUiChromeOpacityChange = async (opacity: number) => {
    const o = Math.min(1, Math.max(0.15, opacity));
    setMapUiChromeOpacity(o);
    await set('mapp-map-ui-chrome-opacity', o);
  };

  const handleMapUiChromeBlurPxChange = async (blurPx: number) => {
    const b = Math.min(48, Math.max(0, Math.round(blurPx)));
    setMapUiChromeBlurPx(b);
    await set('mapp-map-ui-chrome-blur-px', b);
  };

  if (isLoading) {
    return (
      <div className="w-full min-h-screen flex flex-col items-center justify-center text-theme-chrome-fg" style={{ backgroundColor: themeColor }}>
         <Loader2 size={48} className="animate-spin mb-4" />
         <div className="font-bold text-xl">Loading your maps...</div>
      </div>
    );
  }

  if (!activeProject) {
    return (
      <div className="w-full min-h-screen relative" style={{ backgroundColor: themeColor }}>
        {/* 右上角清理按钮 */}
        {isUIVisible && (
          <div className="absolute top-4 right-4 z-10">
            <button
            onClick={() => setShowCleanupMenu(!showCleanupMenu)}
            disabled={isRunningCleanup}
            className="p-3 bg-white/90 hover:bg-white rounded-full shadow-lg transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed relative"
            title="清理数据选项"
          >
            <RefreshCw
              size={20}
              className={`text-gray-700 ${isRunningCleanup ? 'animate-spin' : ''}`}
            />
          </button>

          {/* 清理选项菜单 */}
          {showCleanupMenu && (
            <div className="absolute top-full right-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 min-w-48 py-1 z-20">
              <button
                onClick={() => {
                  setShowCleanupMenu(false);
                  handleCleanupOrphanedData(false);
                }}
                disabled={isRunningCleanup}
                className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2"
              >
                <RefreshCw size={16} className="text-green-600" />
                <div>
                  <div className="font-medium">安全清理</div>
                  <div className="text-xs text-gray-500">只清理孤立数据和普通重复</div>
                </div>
              </button>

              <button
                onClick={() => {
                  setShowCleanupMenu(false);
                  handleCleanupOrphanedData(true);
                }}
                disabled={isRunningCleanup}
                className="w-full text-left px-4 py-3 text-sm hover:bg-red-50 transition-colors flex items-center gap-2"
              >
                <RefreshCw size={16} className="text-red-600" />
                <div>
                  <div className="font-medium">深度清理</div>
                  <div className="text-xs text-gray-500">清理所有重复（包括可疑的）</div>
                </div>
              </button>
            </div>
          )}
        </div>
        )}

        {/* 点击其他地方关闭菜单 */}
        {showCleanupMenu && (
          <div
            className="fixed inset-0 z-5"
            onClick={() => setShowCleanupMenu(false)}
          />
        )}

      <ProjectManager 
           projects={summariesToProjects(projectSummaries)}
         currentProjectId={null}
         onCreateProject={handleCreateProject}
           onSelectProject={handleSelectProject}
         onDeleteProject={handleDeleteProject}
         onUpdateProject={handleUpdateProject}
         onDuplicateProject={handleDuplicateProject}
          onCheckData={handleCheckData}
          onCleanupBrokenReferences={handleCleanupBrokenReferences}
         themeColor={themeColor}
         onThemeColorChange={handleThemeColorChange}
         mapUiChromeOpacity={mapUiChromeOpacity}
         onMapUiChromeOpacityChange={handleMapUiChromeOpacityChange}
         mapUiChromeBlurPx={mapUiChromeBlurPx}
         onMapUiChromeBlurPxChange={handleMapUiChromeBlurPxChange}
      />
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex flex-col bg-gray-50 overflow-hidden relative" style={{ touchAction: 'manipulation' }}>
      {/* Loading Progress Overlay */}
      {(isLoadingProject || isDeletingProject) && (
        <div className="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-8 shadow-2xl max-w-sm w-full mx-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-800 mb-4">
                {isDeletingProject ? '删除项目中...' : (currentProjectId ? '加载项目中...' : '检查数据中...')}
              </div>
              {isLoadingProject && (
                <>
                  <div className="w-full bg-gray-200 rounded-full h-4 mb-4">
                    <div
                      className="bg-blue-500 h-4 rounded-full transition-all duration-300"
                      style={{ width: `${loadingProgress}%` }}
                    ></div>
                  </div>
                  <div className="text-lg font-semibold text-gray-600">{loadingProgress}%</div>
                  {!currentProjectId && (
                    <div className="text-sm text-gray-500 mt-2">
                      正在修复图片数据和清理损坏文件...
                    </div>
                  )}
                </>
              )}
              {isDeletingProject && (
                <div className="flex items-center justify-center space-x-2">
                  <Loader2 size={24} className="animate-spin text-blue-500" />
                  <div className="text-sm text-gray-500">
                    正在删除项目文件...
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      <AnimatePresence>
      {isSidebarOpen && isUIVisible && (
          <div className="fixed inset-0 z-[2000] flex overflow-hidden">
             <motion.div 
               className="fixed inset-0 bg-black/20"
               onClick={() => setIsSidebarOpen(false)}
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               transition={{ duration: 0.2 }}
               style={{ willChange: 'opacity' }}
             />
             <motion.div 
               className="relative h-full w-[62%] z-[2001] overflow-hidden"
               initial={{ x: '-100%' }}
               animate={{ x: 0 }}
               exit={{ x: '-100%' }}
               transition={{ 
                 type: "tween", 
                 duration: 0.3, 
                 ease: [0.4, 0, 0.2, 1]
               }}
               style={{ willChange: 'transform' }}
             >
              <ProjectManager 
                 isSidebar
                 projects={summariesToProjects(projectSummaries)}
                 currentProjectId={currentProjectId}
                 onCreateProject={handleCreateProject}
                 onSelectProject={handleSelectProject}
                 onDeleteProject={handleDeleteProject}
         onUpdateProject={handleUpdateProject}
                 onDuplicateProject={handleDuplicateProject}
                 onCloseSidebar={() => setIsSidebarOpen(false)}
                  onBackToHome={() => {
                    setCurrentProjectId(null);
                    setActiveProject(null);
                  }}
                  viewMode={viewMode}
                  activeProject={activeProject}
                  onExportCSV={handleExportCSV}
                  syncStatus={syncStatus}
                  onCleanupBrokenReferences={handleCleanupBrokenReferences}
                  themeColor={themeColor}
                  onThemeColorChange={handleThemeColorChange}
                  currentMapStyle={mapStyle}
                  onMapStyleChange={(styleId) => {
                    setMapStyle(styleId);
                    set('mapp-map-style', styleId);
                  }}
              />
             </motion.div>
        </div>
      )}
      </AnimatePresence>

      <div className="flex-1 relative min-h-0 overflow-hidden z-0">
        
        {/* 同步状态指示器 - 只在侧边栏打开时显示（在侧边栏内） */}
        {/* 主视图中不再显示云图标，统一在侧边栏显示 */}
        
        {!isEditorOpen && !isBoardEditMode && isUIVisible && (
          <button
             onClick={(e) => {
               // 只有在没有拖动时才触发点击
               if (!sidebarButtonDragRef.current.isDragging) {
                 setIsSidebarOpen(true);
               }
             }}
             onMouseDown={(e) => {
               sidebarButtonDragRef.current = {
                 isDragging: false,
                 startY: e.clientY,
                 startButtonY: sidebarButtonY
               };
             }}
             onMouseMove={(e) => {
               const dragState = sidebarButtonDragRef.current;
               if (e.buttons === 1) { // 左键按下
                 const deltaY = e.clientY - dragState.startY;
                 if (Math.abs(deltaY) > 5) {
                   dragState.isDragging = true;
                   const newY = Math.max(0, Math.min(window.innerHeight - 50, dragState.startButtonY + deltaY));
                   setSidebarButtonY(newY);
                 }
               }
             }}
             onMouseUp={() => {
               // 延迟重置isDragging，确保onClick不会触发
               setTimeout(() => {
                 sidebarButtonDragRef.current.isDragging = false;
               }, 10);
             }}
             onTouchStart={(e) => {
               const touch = e.touches[0];
               sidebarButtonDragRef.current = {
                 isDragging: false,
                 startY: touch.clientY,
                 startButtonY: sidebarButtonY
               };
             }}
             onTouchMove={(e) => {
               const touch = e.touches[0];
               const dragState = sidebarButtonDragRef.current;
               const deltaY = touch.clientY - dragState.startY;
               if (Math.abs(deltaY) > 5) {
                 dragState.isDragging = true;
                 const newY = Math.max(0, Math.min(window.innerHeight - 50, dragState.startButtonY + deltaY));
                 setSidebarButtonY(newY);
               }
             }}
             onTouchEnd={() => {
               setTimeout(() => {
                 sidebarButtonDragRef.current.isDragging = false;
               }, 10);
             }}
            className="absolute left-0 z-[900] pl-3 pr-4 rounded-r-xl shadow-lg text-theme-chrome-fg transition-none cursor-move"
             style={{ 
               backgroundColor: themeColor,
               top: `${sidebarButtonY}px`, 
               paddingTop: '12.8px', 
               paddingBottom: '12.8px' 
             }}
             onMouseEnter={(e) => {
               const darkR = Math.max(0, Math.floor(parseInt(themeColor.slice(1, 3), 16) * 0.9));
               const darkG = Math.max(0, Math.floor(parseInt(themeColor.slice(3, 5), 16) * 0.9));
               const darkB = Math.max(0, Math.floor(parseInt(themeColor.slice(5, 7), 16) * 0.9));
               const darkHex = '#' + [darkR, darkG, darkB].map(x => {
                 const hex = x.toString(16);
                 return hex.length === 1 ? '0' + hex : hex;
               }).join('').toUpperCase();
               e.currentTarget.style.backgroundColor = darkHex;
             }}
             onMouseLeave={(e) => e.currentTarget.style.backgroundColor = themeColor}
          >
             <Menu size={18} />
          </button>
        )}

        {viewMode === 'map' ? (
          <MapView 
            project={activeProject}
            onAddNote={addNote}
            onUpdateNote={updateNote}
            onDeleteNote={deleteNote}
            onToggleEditor={setIsEditorOpen}
            onImportDialogChange={setIsImportDialogOpen}
            onUpdateProject={async (project) => {
              await projectState.updateProject(project);
            }}
            fileInputRef={mapViewFileInputRef}
            navigateToCoords={navigateToMapCoords}
            projectId={currentProjectId || ''}
            onNavigateComplete={() => {
              clearMapNavigation();
            }}
            onSwitchToBoardView={(coords, mapInstance) => {
              // PRIORITY 1: Save current map position BEFORE any other operations
              if (mapInstance && currentProjectId) {
                saveMapPosition(currentProjectId, mapInstance);
              }

              // PRIORITY 2: Close editor and prepare navigation
              setIsEditorOpen(false);

              // PRIORITY 3: Set navigation coordinates and switch view
                if (coords) {
                navigateToBoard(coords);
                }
                setViewMode('board');
            }}
            themeColor={themeColor}
            mapStyleId={mapStyle}
            onMapStyleChange={setMapStyle}
            showImportMenu={showMapImportMenu}
            setShowImportMenu={setShowMapImportMenu}
            showBorderPanel={showBorderPanel}
            setShowBorderPanel={setShowBorderPanel}
            borderGeoJSON={borderGeoJSON}
            setBorderGeoJSON={setBorderGeoJSON}
            onMapClick={() => {
              if (isEditorOpen) {
                setIsEditorOpen(false);
              }
            }}
            isUIVisible={isUIVisible}
            isRouteMode={isRouteMode}
            setIsRouteMode={setIsRouteMode}
            waypoints={waypoints}
            setWaypoints={setWaypoints}
            onThemeColorChange={handleThemeColorChange}
            mapUiChromeOpacity={mapUiChromeOpacity}
            mapUiChromeBlurPx={mapUiChromeBlurPx}
            onMapUiChromeOpacityChange={handleMapUiChromeOpacityChange}
            onMapUiChromeBlurPxChange={handleMapUiChromeBlurPxChange}
            panelChromeStyle={panelChromeStyle}
          />
        ) : viewMode === 'board' ? (
          <BoardView 
            notes={activeProject.notes || emptyNotes}
            onAddNote={addNote}
            onUpdateNote={updateNote}
            onDeleteNote={deleteNote}
            onDeleteNotesBatch={deleteNotesBatch}
            onToggleEditor={setIsEditorOpen}
            onEditModeChange={setIsBoardEditMode}
            frames={activeProject.frames || emptyFrames}
            onUpdateFrames={async (frames) => {
              if (!currentProjectId || !activeProject) return;
              await projectState.updateProject({ ...activeProject, frames });
            }}
            project={activeProject}
            onUpdateProject={handleUpdateProject}
            navigateToCoords={navigateToBoardCoords}
            projectId={currentProjectId || ''}
            onNavigateComplete={() => {
              clearBoardNavigation();
            }}
            onTransformChange={(x: number, y: number, scale: number) => {
              if (currentProjectId) {
                saveBoardPositionDirect(currentProjectId, x, y, scale);
              }
            }}
            onSwitchToMapView={(coords?: { lat: number; lng: number; zoom?: number }) => {
              // Close editor first to ensure UI state is correct
              setIsEditorOpen(false);

              // Prepare navigation coordinates
              let navigationCoords = coords;
              if (!navigationCoords && currentProjectId) {
                // Read cached position from previous map session
                const cached = getViewPositionCache(currentProjectId, 'map');
                if (cached?.center && cached.zoom) {
                  navigationCoords = {
                    lat: cached.center[0],
                    lng: cached.center[1],
                    zoom: cached.zoom
                  };
                }
              }

              // Set navigation coordinates and switch view
              navigateToMap(navigationCoords || undefined);
              setViewMode('map');
            }}
            onSwitchToBoardView={(coords?: { x: number; y: number }) => {
              if (coords) {
                navigateToBoard(coords);
              }
              setViewMode('board');
            }}
            mapViewFileInputRef={mapViewFileInputRef}
            themeColor={themeColor}
            panelChromeStyle={panelChromeStyle}
            chromeHoverBackground={mapChromeHoverBg}
            onThemeColorChange={handleThemeColorChange}
            mapUiChromeOpacity={mapUiChromeOpacity}
            onMapUiChromeOpacityChange={handleMapUiChromeOpacityChange}
            mapUiChromeBlurPx={mapUiChromeBlurPx}
            onMapUiChromeBlurPxChange={handleMapUiChromeBlurPxChange}
            mapStyleId={mapStyle}
            onMapStyleChange={setMapStyle}
          />
        ) : viewMode === 'graph' ? (
          <GraphView
            projectId={currentProjectId ?? ''}
            project={activeProject}
            themeColor={themeColor}
            isUIVisible={isUIVisible}
            onUpdateNote={updateNote}
            onDeleteNote={deleteNote}
            onToggleEditor={setIsEditorOpen}
            onUpdateConnections={async (connections) => {
              if (!currentProjectId || !activeProject) return;
              await projectState.updateProject({ ...activeProject, connections });
            }}
            onSwitchToBoardView={(coords?: { x: number; y: number }) => {
              if (coords) {
                navigateToBoard(coords);
              }
              setViewMode('board');
            }}
            onSwitchToMapView={(coords?: { lat: number; lng: number; zoom?: number }) => {
              setIsEditorOpen(false);
              let navigationCoords = coords;
              if (!navigationCoords && currentProjectId) {
                const cached = getViewPositionCache(currentProjectId, 'map');
                if (cached?.center && cached.zoom) {
                  navigationCoords = {
                    lat: cached.center[0],
                    lng: cached.center[1],
                    zoom: cached.zoom
                  };
                }
              }
              navigateToMap(navigationCoords || undefined);
              setViewMode('map');
            }}
            panelChromeStyle={panelChromeStyle}
            chromeHoverBackground={mapChromeHoverBg}
            onThemeColorChange={handleThemeColorChange}
            mapUiChromeOpacity={mapUiChromeOpacity}
            onMapUiChromeOpacityChange={handleMapUiChromeOpacityChange}
            mapUiChromeBlurPx={mapUiChromeBlurPx}
            onMapUiChromeBlurPxChange={handleMapUiChromeBlurPxChange}
            mapStyleId={mapStyle}
            onMapStyleChange={setMapStyle}
            onUpdateProject={handleUpdateProject}
          />
        ) : (
          <TableView 
            project={activeProject}
            onUpdateNote={updateNote}
            onDeleteNote={deleteNote}
            onUpdateFrames={async (frames) => {
              if (!currentProjectId || !activeProject) return;
              await projectState.updateProject({ ...activeProject, frames });
            }}
            onUpdateConnections={async (connections) => {
              if (!currentProjectId || !activeProject) return;
              await projectState.updateProject({ ...activeProject, connections });
            }}
            onSwitchToBoardView={(coords?: { x: number; y: number }) => {
              if (coords) {
                navigateToBoard(coords);
              }
              setViewMode('board');
            }}
            themeColor={themeColor}
            panelChromeStyle={panelChromeStyle}
            isUIVisible={isUIVisible}
            chromeHoverBackground={mapChromeHoverBg}
            onThemeColorChange={handleThemeColorChange}
            mapUiChromeOpacity={mapUiChromeOpacity}
            onMapUiChromeOpacityChange={handleMapUiChromeOpacityChange}
            mapUiChromeBlurPx={mapUiChromeBlurPx}
            onMapUiChromeBlurPxChange={handleMapUiChromeBlurPxChange}
            mapStyleId={mapStyle}
            onMapStyleChange={setMapStyle}
            projectId={currentProjectId ?? ''}
            onUpdateProject={handleUpdateProject}
          />
        )}
      </div>

      {!isEditorOpen && !isBoardEditMode && isUIVisible && (
        <div
          data-allow-context-menu
          className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[min(100vw-1rem,28rem)] p-1.5 rounded-2xl shadow-xl border flex flex-wrap justify-center gap-1 animate-in slide-in-from-bottom-4 fade-in ${
            panelChromeStyle ? 'border-gray-200/80 ring-1 ring-black/[0.04]' : 'border-white/50 map-chrome-surface-fallback'
          }`}
          style={panelChromeStyle}
        >
          <button
            onClick={() => !isImportDialogOpen && setViewMode('map')}
            disabled={isImportDialogOpen}
            className={`
              flex items-center gap-2 ${viewMode === 'map' ? 'px-4' : 'px-3'} py-2 rounded-xl transition-all font-bold text-sm
              ${viewMode === 'map' 
                ? 'text-theme-chrome-fg shadow-md scale-105' 
                : 'hover:bg-gray-100 text-gray-500'}
              ${isImportDialogOpen ? 'opacity-50 cursor-not-allowed' : ''}
            `}
            style={viewMode === 'map' ? { backgroundColor: themeColor } : undefined}
          >
            <MapIcon size={20} />
            {viewMode === 'map' && 'Mapping'}
          </button>
          <button
            onClick={() => {
              if (!isImportDialogOpen) {
                setViewMode('board');
              }
            }}
            disabled={isImportDialogOpen}
            className={`
              flex items-center gap-2 ${viewMode === 'board' ? 'px-4' : 'px-3'} py-2 rounded-xl transition-all font-bold text-sm
              ${viewMode === 'board' 
                ? 'text-theme-chrome-fg shadow-md scale-105' 
                : 'hover:bg-gray-100 text-gray-500'}
              ${isImportDialogOpen ? 'opacity-50 cursor-not-allowed' : ''}
            `}
            style={viewMode === 'board' ? { backgroundColor: themeColor } : undefined}
          >
            <Grid size={20} />
            {viewMode === 'board' && 'Board'}
          </button>
          <button
            onClick={() => !isImportDialogOpen && setViewMode('graph')}
            disabled={isImportDialogOpen}
            className={`
              flex items-center gap-2 ${viewMode === 'graph' ? 'px-4' : 'px-3'} py-2 rounded-xl transition-all font-bold text-sm
              ${viewMode === 'graph' 
                ? 'text-theme-chrome-fg shadow-md scale-105' 
                : 'hover:bg-gray-100 text-gray-500'}
              ${isImportDialogOpen ? 'opacity-50 cursor-not-allowed' : ''}
            `}
            style={viewMode === 'graph' ? { backgroundColor: themeColor } : undefined}
          >
            <GitBranch size={20} />
            {viewMode === 'graph' && 'graph'}
          </button>
          <button
            onClick={() => !isImportDialogOpen && setViewMode('table')}
            disabled={isImportDialogOpen}
            className={`
              flex items-center gap-2 ${viewMode === 'table' ? 'px-4' : 'px-3'} py-2 rounded-xl transition-all font-bold text-sm
              ${viewMode === 'table' 
                ? 'text-theme-chrome-fg shadow-md scale-105' 
                : 'hover:bg-gray-100 text-gray-500'}
              ${isImportDialogOpen ? 'opacity-50 cursor-not-allowed' : ''}
            `}
            style={viewMode === 'table' ? { backgroundColor: themeColor } : undefined}
          >
            <Table2 size={20} />
            {viewMode === 'table' && 'Table'}
          </button>
        </div>
      )}

    </div>
  );
}

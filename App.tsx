
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Map as MapIcon, Grid, Menu, Loader2, Table2, Cloud, CloudOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapView } from './components/MapView';
import { BoardView } from './components/BoardView';
import { TableView } from './components/TableView';
import { ProjectManager } from './components/ProjectManager';
import { Note, ViewMode, Project } from './types';
import { get, set } from 'idb-keyval';
import { THEME_COLOR, THEME_COLOR_DARK, MAP_STYLE_OPTIONS } from './constants';
import { 
  syncProjectsToCloud, 
  loadProjectsFromCloud, 
  mergeProjects, 
  shouldSync,
  getLastSyncTime,
  type SyncStatus 
} from './utils/sync';
import {
  migrateFromOldFormat,
  loadAllProjects,
  loadProjectSummaries,
  saveProject,
  deleteProject as deleteProjectStorage,
  loadProject,
  deleteImage,
  deleteSketch,
  getViewPositionCache,
  setViewPositionCache,
  clearViewPositionCache,
  checkStorageUsage,
  checkStorageDetails,
  analyzeStorageRedundancy,
  cleanupCorruptedImages,
  cleanupLargeImages,
  cleanupDuplicateImages,
  attemptImageRecovery,
  loadNoteImages,
  ProjectSummary
} from './utils/storage';

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isBoardEditMode, setIsBoardEditMode] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const mapViewFileInputRef = useRef<HTMLInputElement | null>(null);
  const [sidebarButtonY, setSidebarButtonY] = useState(96); // 初始值，将在 useEffect 中更新为屏幕中间
  const sidebarButtonDragRef = useRef({ isDragging: false, startY: 0, startButtonY: 0 });
  
  // Set initial sidebar button position to vertical center
  useEffect(() => {
    // Calculate center position: (window height - button height) / 2
    // Button height is approximately 50px (padding + icon size)
    const centerY = (window.innerHeight - 50) / 2;
    setSidebarButtonY(centerY);
  }, []);
  
  // Navigation state for cross-view positioning
  const [navigateToMapCoords, setNavigateToMapCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [navigateToBoardCoords, setNavigateToBoardCoords] = useState<{ x: number; y: number } | null>(null);
  
  // Project State
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectSummaries, setProjectSummaries] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  
  // Save map position to cache when switching away from map view
  const saveMapPositionBeforeSwitch = useCallback((mapInstance: any) => {
    if (currentProjectId && mapInstance) {
      try {
        const center = mapInstance.getCenter();
        const zoom = mapInstance.getZoom();
        if (center && typeof center.lat === 'number' && typeof center.lng === 'number') {
          setViewPositionCache(currentProjectId, 'map', { center: [center.lat, center.lng], zoom });
        }
      } catch (err) {
        console.warn('[App] Failed to get map position:', err);
      }
    }
  }, [currentProjectId]);

  // Save board position to cache when switching away from board view
  const saveBoardPositionBeforeSwitch = useCallback((x: number, y: number, scale: number) => {
    if (currentProjectId) {
      setViewPositionCache(currentProjectId, 'board', { x, y, scale });
    }
  }, [currentProjectId]);

  // Stable callback for map position changes - save to cache
  const handleMapPositionChange = useCallback((center: [number, number], zoom: number) => {
    if (currentProjectId) {
      setViewPositionCache(currentProjectId, 'map', { center, zoom });
    }
  }, [currentProjectId]);

  // Stable callback for board transform changes - save to cache
  const handleBoardTransformChange = useCallback((x: number, y: number, scale: number) => {
    if (currentProjectId) {
      setViewPositionCache(currentProjectId, 'board', { x, y, scale });
    }
  }, [currentProjectId]);

  // Load complete project data with progress
  const loadCompleteProject = useCallback(async (projectId: string): Promise<Project | null> => {
    setIsLoadingProject(true);
    setLoadingProgress(0);

    try {
      // Step 1: Load project without images (10%)
      setLoadingProgress(10);
      const project = await loadProject(projectId, false);
      if (!project) return null;

      // Step 2: Load images for each note (remaining 90%)
      if (project.notes.length > 0) {
        const totalNotes = project.notes.length;
        let loadedNotes = 0;

        // Load images in batches to show progress
        const batchSize = 5;
        for (let i = 0; i < totalNotes; i += batchSize) {
          const batch = project.notes.slice(i, i + batchSize);
          await Promise.all(
            batch.map(async (note, index) => {
              const loadedNote = await loadNoteImages(note);
              // Update the note in the project
              project.notes[i + index] = loadedNote;
            })
          );

          loadedNotes += batch.length;
          const progress = 10 + (loadedNotes / totalNotes) * 90;
          setLoadingProgress(Math.min(100, Math.round(progress)));
        }
      } else {
        setLoadingProgress(100);
      }

      return project;
    } finally {
      setIsLoadingProject(false);
      setLoadingProgress(0);
    }
  }, []);

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
      themeColor: THEME_COLOR
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

      // Step 3: Clean up duplicate images (50%)
      setLoadingProgress(50);
      const duplicateCleanupResult = await cleanupDuplicateImages();
      if (duplicateCleanupResult && duplicateCleanupResult.imagesCleaned > 0) {
        console.log(`Cleaned ${duplicateCleanupResult.imagesCleaned} duplicate images, freed ${duplicateCleanupResult.spaceFreed.toFixed(2)}MB`);
      }

      // Step 4: Clean up large images (>2MB) (70%)
      setLoadingProgress(70);
      const largeCleanupResult = await cleanupLargeImages(2);
      if (largeCleanupResult.imagesCleaned > 0) {
        console.log(`Cleaned ${largeCleanupResult.imagesCleaned} large images, freed ${largeCleanupResult.spaceFreed.toFixed(2)}MB`);
      }

      // Step 5: Refresh project summaries (90%)
      setLoadingProgress(90);
      const summaries = await loadProjectSummaries();
      setProjectSummaries(summaries);

      // Step 6: Complete (100%)
      setLoadingProgress(100);

      console.log('Data check and repair completed');
    } catch (error) {
      console.error('Data check failed:', error);
    } finally {
      setIsLoadingProject(false);
      setLoadingProgress(0);
    }
  }, []);

  // Project selection handler with loading
  const handleSelectProject = useCallback(async (id: string) => {
    if (currentProjectId && currentProjectId !== id) {
      console.log('[App] Clearing cache for old project:', currentProjectId);
      clearViewPositionCache(currentProjectId);
    }

    setCurrentProjectId(id);
    setIsSidebarOpen(false);
    setNavigateToMapCoords(null); // Clear navigation intent on project switch
    setNavigateToBoardCoords(null); // Clear navigation intent on project switch

    // Load complete project data
    const completeProject = await loadCompleteProject(id);
    if (completeProject) {
      // Update the project in the projects array
      setProjects(prev => {
        const existingIndex = prev.findIndex(p => p.id === id);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = completeProject;
          return updated;
        } else {
          return [...prev, completeProject];
        }
      });
    }
  }, [currentProjectId, loadCompleteProject]);

  // Cloud Sync State
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);

  // Theme Color State
  const [themeColor, setThemeColor] = useState<string>(THEME_COLOR);
  
  // Map Style State
  const [mapStyle, setMapStyle] = useState<string>('carto-light-nolabels');

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

  // Load Projects from IndexedDB and Cloud
  useEffect(() => {
    const loadProjects = async () => {
      try {
        // 1. 快速加载项目摘要（只显示项目列表）
        const summaries = await loadProjectSummaries();
        setProjectSummaries(summaries);
        setIsLoading(false);

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
                    // 保存合并后的项目
                    for (const project of merged) {
                      await saveProject(project);
                    }
                    // 更新项目摘要
                    const summaries = await loadProjectSummaries();
                    setProjectSummaries(summaries);
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

  // Disable browser two-finger zoom
  useEffect(() => {
    const preventZoom = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    };
    
    const preventGesture = (e: Event) => {
      e.preventDefault();
    };
    
    document.addEventListener('touchstart', preventZoom, { passive: false });
    document.addEventListener('touchmove', preventZoom, { passive: false });
    document.addEventListener('gesturestart', preventGesture);
    document.addEventListener('gesturechange', preventGesture);
    document.addEventListener('gestureend', preventGesture);
    
    return () => {
      document.removeEventListener('touchstart', preventZoom);
      document.removeEventListener('touchmove', preventZoom);
      document.removeEventListener('gesturestart', preventGesture);
      document.removeEventListener('gesturechange', preventGesture);
      document.removeEventListener('gestureend', preventGesture);
    };
  }, []);

  // Save to IndexedDB and Cloud
  useEffect(() => {
    if (!isLoading && projects.length > 0) {
      // 1. 保存到本地 IndexedDB（使用新格式）
      Promise.all(projects.map(p => saveProject(p))).catch((err) => {
        console.error("Failed to save projects to IDB", err);
        if (err.name === 'QuotaExceededError') {
          alert("Storage Limit Reached. Please delete some projects or images.");
        }
      });
      
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

  // Load full project with images when needed
  const [activeProject, setActiveProject] = useState<Project | undefined>(
    projects.find(p => p.id === currentProjectId)
  );

  // Load full project with images when project changes
  useEffect(() => {
    const loadActiveProject = async () => {
      if (currentProjectId) {
        // Load project with images for display
        const fullProject = await loadProject(currentProjectId, true);
        if (fullProject) {
          setActiveProject(fullProject);
        }
      } else {
        setActiveProject(undefined);
      }
    };
    loadActiveProject();
  }, [currentProjectId]);

  // Update activeProject when projects array changes (but keep images loaded)
  useEffect(() => {
    if (currentProjectId && activeProject) {
      const updatedProject = projects.find(p => p.id === currentProjectId);
      if (updatedProject) {
        // Merge: use updated metadata from projects, but keep images from activeProject
        setActiveProject(prev => {
          if (!prev) return updatedProject;
          
          // Create a map of existing notes with loaded images
          const prevNotesMap = new Map<string, Note>(prev.notes.map(n => [n.id, n]));
          
          // Build new notes array: keep loaded images for existing notes, add new notes
          const newNotes = updatedProject.notes.map((updatedNote: Note) => {
            const prevNote: Note | undefined = prevNotesMap.get(updatedNote.id);
            if (prevNote) {
              // Note exists, keep loaded images/sketch unless the updated note has newer data
              // Check if the updated note has images/sketch that differ from the cached version
              const hasNewImages = updatedNote.images && updatedNote.images.length > 0 &&
                (!prevNote.images || prevNote.images.length !== updatedNote.images.length ||
                 !prevNote.images.every((img, idx) => img === updatedNote.images?.[idx]));
              const hasNewSketch = updatedNote.sketch && updatedNote.sketch !== prevNote.sketch;

              return {
                ...updatedNote,
                images: hasNewImages ? updatedNote.images : (prevNote.images || []),
                sketch: hasNewSketch ? updatedNote.sketch : prevNote.sketch
              };
            } else {
              // New note, will need to load images when displayed
              return updatedNote;
            }
          });
          
          return {
            ...updatedProject,
            notes: newNotes,
            frames: updatedProject.frames || prev.frames || [],
            connections: updatedProject.connections || prev.connections || [],
            backgroundImage: prev.backgroundImage || updatedProject.backgroundImage
          };
        });
      }
    }
  }, [projects, currentProjectId]);

  const addNote = (note: Note) => {
    if (!currentProjectId) return;
    setProjects(prev => prev.map(p => {
        if (p.id === currentProjectId) {
            return { ...p, notes: [...p.notes, note] };
        }
        return p;
    }));
  };

  const updateNote = (updatedNote: Note) => {
    if (!currentProjectId) return;
    setProjects(prev => prev.map(p => {
        if (p.id === currentProjectId) {
            return { ...p, notes: p.notes.map(n => n.id === updatedNote.id ? updatedNote : n) };
        }
        return p;
    }));
  };

  const deleteNote = async (noteId: string) => {
    if (!currentProjectId) return;
    
    // Find the note to delete (to get its images)
    const project = projects.find(p => p.id === currentProjectId);
    const noteToDelete = project?.notes.find(n => n.id === noteId);
    
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
    
    // Update projects state
    setProjects(prev => prev.map(p => {
        if (p.id === currentProjectId) {
            // 删除便利贴时，同时删除相关的连接
            const updatedConnections = (p.connections || []).filter(
              conn => conn.fromNoteId !== noteId && conn.toNoteId !== noteId
            );
            return { 
              ...p, 
              notes: p.notes.filter(n => n.id !== noteId),
              connections: updatedConnections
            };
        }
        return p;
    }));
    
    // Update activeProject
    if (activeProject && activeProject.id === currentProjectId) {
      setActiveProject(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          notes: prev.notes.filter(n => n.id !== noteId),
          connections: (prev.connections || []).filter(
            conn => conn.fromNoteId !== noteId && conn.toNoteId !== noteId
          )
        };
      });
    }
  };

  const handleExportCSV = (project: Project) => {
    // 只导出标准便签（不包括小便签和纯文本）
    const standardNotes = project.notes.filter(note => 
      note.variant !== 'compact'
    );
    
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
    setProjects(prev => [...prev, project]);
    setCurrentProjectId(project.id);
    setViewMode('map');
    // 确保创建项目后侧边栏保持关闭
    setIsSidebarOpen(false);
    // 立即设置 activeProject 以确保界面立即切换到项目视图
    // 使用传入的 project 对象，因为它已经包含了所有必要的信息
    setActiveProject(project);
    // 异步加载完整项目（包含图片）以更新 activeProject
    try {
      const fullProject = await loadProject(project.id, true);
      if (fullProject) {
        setActiveProject(fullProject);
      }
    } catch (error) {
      console.error('Failed to load project after creation:', error);
      // 即使加载失败，也保持使用传入的 project，确保界面能正常显示
    }
  };

  const handleDeleteProject = async (id: string) => {
    setIsDeletingProject(true);
    try {
      await deleteProjectStorage(id);
      // 更新项目列表
      setProjectSummaries(prev => prev.filter(p => p.id !== id));
      // 更新完整项目数据（如果已加载）
      setProjects(prev => prev.filter(p => p.id !== id));
      // 如果当前项目被删除，回到首页
      if (currentProjectId === id) {
        setCurrentProjectId(null);
      }
    } finally {
      setIsDeletingProject(false);
    }
  };

  const handleUpdateProject = (projectOrId: Project | string, updates?: Partial<Project>) => {
    // Support both signatures: (project: Project) and (id: string, updates: Partial<Project>)
    if (typeof projectOrId === 'string') {
      // Old signature: (id: string, updates: Partial<Project>)
      setProjects(prev => prev.map(p => 
        p.id === projectOrId ? { ...p, ...updates } : p
      ));
    } else {
      // New signature: (project: Project)
      setProjects(prev => prev.map(p => 
        p.id === projectOrId.id ? projectOrId : p
      ));
    }
  };

  const handleThemeColorChange = (color: string) => {
    setThemeColor(color);
    // Force re-render by updating a dummy state or using window.location.reload()
    // For now, we'll just update the CSS variables which should be enough
    window.location.reload();
  };

  if (isLoading) {
    return (
      <div className="w-full min-h-screen flex flex-col items-center justify-center text-white" style={{ backgroundColor: themeColor }}>
         <Loader2 size={48} className="animate-spin mb-4" />
         <div className="font-bold text-xl">Loading your maps...</div>
      </div>
    );
  }

  if (!activeProject) {
    return (
      <div className="w-full min-h-screen" style={{ backgroundColor: themeColor }}>
      <ProjectManager
         projects={summariesToProjects(projectSummaries)}
         currentProjectId={null}
         onCreateProject={handleCreateProject}
         onSelectProject={handleSelectProject}
         onDeleteProject={handleDeleteProject}
         onUpdateProject={handleUpdateProject}
         onCheckData={handleCheckData}
         themeColor={themeColor}
         onThemeColorChange={handleThemeColorChange}
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
      {isSidebarOpen && (
          <div className="fixed inset-0 z-[2000] flex overflow-hidden">
             <motion.div 
               className="fixed inset-0 bg-black/20 backdrop-blur-sm" 
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
                 onCloseSidebar={() => setIsSidebarOpen(false)}
                  onBackToHome={() => { setCurrentProjectId(null); }}
                  viewMode={viewMode}
                  activeProject={activeProject}
                  onExportCSV={handleExportCSV}
                  syncStatus={syncStatus}
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

      <div className="flex-1 relative overflow-hidden z-0">
        
        {/* 同步状态指示器 - 只在侧边栏打开时显示（在侧边栏内） */}
        {/* 主视图中不再显示云图标，统一在侧边栏显示 */}
        
        {!isEditorOpen && !isBoardEditMode && (
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
            className="absolute left-0 z-[900] pl-3 pr-4 rounded-r-xl shadow-lg text-white transition-none cursor-move"
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
            onUpdateProject={(project) => {
              if (!currentProjectId) return;
              setProjects(prev => prev.map(p => 
                p.id === currentProjectId ? project : p
              ));
            }}
            fileInputRef={mapViewFileInputRef}
            navigateToCoords={navigateToMapCoords}
            projectId={currentProjectId || ''}
            onNavigateComplete={() => {
              setNavigateToMapCoords(null);
            }}
            onPositionChange={handleMapPositionChange}
            onSwitchToBoardView={(coords) => {
              // Close editor first to ensure UI state is correct
              setIsEditorOpen(false);
              // Use requestAnimationFrame to ensure state updates are batched
              requestAnimationFrame(() => {
                if (coords) {
                  setNavigateToBoardCoords(coords);
                }
                setViewMode('board');
              });
            }}
            themeColor={themeColor}
            mapStyleId={mapStyle}
          />
        ) : viewMode === 'board' ? (
          <BoardView 
            notes={activeProject.notes}
            onAddNote={addNote}
            onUpdateNote={updateNote}
            onDeleteNote={deleteNote}
            onToggleEditor={setIsEditorOpen}
            onEditModeChange={setIsBoardEditMode}
            connections={activeProject.connections || []}
            onUpdateConnections={(connections) => {
              if (!currentProjectId) return;
              setProjects(prev => prev.map(p => {
                if (p.id === currentProjectId) {
                  return { ...p, connections };
                }
                return p;
              }));
            }}
            frames={activeProject.frames || []}
            onUpdateFrames={(frames) => {
              if (!currentProjectId) return;
              setProjects(prev => prev.map(p => {
                if (p.id === currentProjectId) {
                  return { ...p, frames };
                }
                return p;
              }));
            }}
            project={activeProject}
            onUpdateProject={(projectUpdate) => {
              if (!currentProjectId) return;
              setProjects(prev => prev.map(p => 
                p.id === currentProjectId ? { ...p, ...projectUpdate } : p
              ));
            }}
            navigateToCoords={navigateToBoardCoords}
            projectId={currentProjectId || ''}
            onNavigateComplete={() => {
              setNavigateToBoardCoords(null);
            }}
            onTransformChange={handleBoardTransformChange}
            onSwitchToMapView={(coords?: { lat: number; lng: number }) => {
              // Close editor first to ensure UI state is correct
              setIsEditorOpen(false);
              // Switch view first, then set navigation coordinates after a short delay
              // This ensures MapView is mounted and ready to receive navigation
              setViewMode('map');
              // Set navigation coordinates after MapView has mounted
              if (coords) {
                setTimeout(() => {
                  setNavigateToMapCoords(coords);
                }, 100);
              }
              // Trigger MapView's file input after a short delay
              setTimeout(() => {
                mapViewFileInputRef.current?.click();
              }, 300);
            }}
            onSwitchToBoardView={(coords?: { x: number; y: number }) => {
              if (coords) {
                setNavigateToBoardCoords(coords);
              }
              setViewMode('board');
            }}
            mapViewFileInputRef={mapViewFileInputRef}
            themeColor={themeColor}
          />
        ) : (
          <TableView 
            project={activeProject}
            onUpdateNote={updateNote}
            onUpdateFrames={(frames) => {
              if (!currentProjectId) return;
              setProjects(prev => prev.map(p => {
                if (p.id === currentProjectId) {
                  return { ...p, frames };
                }
                return p;
              }));
            }}
            onSwitchToBoardView={(coords?: { x: number; y: number }) => {
              if (coords) {
                setNavigateToBoardCoords(coords);
              }
              setViewMode('board');
            }}
          />
        )}
      </div>

      {!isEditorOpen && !isBoardEditMode && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-white/90 backdrop-blur-md p-1.5 rounded-2xl shadow-xl border border-white/50 flex gap-1 animate-in slide-in-from-bottom-4 fade-in">
          <button
            onClick={() => !isImportDialogOpen && setViewMode('map')}
            disabled={isImportDialogOpen}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-bold text-sm
              ${viewMode === 'map' 
                ? 'text-white shadow-md scale-105' 
                : 'hover:bg-gray-100 text-gray-500'}
              ${isImportDialogOpen ? 'opacity-50 cursor-not-allowed' : ''}
            `}
            style={viewMode === 'map' ? { backgroundColor: themeColor } : undefined}
          >
            <MapIcon size={20} />
            Mapping
          </button>
          <button
            onClick={() => {
              if (!isImportDialogOpen) {
                setViewMode('board');
              }
            }}
            disabled={isImportDialogOpen}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-bold text-sm
              ${viewMode === 'board' 
                ? 'text-white shadow-md scale-105' 
                : 'hover:bg-gray-100 text-gray-500'}
              ${isImportDialogOpen ? 'opacity-50 cursor-not-allowed' : ''}
            `}
            style={viewMode === 'board' ? { backgroundColor: themeColor } : undefined}
          >
            <Grid size={20} />
            Board
          </button>
          <button
            onClick={() => !isImportDialogOpen && setViewMode('table')}
            disabled={isImportDialogOpen}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-bold text-sm
              ${viewMode === 'table' 
                ? 'text-white shadow-md scale-105' 
                : 'hover:bg-gray-100 text-gray-500'}
              ${isImportDialogOpen ? 'opacity-50 cursor-not-allowed' : ''}
            `}
            style={viewMode === 'table' ? { backgroundColor: themeColor } : undefined}
          >
            <Table2 size={20} />
            Table
          </button>
        </div>
      )}

    </div>
  );
}

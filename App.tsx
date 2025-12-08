
import React, { useState, useEffect, useRef } from 'react';
import { Map as MapIcon, Grid, Menu, Loader2, Table2, Cloud, CloudOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapView } from './components/MapView';
import { BoardView } from './components/BoardView';
import { TableView } from './components/TableView';
import { ProjectManager } from './components/ProjectManager';
import { Note, ViewMode, Project } from './types';
import { get, set } from 'idb-keyval';
import { THEME_COLOR, THEME_COLOR_DARK } from './constants';
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
  saveProject,
  deleteProject as deleteProjectStorage,
  loadProject,
  deleteImage,
  deleteSketch
} from './utils/storage';

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isBoardEditMode, setIsBoardEditMode] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const mapViewFileInputRef = useRef<HTMLInputElement | null>(null);
  const [sidebarButtonY, setSidebarButtonY] = useState(96); // 初始位置 top-24 = 96px
  const sidebarButtonDragRef = useRef({ isDragging: false, startY: 0, startButtonY: 0 });
  
  // Navigation state for cross-view positioning
  const [navigateToMapCoords, setNavigateToMapCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [navigateToBoardCoords, setNavigateToBoardCoords] = useState<{ x: number; y: number } | null>(null);
  
  // Project State
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  
  // Cloud Sync State
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);

  // Theme Color State
  const [themeColor, setThemeColor] = useState<string>(THEME_COLOR);

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

  // Load Projects from IndexedDB and Cloud
  useEffect(() => {
    const loadProjects = async () => {
      try {
        // 1. 数据迁移（从旧格式到新格式）
        await migrateFromOldFormat();
        
        // 2. 从新格式加载项目（不加载图片，用于快速显示）
        let localProjects: Project[] = await loadAllProjects(false);
        
        if (localProjects.length > 0) {
          setProjects(localProjects);
        }
        
        setIsLoading(false);
        
        // 3. 然后从云端同步（后台进程）
        try {
          setSyncStatus('syncing');
          const cloudResult = await loadProjectsFromCloud();
          
          if (cloudResult.success && cloudResult.projects) {
            // 合并本地和云端数据
            const merged = mergeProjects(localProjects, cloudResult.projects);
            
            // 如果合并后的数据与本地不同，更新本地
            const localIds = new Set(localProjects.map(p => p.id));
            const mergedIds = new Set(merged.map(p => p.id));
            const hasChanges = localProjects.length !== merged.length ||
              [...localIds].some(id => !mergedIds.has(id)) ||
              merged.some(p => {
                const local = localProjects.find(lp => lp.id === p.id);
                return !local || (local.version || 0) < (p.version || 0);
              });
            
            if (hasChanges) {
              // 保存合并后的项目
              for (const project of merged) {
                await saveProject(project);
              }
              setProjects(merged);
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
            if (localProjects.length > 0) {
              await syncProjectsToCloud(localProjects);
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
      
      // 2. 延迟同步到云端（防抖，避免频繁同步）
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
          const prevNotesMap = new Map(prev.notes.map(n => [n.id, n]));
          
          // Build new notes array: keep loaded images for existing notes, add new notes
          const newNotes = updatedProject.notes.map(updatedNote => {
            const prevNote = prevNotesMap.get(updatedNote.id);
            if (prevNote) {
              // Note exists, keep loaded images
              return { ...updatedNote, images: prevNote.images, sketch: prevNote.sketch };
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
      note.variant !== 'text' && note.variant !== 'compact'
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

  const handleCreateProject = (project: Project) => {
    setProjects(prev => [...prev, project]);
    setCurrentProjectId(project.id);
    setViewMode('map');
    // 确保创建项目后侧边栏保持关闭
    setIsSidebarOpen(false);
  };

  const handleDeleteProject = async (id: string) => {
    await deleteProjectStorage(id);
    setProjects(prev => prev.filter(p => p.id !== id));
    if (currentProjectId === id) {
        setCurrentProjectId(null);
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
      <div className="w-full min-h-screen flex flex-col items-center justify-center text-yellow-900" style={{ backgroundColor: themeColor }}>
         <Loader2 size={48} className="animate-spin mb-4" />
         <div className="font-bold text-xl">Loading your maps...</div>
      </div>
    );
  }

  if (!activeProject) {
    return (
      <div className="w-full min-h-screen" style={{ backgroundColor: themeColor }}>
      <ProjectManager 
         projects={projects}
         currentProjectId={null}
         onCreateProject={handleCreateProject}
         onSelectProject={setCurrentProjectId}
         onDeleteProject={handleDeleteProject}
         onUpdateProject={handleUpdateProject}
         themeColor={themeColor}
         onThemeColorChange={handleThemeColorChange}
      />
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex flex-col bg-gray-50 overflow-hidden relative" style={{ touchAction: 'manipulation' }}>
      
      <AnimatePresence>
      {isSidebarOpen && (
          <div className="fixed inset-0 z-[2000] flex overflow-hidden">
             <motion.div 
               className="fixed inset-0 bg-black/20 backdrop-blur-sm" 
               onClick={() => setIsSidebarOpen(false)}
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
             />
             <motion.div 
               className="relative h-full w-[62%] z-[2001] overflow-hidden"
               initial={{ x: '-62%' }}
               animate={{ x: 0 }}
               exit={{ x: '-62%' }}
               transition={{ type: "spring", damping: 25, stiffness: 200 }}
             >
              <ProjectManager 
                 isSidebar
                 projects={projects}
                 currentProjectId={currentProjectId}
                 onCreateProject={handleCreateProject}
                 onSelectProject={(id) => { setCurrentProjectId(id); setIsSidebarOpen(false); }}
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
             className="absolute left-0 z-[900] pl-3 pr-4 rounded-r-xl shadow-lg text-yellow-950 transition-none cursor-move"
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
            onNavigateComplete={() => setNavigateToMapCoords(null)}
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
            onNavigateComplete={() => setNavigateToBoardCoords(null)}
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
                ? 'text-yellow-950 shadow-md scale-105' 
                : 'hover:bg-gray-100 text-gray-500'}
              ${isImportDialogOpen ? 'opacity-50 cursor-not-allowed' : ''}
            `}
            style={viewMode === 'map' ? { backgroundColor: themeColor } : undefined}
          >
            <MapIcon size={20} />
            Mapping
          </button>
          <button
            onClick={() => !isImportDialogOpen && setViewMode('board')}
            disabled={isImportDialogOpen}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-bold text-sm
              ${viewMode === 'board' 
                ? 'text-yellow-950 shadow-md scale-105' 
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
                ? 'text-yellow-950 shadow-md scale-105' 
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

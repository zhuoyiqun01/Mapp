
import React, { useState, useEffect, useRef } from 'react';
import { Map, Grid, Menu, Loader2, Table2, Cloud, CloudOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapView } from './components/MapView';
import { BoardView } from './components/BoardView';
import { TableView } from './components/TableView';
import { ProjectManager } from './components/ProjectManager';
import { Note, ViewMode, Project } from './types';
import { get, set } from 'idb-keyval';
import { 
  syncProjectsToCloud, 
  loadProjectsFromCloud, 
  mergeProjects, 
  shouldSync,
  getLastSyncTime,
  type SyncStatus 
} from './utils/sync';

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isBoardEditMode, setIsBoardEditMode] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const mapViewFileInputRef = useRef<HTMLInputElement | null>(null);
  const [sidebarButtonY, setSidebarButtonY] = useState(96); // 初始位置 top-24 = 96px
  const sidebarButtonDragRef = useRef({ isDragging: false, startY: 0, startButtonY: 0 });
  
  // Project State
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  
  // Cloud Sync State
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);

  // Load Projects from IndexedDB and Cloud
  useEffect(() => {
    const loadProjects = async () => {
      try {
        // 1. First load from local IndexedDB (quick display)
        const storedProjects = await get<Project[]>('mapp-projects');
        let localProjects: Project[] = [];
        
        if (storedProjects) {
          localProjects = storedProjects;
          setProjects(storedProjects);
        } else {
          // Migration: Check localStorage one last time
          const localData = localStorage.getItem('mapp-projects');
          if (localData) {
             try {
               const parsed = JSON.parse(localData);
               localProjects = parsed;
               setProjects(parsed);
               // Migrate to IDB
               await set('mapp-projects', parsed);
               // Clear LocalStorage
               localStorage.removeItem('mapp-projects');
             } catch (e) {
               console.error("Migration failed", e);
             }
          }
        }
        
        setIsLoading(false);
        
        // 2. Then sync from cloud (background process)
        try {
          setSyncStatus('syncing');
          const cloudResult = await loadProjectsFromCloud();
          
          if (cloudResult.success && cloudResult.projects) {
            // Merge local and cloud data
            const merged = mergeProjects(localProjects, cloudResult.projects);
            
            // If merged data differs from local, update local
            if (JSON.stringify(merged) !== JSON.stringify(localProjects)) {
              setProjects(merged);
              await set('mapp-projects', merged);
            }
            
            // If cloud has updates, sync to cloud
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
            // New device, upload local data to cloud
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
    if (!isLoading) {
      // 1. 保存到本地 IndexedDB
      set('mapp-projects', projects).catch((err) => {
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

  const activeProject = projects.find(p => p.id === currentProjectId);

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

  const deleteNote = (noteId: string) => {
    if (!currentProjectId) return;
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
    const headers = ['文本内容', 'Tag1', 'Tag2', 'Tag3', '分组'];
    const rows = standardNotes.map(note => {
      // 文本内容
      const text = note.text || '';
      
      // 标签
      const tags = note.tags || [];
      const tag1 = tags[0]?.label || '';
      const tag2 = tags[1]?.label || '';
      const tag3 = tags[2]?.label || '';
      
      // 分组
      const groupName = note.groupName || '';
      
      return [text, tag1, tag2, tag3, groupName];
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

  const handleDeleteProject = (id: string) => {
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

  if (isLoading) {
    return (
      <div className="w-full min-h-screen bg-[#FFDD00] flex flex-col items-center justify-center text-yellow-900">
         <Loader2 size={48} className="animate-spin mb-4" />
         <div className="font-bold text-xl">Loading your maps...</div>
      </div>
    );
  }

  if (!activeProject) {
    return (
      <div className="w-full min-h-screen bg-[#FFDD00]">
      <ProjectManager 
         projects={projects}
         currentProjectId={null}
         onCreateProject={handleCreateProject}
         onSelectProject={setCurrentProjectId}
         onDeleteProject={handleDeleteProject}
         onUpdateProject={handleUpdateProject}
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
             className="absolute left-0 z-[900] pl-3 pr-4 bg-[#FFDD00] hover:bg-[#E6C700] rounded-r-xl shadow-lg text-yellow-950 transition-none cursor-move"
             style={{ top: `${sidebarButtonY}px`, paddingTop: '12.8px', paddingBottom: '12.8px' }}
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
            onUpdateProject={(project) => {
              if (!currentProjectId) return;
              setProjects(prev => prev.map(p => 
                p.id === currentProjectId ? project : p
              ));
            }}
            onSwitchToMapView={() => {
              setViewMode('map');
              // Trigger MapView's file input after a short delay
              setTimeout(() => {
                mapViewFileInputRef.current?.click();
              }, 300);
            }}
            onSwitchToBoardView={() => {
              setViewMode('board');
            }}
            mapViewFileInputRef={mapViewFileInputRef}
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
                ? 'bg-[#FFDD00] text-yellow-950 shadow-md scale-105' 
                : 'hover:bg-gray-100 text-gray-500'}
              ${isImportDialogOpen ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <Map size={20} />
            Mapping
          </button>
          <button
            onClick={() => !isImportDialogOpen && setViewMode('board')}
            disabled={isImportDialogOpen}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-bold text-sm
              ${viewMode === 'board' 
                ? 'bg-[#FFDD00] text-yellow-950 shadow-md scale-105' 
                : 'hover:bg-gray-100 text-gray-500'}
              ${isImportDialogOpen ? 'opacity-50 cursor-not-allowed' : ''}
            `}
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
                ? 'bg-[#FFDD00] text-yellow-950 shadow-md scale-105' 
                : 'hover:bg-gray-100 text-gray-500'}
              ${isImportDialogOpen ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <Table2 size={20} />
            Table
          </button>
        </div>
      )}

    </div>
  );
}

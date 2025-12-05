
import React, { useState, useEffect } from 'react';
import { Map, Grid, Menu, Loader2, Table2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapView } from './components/MapView';
import { BoardView } from './components/BoardView';
import { TableView } from './components/TableView';
import { ProjectManager } from './components/ProjectManager';
import { Note, ViewMode, Project } from './types';
import { get, set } from 'idb-keyval';

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isBoardEditMode, setIsBoardEditMode] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Project State
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  // Load Projects from IndexedDB
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const storedProjects = await get<Project[]>('mapp-projects');
        
        if (storedProjects) {
          setProjects(storedProjects);
        } else {
          // Migration: Check localStorage one last time
          const localData = localStorage.getItem('mapp-projects');
          if (localData) {
             try {
               const parsed = JSON.parse(localData);
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
      } catch (err) {
        console.error("Failed to load projects", err);
      } finally {
        setIsLoading(false);
      }
    };
    loadProjects();
  }, []);
  
  // 禁用浏览器的双指缩放
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

  // Save to IndexedDB
  useEffect(() => {
    if (!isLoading) {
      set('mapp-projects', projects).catch((err) => {
        console.error("Failed to save projects to IDB", err);
        if (err.name === 'QuotaExceededError') {
          alert("Storage Limit Reached. Please delete some projects or images.");
        }
      });
    }
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
               className="relative h-full w-[80%] z-[2001] overflow-hidden"
               initial={{ x: '-80%' }}
               animate={{ x: 0 }}
               exit={{ x: '-80%' }}
               transition={{ type: "spring", damping: 25, stiffness: 200 }}
             >
              <ProjectManager 
                 isSidebar
                 projects={projects}
                 currentProjectId={currentProjectId}
                 onCreateProject={handleCreateProject}
                 onSelectProject={(id) => { setCurrentProjectId(id); setIsSidebarOpen(false); }}
                 onDeleteProject={handleDeleteProject}
                 onCloseSidebar={() => setIsSidebarOpen(false)}
                  onBackToHome={() => { setCurrentProjectId(null); }}
                  viewMode={viewMode}
                  activeProject={activeProject}
                  onExportCSV={handleExportCSV}
              />
             </motion.div>
        </div>
      )}
      </AnimatePresence>

      <div className="flex-1 relative overflow-hidden z-0">
        
        {!isEditorOpen && !isBoardEditMode && (
          <button 
             onClick={() => setIsSidebarOpen(true)}
             className="absolute top-24 left-0 z-[900] pl-3 pr-4 py-2 bg-[#FFDD00] hover:bg-[#E6C700] rounded-r-xl shadow-lg text-yellow-950 transition-colors"
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
            onClick={() => setViewMode('map')}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-bold text-sm
              ${viewMode === 'map' 
                ? 'bg-[#FFDD00] text-yellow-950 shadow-md scale-105' 
                : 'hover:bg-gray-100 text-gray-500'}
            `}
          >
            <Map size={20} />
            Mapping
          </button>
          <button
            onClick={() => setViewMode('board')}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-bold text-sm
              ${viewMode === 'board' 
                ? 'bg-[#FFDD00] text-yellow-950 shadow-md scale-105' 
                : 'hover:bg-gray-100 text-gray-500'}
            `}
          >
            <Grid size={20} />
            Board
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-bold text-sm
              ${viewMode === 'table' 
                ? 'bg-[#FFDD00] text-yellow-950 shadow-md scale-105' 
                : 'hover:bg-gray-100 text-gray-500'}
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

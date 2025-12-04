
import React, { useState } from 'react';
import { Project } from '../types';
import { Plus, MoreHorizontal, Trash2, Map as MapIcon, Image as ImageIcon, Download, LayoutGrid, X, Home } from 'lucide-react';
import { generateId, fileToBase64, formatDate, exportToJpeg, exportToJpegCentered } from '../utils';

interface ProjectManagerProps {
  projects: Project[];
  currentProjectId: string | null;
  onCreateProject: (project: Project) => void;
  onSelectProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  isSidebar?: boolean;
  onCloseSidebar?: () => void;
  onBackToHome?: () => void;
  viewMode?: 'map' | 'board';
  activeProject?: Project | null;
}

export const ProjectManager: React.FC<ProjectManagerProps> = ({ 
  projects, 
  currentProjectId, 
  onCreateProject, 
  onSelectProject, 
  onDeleteProject,
  isSidebar = false,
  onCloseSidebar,
  onBackToHome,
  viewMode = 'map',
  activeProject
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectType, setNewProjectType] = useState<'map' | 'image'>('map');
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const handleCreate = () => {
    if (!newProjectName.trim()) return;
    
    const newProject: Project = {
      id: generateId(),
      name: newProjectName,
      type: newProjectType,
      backgroundImage: bgImage || undefined,
      createdAt: Date.now(),
      notes: []
    };

    onCreateProject(newProject);
    setIsCreating(false);
    setNewProjectName('');
    setBgImage(null);
    setNewProjectType('map');
    
    // 如果是侧边栏模式，创建后关闭侧边栏
    if (isSidebar && onCloseSidebar) {
      onCloseSidebar();
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        const base64 = await fileToBase64(e.target.files[0]);
        setBgImage(base64);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleExportCurrentView = () => {
    if (!activeProject) {
      alert("请先打开一个项目");
      return;
    }

    const elementId = viewMode === 'map' ? 'map-view-container' : 'board-view-container';
    exportToJpegCentered(elementId, `${activeProject.name}-${viewMode}`);
  };

  const handleExportData = (project: Project) => {
    // 只导出标准便签（不包括小便签和纯文本）
    const standardNotes = project.notes.filter(note => 
      note.variant !== 'text' && note.variant !== 'compact'
    );
    
    if (standardNotes.length === 0) {
      alert("该项目没有标准便签数据");
      setOpenMenuId(null);
      return;
    }

    // 根据项目类型决定坐标格式
    const isMapProject = project.type === 'map';
    const coordHeader = isMapProject ? '经纬度坐标' : 'XY坐标';
    
    // 创建CSV内容
    const headers = [coordHeader, '文本内容', 'Tag1', 'Tag2', 'Tag3'];
    const rows = standardNotes.map(note => {
      // 坐标：根据项目类型选择
      const coords = isMapProject 
        ? `${note.coords.lat.toFixed(6)}, ${note.coords.lng.toFixed(6)}`
        : `${note.boardX.toFixed(2)}, ${note.boardY.toFixed(2)}`;
      
      // 文本内容
      const text = note.text || '';
      
      // 标签
      const tags = note.tags || [];
      const tag1 = tags[0]?.label || '';
      const tag2 = tags[1]?.label || '';
      const tag3 = tags[2]?.label || '';
      
      return [coords, text, tag1, tag2, tag3];
    });

    // 转换为CSV格式
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // 创建下载链接
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${project.name}-数据.csv`;
    link.click();
    
    setOpenMenuId(null);
  };

  const containerClass = isSidebar 
    ? "h-full w-full bg-[#FFDD00] shadow-2xl flex flex-col border-r border-[#FFDD00] overflow-hidden" 
    : "w-full min-h-screen bg-[#FFDD00] flex flex-col items-center justify-start pt-40 pb-0 p-4 relative"; 

  const titleClass = isSidebar
    ? "hidden" // Hide title in sidebar
    : "text-6xl md:text-8xl font-black text-white tracking-tighter mb-12 text-center drop-shadow-sm leading-[0.9] flex flex-col";

  return (
    <div className={containerClass}>
      {isSidebar && (
        <>
          <button 
            onClick={() => {
              if (onBackToHome) {
                onBackToHome();
              }
              if (onCloseSidebar) {
                onCloseSidebar();
              }
            }} 
            className="absolute top-4 left-4 text-yellow-800 hover:text-white transition-colors z-[2010]"
          >
            <Home size={24} />
          </button>
          {activeProject && (
            <button 
              onClick={handleExportCurrentView}
              className="absolute top-4 right-12 text-yellow-800 hover:text-white transition-colors z-[2010]"
              title="导出当前视图"
            >
              <Download size={24} />
            </button>
          )}
          <button 
            onClick={onCloseSidebar} 
            className="absolute top-4 right-4 text-yellow-800 hover:text-white transition-colors z-[2010]"
          >
            <X size={24} />
          </button>
          <button 
            onClick={() => setIsCreating(true)}
            disabled={isCreating}
            className="absolute top-14 left-4 right-4 px-4 py-3 bg-white text-yellow-900 rounded-2xl font-bold shadow-lg hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 transition-all z-[2010] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            <Plus size={20} /> New Project
          </button>
        </>
      )}

      <div className={isSidebar ? "p-6 pt-28 border-b border-[#FFDD00]/20 flex-shrink-0" : "flex flex-col items-center"}>
        {!isSidebar && (
          <h1 className={titleClass}>
            <span>START</span>
            <span>YOUR</span>
            <span>MAPPING</span>
          </h1>
        )}
        
        {!isSidebar && (
          <button 
            onClick={() => setIsCreating(true)}
            className="mt-8 px-8 py-4 bg-white text-yellow-900 rounded-full font-bold text-lg shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
          >
            <Plus size={24} /> New Project
          </button>
        )}
      </div>

      <div
        className={
          isSidebar
            ? "flex-1 overflow-y-auto custom-scrollbar w-full p-4"
            : "w-full max-w-md mt-8 bg-transparent p-4 pb-8"
        }
        style={isSidebar ? { 
          touchAction: 'pan-y',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch'
        } : {}}
        onTouchStart={(e) => {
          if (isSidebar) {
            e.stopPropagation();
          }
        }}
        onTouchMove={(e) => {
          if (isSidebar) {
            e.stopPropagation();
          }
        }}
        onWheel={(e) => {
          if (isSidebar) {
            e.stopPropagation();
          }
        }}
        onScroll={(e) => {
          if (isSidebar) {
            e.stopPropagation();
          }
        }}
      >
        <div className="flex flex-col gap-3">
          {projects.map(p => (
            <div 
              key={p.id} 
              className={`group relative flex items-center justify-between p-4 rounded-2xl transition-all ${
                p.id === currentProjectId 
                  ? 'bg-white shadow-lg ring-2 ring-[#FFDD00] text-yellow-950' 
                  : isSidebar 
                    ? 'bg-[#FFDD00]/50 hover:bg-[#FFDD00] text-yellow-900 border border-[#FFDD00]/20' 
                    : 'bg-white/90 hover:bg-white shadow-lg text-gray-800'
              }`}
            >
              <div 
                className="flex-1 cursor-pointer" 
                onClick={() => onSelectProject(p.id)}
              >
                <div className="font-bold text-lg leading-tight">{p.name}</div>
                <div className={`text-xs flex items-center gap-1 mt-1 ${p.id === currentProjectId ? 'text-yellow-700' : 'text-yellow-800/60'}`}>
                  {p.type === 'map' ? <MapIcon size={12}/> : <ImageIcon size={12}/>}
                  {formatDate(p.createdAt)}
                </div>
              </div>

              <div className="relative">
                <button 
                  onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === p.id ? null : p.id); }}
                  className={`p-2 rounded-full transition-colors ${p.id === currentProjectId ? 'text-yellow-700 hover:bg-[#FFDD00]/10' : 'text-yellow-800/60 hover:text-yellow-900 hover:bg-[#FFDD00]/20'}`}
                >
                  <MoreHorizontal size={20} />
                </button>

                {openMenuId === p.id && (
                  <>
                    <div className="fixed inset-0 z-[45] bg-black/20" onClick={() => setOpenMenuId(null)} />
                    {isSidebar ? (
                      <div className="absolute right-0 top-full mt-2 w-48 max-h-[60vh] overflow-auto bg-white rounded-xl shadow-xl z-50 border border-gray-100 py-1 animate-in fade-in zoom-in-95 origin-top-right">
                        <button 
                          onClick={() => handleExportData(p)}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
                        >
                          <Download size={16} /> 导出数据
                        </button>
                        <div className="h-px bg-gray-100 my-1" />
                        <button 
                          onClick={(e) => { e.stopPropagation(); onDeleteProject(p.id); }}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-red-50 text-red-500 flex items-center gap-2"
                        >
                          <Trash2 size={16} /> Delete Project
                        </button>
                      </div>
                    ) : (
                      <div className="fixed inset-x-4 bottom-6 z-[50] bg-white rounded-3xl shadow-2xl border border-gray-200 py-2 animate-in slide-in-from-bottom-4" onClick={(e) => e.stopPropagation()}>
                        <div className="px-4 pt-2 pb-1">
                          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Project</div>
                          <div className="text-sm font-bold text-gray-800 truncate">{p.name}</div>
                        </div>
                        <button 
                          onClick={() => handleExportData(p)}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
                        >
                          <Download size={16} /> 导出数据
                        </button>
                        <div className="h-px bg-gray-100 my-1" />
                        <button 
                          onClick={(e) => { e.stopPropagation(); onDeleteProject(p.id); }}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-red-50 text-red-500 flex items-center gap-2"
                        >
                          <Trash2 size={16} /> Delete Project
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
          
          {projects.length === 0 && !isSidebar && (
             <div className="text-white/60 text-center py-8 italic">No projects yet. Start one!</div>
          )}
        </div>
      </div>

      {isCreating && (
        <div className="fixed inset-0 z-[3000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
            <h2 className="text-2xl font-black text-gray-800 mb-6">New Project</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-600 mb-1">Project Name</label>
                <input 
                  autoFocus
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCreate();
                    }
                  }}
                  className="w-full p-3 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-[#FFDD00] transition-all font-medium"
                  placeholder="My Mapp Trip"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-600 mb-2">Mode</label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => setNewProjectType('map')}
                    className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${newProjectType === 'map' ? 'border-[#FFDD00] bg-[#FFDD00]/10 text-yellow-800' : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}
                  >
                    <MapIcon size={24} />
                    <span className="font-bold text-sm">Map Based</span>
                  </button>
                  <button 
                    onClick={() => setNewProjectType('image')}
                    className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${newProjectType === 'image' ? 'border-[#FFDD00] bg-[#FFDD00]/10 text-yellow-800' : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}
                  >
                    <ImageIcon size={24} />
                    <span className="font-bold text-sm">Image Based</span>
                  </button>
                </div>
              </div>

              {newProjectType === 'image' && (
                <div>
                   <label className="block text-sm font-bold text-gray-600 mb-2">Background Image (Optional)</label>
                   <label className="block w-full p-4 border-2 border-dashed border-gray-300 rounded-xl text-center cursor-pointer hover:bg-gray-50 hover:border-[#FFDD00] transition-colors">
                      {bgImage ? (
                        <div className="relative h-32 w-full">
                           <img src={bgImage} className="w-full h-full object-contain" alt="preview"/>
                           <button onClick={(e) => {e.preventDefault(); setBgImage(null)}} className="absolute top-0 right-0 bg-red-500 text-white p-1 rounded-full"><X size={12}/></button>
                        </div>
                      ) : (
                        <div className="text-gray-400 flex flex-col items-center">
                           <ImageIcon size={24} className="mb-2"/>
                           <span className="text-sm">Click to upload image</span>
                        </div>
                      )}
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                   </label>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-8">
              <button 
                onClick={() => setIsCreating(false)} 
                className="flex-1 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-xl"
              >
                Cancel
              </button>
              <button 
                onClick={handleCreate}
                disabled={!newProjectName.trim()}
                className="flex-1 py-3 bg-[#FFDD00] text-yellow-950 font-bold rounded-xl shadow-lg hover:bg-[#E6C700] disabled:opacity-50 disabled:shadow-none"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

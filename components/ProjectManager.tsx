
import React, { useState } from 'react';
import { Project } from '../types';
import { Plus, MoreHorizontal, Trash2, Map as MapIcon, Image as ImageIcon, Download, LayoutGrid, X } from 'lucide-react';
import { generateId, fileToBase64, formatDate, exportToJpeg } from '../utils';

interface ProjectManagerProps {
  projects: Project[];
  currentProjectId: string | null;
  onCreateProject: (project: Project) => void;
  onSelectProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  isSidebar?: boolean;
  onCloseSidebar?: () => void;
}

export const ProjectManager: React.FC<ProjectManagerProps> = ({ 
  projects, 
  currentProjectId, 
  onCreateProject, 
  onSelectProject, 
  onDeleteProject,
  isSidebar = false,
  onCloseSidebar
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

  const handleExport = (type: 'map' | 'board', project: Project) => {
    if (project.id !== currentProjectId) {
      alert("Please open the project to export its views.");
      onSelectProject(project.id);
      return;
    }

    const elementId = type === 'map' ? 'map-view-container' : 'board-view-container';
    exportToJpeg(elementId, `${project.name}-${type}`);
    setOpenMenuId(null);
  };

  const containerClass = isSidebar 
    ? "h-full w-80 bg-yellow-400 shadow-2xl flex flex-col border-r border-yellow-300" 
    : "w-full h-full bg-yellow-400 flex flex-col items-center justify-start pt-48 p-4 relative"; 

  const titleClass = isSidebar
    ? "hidden" // Hide title in sidebar
    : "text-6xl md:text-8xl font-black text-white tracking-tighter mb-12 text-center drop-shadow-sm leading-[0.9] flex flex-col";

  return (
    <div className={containerClass}>
      {isSidebar && (
        <button onClick={onCloseSidebar} className="absolute top-4 right-4 text-yellow-800 hover:text-white transition-colors">
          <X size={24} />
        </button>
      )}

      <div className={isSidebar ? "p-6 pt-16 border-b border-yellow-500/20" : "flex flex-col items-center"}>
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

      <div className={`flex-1 overflow-y-auto custom-scrollbar w-full ${isSidebar ? "p-4" : "max-w-md mt-8 bg-white/10 backdrop-blur-sm rounded-3xl p-4 w-full"}`}>
        {isSidebar && (
           <button 
             onClick={() => setIsCreating(true)}
             className="w-full mb-4 p-4 bg-yellow-300/50 hover:bg-yellow-300 text-yellow-900 border border-yellow-500/10 rounded-2xl font-bold hover:scale-[1.02] active:scale-95 flex items-center justify-between transition-all"
           >
             <span>New Project</span>
             <Plus size={20} />
           </button>
        )}

        <div className="flex flex-col gap-3">
          {projects.map(p => (
            <div 
              key={p.id} 
              className={`group relative flex items-center justify-between p-4 rounded-2xl transition-all ${
                p.id === currentProjectId 
                  ? 'bg-white shadow-lg ring-2 ring-yellow-500 text-yellow-950' 
                  : isSidebar 
                    ? 'bg-yellow-300/50 hover:bg-yellow-300 text-yellow-900 border border-yellow-500/10' 
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
                  className={`p-2 rounded-full transition-colors ${p.id === currentProjectId ? 'text-yellow-700 hover:bg-yellow-50' : 'text-yellow-800/60 hover:text-yellow-900 hover:bg-yellow-500/20'}`}
                >
                  <MoreHorizontal size={20} />
                </button>

                {openMenuId === p.id && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpenMenuId(null)} />
                    <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl z-50 border border-gray-100 overflow-hidden py-1 animate-in fade-in zoom-in-95 origin-top-right">
                      <button 
                        onClick={() => handleExport('map', p)}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
                      >
                        <MapIcon size={16} /> Export Mapping
                      </button>
                      <button 
                        onClick={() => handleExport('board', p)}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
                      >
                        <LayoutGrid size={16} /> Export Board
                      </button>
                      <div className="h-px bg-gray-100 my-1" />
                      <button 
                        onClick={(e) => { e.stopPropagation(); onDeleteProject(p.id); }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-red-50 text-red-500 flex items-center gap-2"
                      >
                        <Trash2 size={16} /> Delete Project
                      </button>
                    </div>
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
        <div className="fixed inset-0 z-[2000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
            <h2 className="text-2xl font-black text-gray-800 mb-6">New Project</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-600 mb-1">Project Name</label>
                <input 
                  autoFocus
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full p-3 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-yellow-400 transition-all font-medium"
                  placeholder="My Lemon Trip"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-600 mb-2">Mode</label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => setNewProjectType('map')}
                    className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${newProjectType === 'map' ? 'border-yellow-400 bg-yellow-50 text-yellow-800' : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}
                  >
                    <MapIcon size={24} />
                    <span className="font-bold text-sm">Map Based</span>
                  </button>
                  <button 
                    onClick={() => setNewProjectType('image')}
                    className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${newProjectType === 'image' ? 'border-yellow-400 bg-yellow-50 text-yellow-800' : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}
                  >
                    <ImageIcon size={24} />
                    <span className="font-bold text-sm">Image Based</span>
                  </button>
                </div>
              </div>

              {newProjectType === 'image' && (
                <div>
                   <label className="block text-sm font-bold text-gray-600 mb-2">Background Image (Optional)</label>
                   <label className="block w-full p-4 border-2 border-dashed border-gray-300 rounded-xl text-center cursor-pointer hover:bg-gray-50 hover:border-yellow-400 transition-colors">
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
                className="flex-1 py-3 bg-yellow-400 text-yellow-950 font-bold rounded-xl shadow-lg hover:bg-yellow-300 disabled:opacity-50 disabled:shadow-none"
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

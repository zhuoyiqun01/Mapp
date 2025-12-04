
import React, { useState, useRef } from 'react';
import { Project } from '../types';
import { Plus, MoreHorizontal, Trash2, Map as MapIcon, Image as ImageIcon, Download, Home, X, ChevronRight } from 'lucide-react';
import { generateId, exportToJpeg, fileToBase64, formatDate } from '../utils';

interface ProjectManagerProps {
  projects: Project[];
  currentProjectId: string | null;
  onCreateProject: (project: Project) => void;
  onSelectProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  isSidebar?: boolean;
  onCloseSidebar?: () => void;
  onBackToHome?: () => void;
}

export const ProjectManager: React.FC<ProjectManagerProps> = ({ 
  projects, 
  currentProjectId, 
  onCreateProject, 
  onSelectProject, 
  onDeleteProject,
  isSidebar = false,
  onCloseSidebar,
  onBackToHome
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectType, setNewProjectType] = useState<'map' | 'image'>('map');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const handleCreate = () => {
    if (!newProjectName.trim()) return;
    
    if (newProjectType === 'image' && !selectedImage) return;

    const newProject: Project = {
      id: generateId(),
      name: newProjectName,
      type: newProjectType,
      backgroundImage: selectedImage || undefined,
      createdAt: Date.now(),
      notes: []
    };

    onCreateProject(newProject);
    setIsCreating(false);
    setNewProjectName('');
    setSelectedImage(null);
    setNewProjectType('map');
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        const base64 = await fileToBase64(e.target.files[0]);
        setSelectedImage(base64);
      } catch (err) {
        console.error("Failed to load image", err);
      }
    }
  };

  const handleExport = (projectId: string, type: 'map' | 'board') => {
      // We need to be in the project to export the current view, 
      // but if we are in the sidebar list, we might want to export *that* project.
      // Currently, exportToJpeg relies on DOM elements existing. 
      // So effectively we can only export the *active* project's views.
      if (projectId !== currentProjectId) {
          alert("Please open the project to export its views.");
          return;
      }
      
      const elementId = type === 'map' ? 'map-view-container' : 'board-view-container';
      const project = projects.find(p => p.id === projectId);
      if (project) {
          exportToJpeg(elementId, `${project.name}-${type}`);
      }
      setActiveMenuId(null);
  };

  if (isCreating) {
    return (
      <div className={`w-full h-full flex flex-col items-center justify-center p-6 ${isSidebar ? 'bg-yellow-400' : 'bg-yellow-400'}`}>
        <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md animate-in zoom-in-95 duration-200">
           <h2 className="text-2xl font-black text-gray-800 mb-6 text-center">NEW PROJECT</h2>
           
           <div className="space-y-4">
              <div>
                  <label className="block text-sm font-bold text-gray-500 mb-1">Project Name</label>
                  <input 
                    autoFocus
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 outline-none transition-all font-medium"
                    placeholder="My Awesome Trip..."
                  />
              </div>

              <div>
                  <label className="block text-sm font-bold text-gray-500 mb-2">Type</label>
                  <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={() => setNewProjectType('map')}
                        className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${newProjectType === 'map' ? 'border-yellow-400 bg-yellow-50 text-yellow-800' : 'border-gray-100 text-gray-400 hover:bg-gray-50'}`}
                      >
                          <MapIcon size={24} />
                          <span className="font-bold text-sm">Map</span>
                      </button>
                      <button 
                        onClick={() => setNewProjectType('image')}
                        className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${newProjectType === 'image' ? 'border-yellow-400 bg-yellow-50 text-yellow-800' : 'border-gray-100 text-gray-400 hover:bg-gray-50'}`}
                      >
                          <ImageIcon size={24} />
                          <span className="font-bold text-sm">Image</span>
                      </button>
                  </div>
              </div>

              {newProjectType === 'image' && (
                  <div className="animate-in fade-in slide-in-from-top-2">
                      <label className="block text-sm font-bold text-gray-500 mb-1">Upload Image</label>
                      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:bg-gray-50 hover:border-yellow-400 transition-colors bg-gray-50 relative overflow-hidden">
                          {selectedImage ? (
                              <img src={selectedImage} className="w-full h-full object-cover opacity-80" />
                          ) : (
                              <div className="flex flex-col items-center text-gray-400">
                                  <Plus size={24} />
                                  <span className="text-xs font-bold mt-1">Select Image</span>
                              </div>
                          )}
                          <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                      </label>
                  </div>
              )}
           </div>

           <div className="flex gap-3 mt-8">
              <button onClick={() => setIsCreating(false)} className="flex-1 py-3 font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors">
                  Cancel
              </button>
              <button onClick={handleCreate} className="flex-1 py-3 bg-yellow-400 hover:bg-yellow-300 text-yellow-950 font-bold rounded-xl shadow-md active:scale-95 transition-all">
                  Create
              </button>
           </div>
        </div>
      </div>
    );
  }

  // START SCREEN
  if (!isSidebar) {
      return (
        <div className="w-full h-full bg-yellow-400 flex flex-col items-center justify-center p-6 relative overflow-hidden pt-40">
           {/* Decorative Elements */}
           <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-yellow-300 rounded-full opacity-50 blur-3xl pointer-events-none" />
           <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] bg-yellow-500 rounded-full opacity-20 blur-3xl pointer-events-none" />

           <div className="relative z-10 w-full max-w-md flex flex-col items-center">
               <h1 className="text-[15vw] md:text-[8rem] font-black text-white leading-[0.85] text-center tracking-tighter drop-shadow-sm flex flex-col select-none mb-12">
                   <span>START</span>
                   <span>YOUR</span>
                   <span>MAPPING</span>
               </h1>

               <div className="w-full space-y-4">
                   <div className="bg-white/90 backdrop-blur rounded-3xl p-2 shadow-xl border border-white/50">
                       {projects.length === 0 ? (
                           <div className="p-8 text-center text-gray-400 italic">
                               No projects yet. Start one now!
                           </div>
                       ) : (
                           <div className="max-h-[300px] overflow-y-auto custom-scrollbar p-2 space-y-2">
                               {projects.map(p => (
                                   <button 
                                     key={p.id}
                                     onClick={() => onSelectProject(p.id)}
                                     className="w-full p-4 bg-white hover:bg-yellow-50 rounded-2xl flex items-center gap-4 transition-all group shadow-sm hover:shadow-md border border-gray-100 text-left"
                                   >
                                       <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${p.type === 'map' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                                           {p.type === 'map' ? <MapIcon size={20}/> : <ImageIcon size={20}/>}
                                       </div>
                                       <div className="flex-1 min-w-0">
                                           <div className="font-bold text-gray-800 truncate">{p.name}</div>
                                           <div className="text-xs text-gray-400 font-medium">{formatDate(p.createdAt)}</div>
                                       </div>
                                       <ChevronRight size={18} className="text-gray-300 group-hover:text-yellow-500 transition-colors" />
                                   </button>
                               ))}
                           </div>
                       )}
                   </div>

                   <button 
                    onClick={() => setIsCreating(true)}
                    className="w-full py-4 bg-white text-yellow-600 font-black text-lg rounded-2xl shadow-lg hover:bg-yellow-50 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                   >
                       <Plus size={24} strokeWidth={3} />
                       NEW PROJECT
                   </button>
               </div>
           </div>
        </div>
      );
  }

  // SIDEBAR MODE
  return (
    <div className="h-full w-80 bg-yellow-400 flex flex-col shadow-2xl relative z-[2001]">
        {/* Header */}
        <div className="p-6 pb-2 flex items-center justify-between shrink-0">
            {onBackToHome && (
                <button 
                    onClick={onBackToHome}
                    className="w-10 h-10 bg-white/20 hover:bg-white/40 text-yellow-900 rounded-xl flex items-center justify-center transition-colors backdrop-blur-sm"
                    title="Back to Home"
                >
                    <Home size={20} />
                </button>
            )}
            {/* Close Sidebar (for mobile or general close) */}
            <button onClick={onCloseSidebar} className="p-2 text-yellow-800 hover:bg-black/5 rounded-full transition-colors md:hidden">
                <X size={24} />
            </button>
        </div>

        {/* Project List */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3 custom-scrollbar">
            {projects.map(p => (
                <div 
                    key={p.id}
                    className={`group relative p-3 rounded-2xl transition-all border ${p.id === currentProjectId ? 'bg-white shadow-md border-transparent' : 'bg-yellow-300/50 border-yellow-300/30 hover:bg-yellow-300'}`}
                >
                    <button 
                        onClick={() => onSelectProject(p.id)}
                        className="flex items-center gap-3 w-full text-left"
                    >
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${p.type === 'map' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'} ${p.id === currentProjectId ? '' : 'opacity-70'}`}>
                            {p.type === 'map' ? <MapIcon size={16}/> : <ImageIcon size={16}/>}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className={`font-bold text-sm truncate ${p.id === currentProjectId ? 'text-gray-800' : 'text-yellow-900'}`}>{p.name}</div>
                            <div className={`text-[10px] font-medium ${p.id === currentProjectId ? 'text-gray-400' : 'text-yellow-800/60'}`}>{formatDate(p.createdAt)}</div>
                        </div>
                    </button>

                    <button 
                        onClick={() => setActiveMenuId(activeMenuId === p.id ? null : p.id)}
                        className={`absolute top-1/2 -translate-y-1/2 right-2 p-1.5 rounded-lg text-gray-500 hover:bg-black/5 transition-colors ${activeMenuId === p.id ? 'opacity-100 bg-black/5' : 'opacity-0 group-hover:opacity-100'}`}
                    >
                        <MoreHorizontal size={16} />
                    </button>

                    {activeMenuId === p.id && (
                        <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl z-50 overflow-hidden border border-gray-100 animate-in zoom-in-95 origin-top-right">
                             {/* Only show export if it's the current project because we need the DOM nodes */}
                             {p.id === currentProjectId && (
                                <>
                                    <button onClick={() => handleExport(p.id, 'map')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-600">
                                        <Download size={14} /> Export Map
                                    </button>
                                    <button onClick={() => handleExport(p.id, 'board')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-600 border-b border-gray-100">
                                        <Download size={14} /> Export Board
                                    </button>
                                </>
                             )}
                            <button onClick={() => onDeleteProject(p.id)} className="w-full text-left px-4 py-2.5 text-sm hover:bg-red-50 text-red-500 flex items-center gap-2">
                                <Trash2 size={14} /> Delete
                            </button>
                        </div>
                    )}
                </div>
            ))}
        </div>

        {/* Bottom Actions - Pinned */}
        <div className="p-4 mt-auto">
            <button 
                onClick={() => setIsCreating(true)}
                className="w-full p-3 bg-yellow-300/50 hover:bg-yellow-300 text-yellow-950 font-bold rounded-2xl flex items-center gap-3 transition-colors border border-yellow-300/30"
            >
                <div className="w-10 h-10 rounded-lg bg-white/40 flex items-center justify-center">
                    <Plus size={20} />
                </div>
                <span>New Project</span>
            </button>
        </div>
        
        {/* Overlay to close menu when clicking outside */}
        {activeMenuId && <div className="fixed inset-0 z-40" onClick={() => setActiveMenuId(null)} />}
    </div>
  );
};

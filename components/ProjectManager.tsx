
import React, { useState, useRef, useEffect } from 'react';
import { Project } from '../types';
import { Plus, MoreHorizontal, Trash2, Map as MapIcon, Image as ImageIcon, Download, LayoutGrid, X, Home, Cloud, Edit2, Check, Upload, Palette } from 'lucide-react';
import { generateId, fileToBase64, formatDate, exportToJpeg, exportToJpegCentered, compressImageFromBase64 } from '../utils';
import { loadProject, loadNoteImages, loadBackgroundImage, saveProject, loadAllProjects } from '../utils/storage';
import { getLastSyncTime, type SyncStatus } from '../utils/sync';
import { THEME_COLOR, THEME_COLOR_DARK } from '../constants';
import { ThemeColorPicker } from './ThemeColorPicker';

// Menu dropdown component that adjusts position to avoid going off-screen
const MenuDropdown: React.FC<{
  project: Project;
  onRename: (project: Project) => void;
  onExportData: (project: Project) => void;
  onExportFullProject: (project: Project) => void;
  onCompressImages: (project: Project) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}> = ({ project, onRename, onExportData, onExportFullProject, onCompressImages, onDelete, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<'bottom' | 'top'>('bottom');

  useEffect(() => {
    if (menuRef.current) {
      // Find the button that triggered this menu (previous sibling)
      const buttonElement = menuRef.current.parentElement?.querySelector('button[class*="rounded-full"]') as HTMLElement;
      
      if (buttonElement) {
        const buttonRect = buttonElement.getBoundingClientRect();
        const estimatedMenuHeight = 220; // Approximate menu height
        const spaceBelow = window.innerHeight - buttonRect.bottom;
        const spaceAbove = buttonRect.top;
        
        // If not enough space below but enough space above, show above
        if (spaceBelow < estimatedMenuHeight + 20 && spaceAbove > spaceBelow) {
          setPosition('top');
        } else {
          setPosition('bottom');
        }
      }
    }
  }, []);

  return (
    <div 
      ref={menuRef}
      className={`absolute right-0 w-48 max-h-[60vh] overflow-auto bg-white rounded-xl shadow-xl z-50 border border-gray-100 py-1 animate-in fade-in zoom-in-95 origin-top-right ${
        position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
      }`}
    >
      <button 
        onClick={() => { onRename(project); onClose(); }}
        className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
      >
        <Edit2 size={16} /> Rename
      </button>
      <div className="h-px bg-gray-100 my-1" />
      <button 
        onClick={() => { onExportData(project); onClose(); }}
        className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
      >
        <Download size={16} /> Export Data (CSV)
      </button>
      <div className="h-px bg-gray-100 my-1" />
      <button 
        onClick={() => { onExportFullProject(project); onClose(); }}
        className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
      >
        <Download size={16} /> Export Full Project (JSON)
      </button>
      <div className="h-px bg-gray-100 my-1" />
      <button 
        onClick={() => { onCompressImages(project); onClose(); }}
        className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
      >
        <ImageIcon size={16} /> Compress Images
      </button>
      <div className="h-px bg-gray-100 my-1" />
      <button 
        onClick={(e) => { e.stopPropagation(); onDelete(project.id); onClose(); }}
        className="w-full text-left px-4 py-2.5 text-sm hover:bg-red-50 text-red-500 flex items-center gap-2"
      >
        <Trash2 size={16} /> Delete Project
      </button>
    </div>
  );
};

interface ProjectManagerProps {
  projects: Project[];
  currentProjectId: string | null;
  onCreateProject: (project: Project) => void;
  onSelectProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onUpdateProject?: (project: Project) => void;
  isSidebar?: boolean;
  onCloseSidebar?: () => void;
  onBackToHome?: () => void;
  viewMode?: 'map' | 'board' | 'table';
  activeProject?: Project | null;
  onExportCSV?: (project: Project) => void;
  syncStatus?: SyncStatus;
  themeColor?: string;
  onThemeColorChange?: (color: string) => void;
}

export const ProjectManager: React.FC<ProjectManagerProps> = ({ 
  projects, 
  currentProjectId, 
  onCreateProject, 
  onSelectProject, 
  onDeleteProject,
  onUpdateProject,
  syncStatus,
  isSidebar = false,
  onCloseSidebar,
  onBackToHome,
  viewMode = 'map',
  activeProject,
  onExportCSV,
  themeColor = THEME_COLOR,
  onThemeColorChange
}) => {
  // Helper function to calculate darker version of theme color
  const getDarkerColor = (color: string): string => {
    // Remove # if present
    const hex = color.replace('#', '');
    // Convert to RGB
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    // Darken by 10%
    const darkerR = Math.max(0, Math.floor(r * 0.9));
    const darkerG = Math.max(0, Math.floor(g * 0.9));
    const darkerB = Math.max(0, Math.floor(b * 0.9));
    // Convert back to hex
    return `#${darkerR.toString(16).padStart(2, '0')}${darkerG.toString(16).padStart(2, '0')}${darkerB.toString(16).padStart(2, '0')}`;
  };
  
  const themeColorDark = getDarkerColor(themeColor);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectType, setNewProjectType] = useState<'map' | 'image'>('map');
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState('');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [isImportingFromData, setIsImportingFromData] = useState(false);
  const importFileInputRef = React.useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showThemeColorPicker, setShowThemeColorPicker] = useState(false);

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
    
    // If in sidebar mode, close sidebar after creation
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
      alert("Please open a project first");
      return;
    }

    // Table view exports CSV, other views export images
    if (viewMode === 'table') {
      if (onExportCSV) {
        onExportCSV(activeProject);
      }
    } else {
      const elementId = viewMode === 'map' ? 'map-view-container' : 'board-view-container';
      exportToJpegCentered(elementId, `${activeProject.name}-${viewMode}`);
    }
  };

  const handleRename = (project: Project) => {
    setEditingProjectId(project.id);
    setEditingProjectName(project.name);
    setOpenMenuId(null);
  };

  const handleSaveRename = (project: Project) => {
    if (!editingProjectName.trim() || !onUpdateProject) return;
    
    onUpdateProject({
      ...project,
      name: editingProjectName.trim()
    });
    setEditingProjectId(null);
    setEditingProjectName('');
  };

  const handleCancelRename = () => {
    setEditingProjectId(null);
    setEditingProjectName('');
  };

  const handleExportData = (project: Project) => {
    // Only export standard notes (excluding compact and text-only notes)
    const standardNotes = project.notes.filter(note => 
      note.variant !== 'compact'
    );
    
    if (standardNotes.length === 0) {
      alert("This project has no standard note data");
      setOpenMenuId(null);
      return;
    }

    // Determine coordinate format based on project type
    const isMapProject = project.type === 'map';
    const coordHeader = isMapProject ? 'Latitude, Longitude' : 'X, Y';
    
    // Create CSV content
    // Support multiple groups: Group1, Group2, Group3
    const headers = [coordHeader, 'Text Content', 'Tag1', 'Tag2', 'Tag3', 'Group1', 'Group2', 'Group3'];
    const rows = standardNotes.map(note => {
      // Coordinates: select based on project type
      const coords = isMapProject 
        ? `${note.coords.lat.toFixed(6)}, ${note.coords.lng.toFixed(6)}`
        : `${note.boardX.toFixed(2)}, ${note.boardY.toFixed(2)}`;
      
      // Text content
      const text = note.text || '';
      
      // Tags
      const tags = note.tags || [];
      const tag1 = tags[0]?.label || '';
      const tag2 = tags[1]?.label || '';
      const tag3 = tags[2]?.label || '';
      
      // Groups (support multiple groups)
      const groupNames = note.groupNames || [];
      // If no groupNames, use groupName (backward compatibility)
      const allGroups = groupNames.length > 0 
        ? groupNames 
        : (note.groupName ? [note.groupName] : []);
      
      const group1 = allGroups[0] || '';
      const group2 = allGroups[1] || '';
      const group3 = allGroups[2] || '';
      
      return [coords, text, tag1, tag2, tag3, group1, group2, group3];
    });

    // Convert to CSV format
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // Create download link
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${project.name}-data.csv`;
    link.click();
    
    setOpenMenuId(null);
  };

  // Export full project data for cross-device sharing
  const handleExportFullProject = async (project: Project) => {
    try {
      // Load full project with images for export
      const fullProject = await loadProject(project.id, true);
      if (!fullProject) {
        alert('无法加载项目数据');
        return;
      }

      // Export complete project data as JSON (with all images loaded)
      // Ensure frames and connections are included
      const exportData = {
        version: '1.0',
        project: {
          id: fullProject.id,
          name: fullProject.name,
          type: fullProject.type,
          backgroundImage: fullProject.backgroundImage,
          createdAt: fullProject.createdAt,
          notes: fullProject.notes || [],
          frames: fullProject.frames || [],
          connections: fullProject.connections || []
        }
      };
      
      // Debug: log export data
      console.log('Exporting project:', {
        name: exportData.project.name,
        notes: exportData.project.notes.length,
        frames: exportData.project.frames.length,
        connections: exportData.project.connections.length
      });

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${project.name}-project.json`;
      link.click();
      
      setOpenMenuId(null);
    } catch (error) {
      console.error('导出失败:', error);
      alert('导出项目失败');
    }
  };

  // Compress all images in the project
  const handleCompressImages = async (project: Project) => {
    if (!onUpdateProject) {
      alert('Cannot compress images: project update function not available');
      return;
    }

    const confirmCompress = confirm(`This will compress all images in "${project.name}". This may take a while. Continue?`);
    if (!confirmCompress) return;

    try {
      let compressedCount = 0;
      let errorCount = 0;
      const updatedNotes = await Promise.all(
        project.notes.map(async (note) => {
          const updatedNote = { ...note };
          
          // Compress images array
          if (note.images && note.images.length > 0) {
            const compressedImages = await Promise.all(
              note.images.map(async (image) => {
                try {
                  const compressed = await compressImageFromBase64(image);
                  compressedCount++;
                  return compressed;
                } catch (error) {
                  console.error('Error compressing image:', error);
                  errorCount++;
                  return image; // Return original if compression fails
                }
              })
            );
            updatedNote.images = compressedImages;
          }
          
          // Compress sketch
          if (note.sketch) {
            try {
              const compressed = await compressImageFromBase64(note.sketch);
              updatedNote.sketch = compressed;
              compressedCount++;
            } catch (error) {
              console.error('Error compressing sketch:', error);
              errorCount++;
            }
          }
          
          return updatedNote;
        })
      );

      // Compress background image if exists
      let compressedBackground = project.backgroundImage;
      if (project.backgroundImage) {
        try {
          compressedBackground = await compressImageFromBase64(project.backgroundImage);
          compressedCount++;
        } catch (error) {
          console.error('Error compressing background image:', error);
          errorCount++;
        }
      }

      const updatedProject: Project = {
        ...project,
        notes: updatedNotes,
        backgroundImage: compressedBackground
      };

      onUpdateProject(updatedProject);
      
      let message = `Compression complete! ${compressedCount} image(s) compressed.`;
      if (errorCount > 0) {
        message += ` ${errorCount} image(s) failed to compress.`;
      }
      alert(message);
      setOpenMenuId(null);
    } catch (error) {
      console.error('Error compressing images:', error);
      alert('Failed to compress images. Please try again.');
    }
  };

  // Check if two notes are duplicates (same location and content)
  const isDuplicateNote = (note1: any, note2: any, projectType: 'map' | 'image'): boolean => {
    // Compare text content
    if (note1.text !== note2.text) return false;
    
    if (projectType === 'map') {
      // For map projects: compare coordinates (within 0.0001 degree tolerance)
      const latDiff = Math.abs(note1.coords?.lat - note2.coords?.lat);
      const lngDiff = Math.abs(note1.coords?.lng - note2.coords?.lng);
      return latDiff < 0.0001 && lngDiff < 0.0001;
    } else {
      // For board projects: compare board positions (within 10px tolerance)
      const xDiff = Math.abs(note1.boardX - note2.boardX);
      const yDiff = Math.abs(note1.boardY - note2.boardY);
      return xDiff < 10 && yDiff < 10;
    }
  };

  // Import project from JSON data
  const handleImportProject = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (!data.project || !data.project.name) {
        alert('Invalid project file format');
        return;
      }

      const importedProject = data.project;
      
      // Generate new ID to avoid conflicts
      const newProjectId = generateId();
      const newProject: Project = {
        id: newProjectId,
        name: `${importedProject.name} (Imported)`,
        type: importedProject.type || 'map',
        backgroundImage: importedProject.backgroundImage,
        createdAt: Date.now(),
        notes: importedProject.notes || [],
        frames: importedProject.frames || [],
        connections: importedProject.connections || []
      };

      // If importing into existing project (merge mode)
      if (isImportingFromData && activeProject) {
        // Create ID mapping for notes, frames, and connections
        const noteIdMap = new Map<string, string>();
        const frameIdMap = new Map<string, string>();
        
        // Generate new IDs for imported notes (import ALL notes including compact and text)
        const importedNotes = (newProject.notes || []).map(note => {
          const newId = generateId();
          noteIdMap.set(note.id, newId);
          return { ...note, id: newId };
        });
        
        // Debug: count notes by variant
        const noteCounts = {
          standard: importedNotes.filter(n => !n.variant || n.variant === 'standard').length,
          compact: importedNotes.filter(n => n.variant === 'compact').length,
          total: importedNotes.length
        };
        console.log('Merging notes into existing project:', {
          totalNotes: noteCounts.total,
          standard: noteCounts.standard,
          compact: noteCounts.compact,
          text: noteCounts.text,
          frames: (newProject.frames || []).length,
          connections: (newProject.connections || []).length
        });
        
        // Generate new IDs for imported frames
        const importedFrames = (newProject.frames || []).map(frame => {
          const newId = generateId();
          frameIdMap.set(frame.id, newId);
          return { ...frame, id: newId };
        });
        
        // Update note groupId references to new frame IDs
        importedNotes.forEach(note => {
          if (note.groupId && frameIdMap.has(note.groupId)) {
            note.groupId = frameIdMap.get(note.groupId)!;
          }
        });
        
        // For map projects: merge notes with duplicate detection
        if (activeProject.type === 'map' && newProject.type === 'map') {
          // Filter out duplicate notes
          const uniqueImportedNotes = importedNotes.filter(importedNote => {
            return !activeProject.notes.some(existingNote => 
              isDuplicateNote(importedNote, existingNote, 'map')
            );
          });
          
          const mergedNotes = [...activeProject.notes, ...uniqueImportedNotes];
          const updatedProject = { ...activeProject, notes: mergedNotes };
          
          // Save project using new storage system (this will handle image separation)
          await saveProject(updatedProject);
          
          // Reload the project to get the version with image IDs (not Base64)
          const savedProject = await loadProject(updatedProject.id, false);
          if (savedProject && onUpdateProject) {
            onUpdateProject(savedProject);
          } else if (onUpdateProject) {
            // Fallback: use original project if reload fails
            onUpdateProject(updatedProject);
          }
          
          const duplicateCount = importedNotes.length - uniqueImportedNotes.length;
          if (duplicateCount > 0) {
            alert(`Successfully merged ${uniqueImportedNotes.length} new notes. ${duplicateCount} duplicate(s) were skipped.`);
          } else {
            alert(`Successfully merged ${uniqueImportedNotes.length} new note(s).`);
          }
        }
        // For board projects: offset board positions to the right, aligned to top
        else if (activeProject.type === 'image' && newProject.type === 'image') {
          // Calculate rightmost position and topmost position of existing notes
          // Use same logic as BoardView's createNoteAtCenter
          let maxX = -Infinity;
          let minY = Infinity;
          const spacing = 50; // Same spacing as BoardView
          
          if (activeProject.notes.length > 0) {
            // Calculate maxX and minY considering actual note widths
            activeProject.notes.forEach(n => {
              // Use actual note width (must match rendered sizes)
              // compact: 180px, text/standard: 256px
              const noteWidth = (n.variant === 'compact') ? 180 : 256;
              const noteRight = n.boardX + noteWidth;
              const noteTop = n.boardY;
              
              if (noteRight > maxX) maxX = noteRight;
              if (noteTop < minY) minY = noteTop;
            });
          }
          
          // Calculate topmost position of imported notes (before offset)
          let importedMinY = Infinity;
          if (importedNotes.length > 0) {
            importedMinY = Math.min(...importedNotes.map(n => n.boardY));
          }
          
          // Calculate offset: place imported notes to the right with spacing, aligned to top
          let offsetX = 100; // Default if no existing notes
          let offsetY = 0;
          
          if (maxX !== -Infinity && minY !== Infinity) {
            // Position to the right of existing content with spacing
            offsetX = maxX + spacing;
            // Align to top of existing content
            offsetY = (importedMinY !== Infinity) ? minY - importedMinY : 0;
          } else if (importedMinY !== Infinity) {
            // If no existing notes, keep imported notes at their original Y position
            offsetY = 0;
          }
          
          console.log('Board import offset calculation:', {
            maxX,
            minY,
            importedMinY,
            offsetX,
            offsetY,
            spacing,
            existingNotesCount: activeProject.notes.length,
            importedNotesCount: importedNotes.length
          });
          
          const offsetNotes = importedNotes.map(note => ({
            ...note,
            boardX: note.boardX + offsetX,
            boardY: note.boardY + offsetY,
            createdAt: Date.now() + Math.random() // Ensure new timestamps
          }));
          
          // Update connection IDs and note references
          const importedConnections = (newProject.connections || []).map(conn => {
            const newId = generateId();
            return {
              ...conn,
              id: newId,
              fromNoteId: noteIdMap.get(conn.fromNoteId) || conn.fromNoteId,
              toNoteId: noteIdMap.get(conn.toNoteId) || conn.toNoteId
            };
          });
          
          // Filter out duplicate notes before merging
          const uniqueImportedNotes = offsetNotes.filter(importedNote => {
            return !activeProject.notes.some(existingNote => 
              isDuplicateNote(importedNote, existingNote, 'image')
            );
          });
          
          // Filter duplicate frames (by name and position)
          const uniqueImportedFrames = importedFrames.filter(importedFrame => {
            return !(activeProject.frames || []).some(existingFrame => 
              existingFrame.title === importedFrame.title &&
              Math.abs(existingFrame.x - importedFrame.x) < 10 &&
              Math.abs(existingFrame.y - importedFrame.y) < 10
            );
          });
          
          const mergedNotes = [...activeProject.notes, ...uniqueImportedNotes];
          const mergedFrames = [
            ...(activeProject.frames || []),
            ...uniqueImportedFrames
          ];
          const mergedConnections = [
            ...(activeProject.connections || []),
            ...importedConnections
          ];
          
          const updatedProject = {
            ...activeProject,
            notes: mergedNotes,
            frames: mergedFrames,
            connections: mergedConnections
          };
          
          // Save project using new storage system (this will handle image separation)
          await saveProject(updatedProject);
          
          // Reload the project to get the version with image IDs (not Base64)
          const savedProject = await loadProject(updatedProject.id, false);
          if (savedProject && onUpdateProject) {
            onUpdateProject(savedProject);
          } else if (onUpdateProject) {
            // Fallback: use original project if reload fails
            onUpdateProject(updatedProject);
          }
          
          const duplicateNoteCount = offsetNotes.length - uniqueImportedNotes.length;
          const duplicateFrameCount = importedFrames.length - uniqueImportedFrames.length;
          
          let message = `Successfully merged `;
          const parts = [];
          if (uniqueImportedNotes.length > 0) {
            parts.push(`${uniqueImportedNotes.length} note(s)`);
          }
          if (uniqueImportedFrames.length > 0) {
            parts.push(`${uniqueImportedFrames.length} frame(s)`);
          }
          if (importedConnections.length > 0) {
            parts.push(`${importedConnections.length} connection(s)`);
          }
          
          if (parts.length > 0) {
            message += parts.join(', ') + '.';
          } else {
            message += 'data.';
          }
          
          if (duplicateNoteCount > 0 || duplicateFrameCount > 0) {
            const duplicateParts = [];
            if (duplicateNoteCount > 0) {
              duplicateParts.push(`${duplicateNoteCount} note(s)`);
            }
            if (duplicateFrameCount > 0) {
              duplicateParts.push(`${duplicateFrameCount} frame(s)`);
            }
            message += ` ${duplicateParts.join(' and ')} were skipped as duplicates.`;
          }
          
          alert(message);
        }
      } else {
        // Create as new project - regenerate all IDs
        const regeneratedNotes = (newProject.notes || []).map(note => ({
          ...note,
          id: generateId()
        }));
        const regeneratedFrames = (newProject.frames || []).map(frame => ({
          ...frame,
          id: generateId()
        }));
        const regeneratedConnections = (newProject.connections || []).map(conn => ({
          ...conn,
          id: generateId()
        }));
        
        // Debug: count notes by variant
        const noteCounts = {
          standard: regeneratedNotes.filter(n => !n.variant || n.variant === 'standard').length,
          compact: regeneratedNotes.filter(n => n.variant === 'compact').length,
          total: regeneratedNotes.length
        };
        console.log('Importing project:', projectToCreate.name, {
          totalNotes: noteCounts.total,
          standard: noteCounts.standard,
          compact: noteCounts.compact,
          text: noteCounts.text,
          frames: regeneratedFrames.length,
          connections: regeneratedConnections.length
        });
        
        const projectToCreate = {
          ...newProject,
          notes: regeneratedNotes,
          frames: regeneratedFrames,
          connections: regeneratedConnections
        };
        
        // Save project using new storage system (this will handle image separation)
        // This will convert Base64 images to image IDs
        try {
          await saveProject(projectToCreate);
          console.log('Project saved successfully');
        } catch (error) {
          console.error('Error saving project:', error);
          alert('Failed to save imported project: ' + (error instanceof Error ? error.message : 'Unknown error'));
          return;
        }
        
        // Reload the project to get the version with image IDs (not Base64)
        const savedProject = await loadProject(projectToCreate.id, false);
        if (savedProject) {
          console.log('Project reloaded successfully, adding to list');
          // Ensure frames and connections are included in reloaded project
          const projectWithFramesAndConnections = {
            ...savedProject,
            frames: savedProject.frames || projectToCreate.frames || [],
            connections: savedProject.connections || projectToCreate.connections || []
          };
          console.log('Project with frames and connections:', {
            frames: projectWithFramesAndConnections.frames.length,
            connections: projectWithFramesAndConnections.connections.length
          });
          // Add to projects list with separated images
          onCreateProject(projectWithFramesAndConnections);
          
          const itemCounts = [];
          if (regeneratedNotes.length > 0) itemCounts.push(`${regeneratedNotes.length} note(s)`);
          if (regeneratedFrames.length > 0) itemCounts.push(`${regeneratedFrames.length} frame(s)`);
          if (regeneratedConnections.length > 0) itemCounts.push(`${regeneratedConnections.length} connection(s)`);
          
          const message = itemCounts.length > 0 
            ? `Successfully created new project "${newProject.name}" with ${itemCounts.join(', ')}.`
            : `Successfully created new project "${newProject.name}".`;
          alert(message);
        } else {
          console.error('Failed to reload project after save, trying to reload project list');
          // Try to reload all projects to see if it's there
          const allProjects = await loadAllProjects(false);
          const foundProject = allProjects.find(p => p.id === projectToCreate.id);
          if (foundProject) {
            console.log('Project found in all projects, adding to list');
            onCreateProject(foundProject);
            alert(`Successfully imported project "${newProject.name}".`);
          } else {
            console.error('Project not found after save, using fallback');
            // Fallback: use original project if reload fails
            onCreateProject(projectToCreate);
            alert(`Project "${newProject.name}" imported, but there may be an issue with image storage.`);
          }
        }
      }
      
      setShowImportDialog(false);
      setIsImportingFromData(false);
      if (importFileInputRef.current) {
        importFileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Failed to import project:', error);
      alert('Failed to import project. Please check the file format.');
    }
  };

  const handleImportFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleImportProject(e.target.files[0]);
    }
  };

  // Drag and drop handlers for JSON import
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const fileArray = Array.from(files);
      const jsonFile = fileArray.find((file) => 
        file.type === 'application/json' || file.name.endsWith('.json')
      ) as File | undefined;
      
      if (jsonFile) {
        // Always merge when dragging (import data mode)
        setIsImportingFromData(true);
        handleImportProject(jsonFile);
      }
    }
  };

  const containerClass = isSidebar 
    ? "h-full w-full shadow-2xl flex flex-col border-r overflow-hidden" 
    : "w-full min-h-screen flex flex-col items-center justify-start pt-40 pb-0 p-4 relative"; 

  const titleClass = isSidebar
    ? "hidden" // Hide title in sidebar
    : "text-6xl md:text-8xl font-black text-white tracking-tighter mb-12 text-center drop-shadow-sm leading-[0.9] flex flex-col";

  return (
    <div 
      className={`${containerClass} ${isDragging ? 'ring-4 ring-offset-2' : ''}`}
      style={{ 
        backgroundColor: themeColor,
        borderColor: isSidebar ? themeColor : undefined,
        boxShadow: isDragging ? `0 0 0 4px ${themeColor}` : undefined
      }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="fixed inset-0 z-[4000] backdrop-blur-sm flex items-center justify-center pointer-events-none" style={{ backgroundColor: `${themeColor}33` }}>
          <div className="bg-white rounded-2xl shadow-2xl p-8 border-4" style={{ borderColor: themeColor }}>
            <div className="text-center">
              <div className="text-4xl mb-4">📁</div>
              <div className="text-xl font-bold text-gray-800">Drop JSON file to merge project</div>
              <div className="text-sm text-gray-600 mt-2">Duplicate data will be automatically skipped</div>
            </div>
          </div>
        </div>
      )}
      {/* Theme Color Button - Top Left */}
      {!isSidebar && onThemeColorChange && (
        <button
          onClick={() => setShowThemeColorPicker(true)}
          className="absolute top-4 left-4 p-2 bg-white/90 hover:bg-white rounded-xl shadow-lg text-gray-700 transition-all z-[2010]"
          title="Change Theme Color"
        >
          <Palette size={20} />
        </button>
      )}

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
            className="absolute top-4 left-4 p-2 rounded-xl text-white transition-colors z-[2010]"
            style={{ backgroundColor: themeColor }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = themeColorDark}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = themeColor}
          >
            <Home size={24} />
          </button>
          {activeProject && syncStatus === 'idle' && getLastSyncTime() && (
            <div
              className="absolute top-4 right-20 flex items-center justify-center w-8 h-8 p-2 rounded-xl text-white transition-colors z-[2010] cursor-help"
              style={{ backgroundColor: themeColor }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = themeColorDark}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = themeColor}
              title={`Synced: ${new Date(getLastSyncTime()!).toLocaleString('en-US')}`}
            >
              <Cloud size={20} />
            </div>
          )}
          {activeProject && (
            <button 
              onClick={handleExportCurrentView}
              className="absolute top-4 right-12 p-2 rounded-xl text-white transition-colors z-[2010]"
              style={{ backgroundColor: themeColor }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = themeColorDark}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = themeColor}
              title="Export Current View"
            >
              <Download size={24} />
            </button>
          )}
          <button 
            onClick={onCloseSidebar} 
            className="absolute top-4 right-4 p-2 rounded-xl text-white transition-colors z-[2010]"
            style={{ backgroundColor: themeColor }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = themeColorDark}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = themeColor}
          >
            <X size={24} />
          </button>
        </>
      )}

      <div className={isSidebar ? "p-6 pt-28 border-b flex-shrink-0" : "flex flex-col items-center"} style={isSidebar ? { borderColor: `${themeColor}33` } : undefined}>
        {!isSidebar && (
          <>
            <h1 className={titleClass}>
              <span>START</span>
              <span>YOUR</span>
              <span>MAPPING</span>
            </h1>
            
            {/* New Project Button */}
            <button 
              onClick={() => setIsCreating(true)}
              className="mt-8 px-8 py-4 bg-white text-yellow-900 rounded-full font-bold text-lg shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
            >
              <Plus size={24} /> New Project
            </button>
          </>
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
                  ? 'bg-white shadow-lg ring-2 text-yellow-950' 
                  : isSidebar 
                    ? 'text-yellow-900 border' 
                    : 'bg-white/90 hover:bg-white shadow-lg text-gray-800'
              }`}
              style={p.id === currentProjectId 
                ? { boxShadow: `0 0 0 2px ${themeColor}` }
                : isSidebar 
                  ? { backgroundColor: `${themeColor}E6`, borderColor: `${themeColor}33` }
                  : undefined
              }
              onMouseEnter={(e) => {
                if (isSidebar && p.id !== currentProjectId) {
                  e.currentTarget.style.backgroundColor = themeColor;
                }
              }}
              onMouseLeave={(e) => {
                if (isSidebar && p.id !== currentProjectId) {
                  e.currentTarget.style.backgroundColor = `${themeColor}E6`;
                }
              }}
            >
              <div 
                className="flex-1 cursor-pointer" 
                onClick={() => !editingProjectId && onSelectProject(p.id)}
              >
                {editingProjectId === p.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={editingProjectName}
                      onChange={(e) => setEditingProjectName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSaveRename(p);
                        } else if (e.key === 'Escape') {
                          handleCancelRename();
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 px-2 py-1 bg-white border-2 rounded-lg outline-none text-lg font-bold"
                      style={{ borderColor: themeColor }}
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSaveRename(p);
                      }}
                      className="p-1 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                    >
                      <Check size={18} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCancelRename();
                      }}
                      className="p-1 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="font-bold text-lg leading-tight">{p.name}</div>
                    <div className="text-xs flex items-center gap-1 mt-1" style={{ color: 'rgba(0,0,0,0.4)' }}>
                      {p.type === 'map' ? <MapIcon size={12}/> : <ImageIcon size={12}/>}
                      {formatDate(p.createdAt)}
                    </div>
                  </>
                )}
              </div>

              <div className="relative">
                <button 
                  ref={(el) => {
                    if (el && openMenuId === p.id) {
                      // Store button reference for position calculation
                      (el as any).__menuButton = true;
                    }
                  }}
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setOpenMenuId(openMenuId === p.id ? null : p.id); 
                  }}
                  className="p-2 rounded-full transition-colors"
                  style={{ color: p.id === currentProjectId ? themeColor : `${themeColor}99` }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = p.id === currentProjectId ? `${themeColor}1A` : `${themeColor}33`;
                    e.currentTarget.style.color = themeColor;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '';
                    e.currentTarget.style.color = p.id === currentProjectId ? themeColor : `${themeColor}99`;
                  }}
                >
                  <MoreHorizontal size={20} />
                </button>

                {openMenuId === p.id && (
                  <>
                    <div className="fixed inset-0 z-[45] bg-black/20" onClick={() => setOpenMenuId(null)} />
                    {isSidebar ? (
                      <MenuDropdown 
                        project={p}
                        onRename={handleRename}
                        onExportData={handleExportData}
                        onExportFullProject={handleExportFullProject}
                        onCompressImages={handleCompressImages}
                        onDelete={onDeleteProject}
                        onClose={() => setOpenMenuId(null)}
                      />
                    ) : (
                      <div className="fixed inset-x-4 bottom-6 z-[50] bg-white rounded-3xl shadow-2xl border border-gray-200 py-2 animate-in slide-in-from-bottom-4" onClick={(e) => e.stopPropagation()}>
                        <div className="px-4 pt-2 pb-1">
                          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Project</div>
                          <div className="text-sm font-bold text-gray-800 truncate">{p.name}</div>
                        </div>
                      <button 
                          onClick={() => handleRename(p)}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
                      >
                          <Edit2 size={16} /> Rename
                      </button>
                      <div className="h-px bg-gray-100 my-1" />
                      <button 
                          onClick={() => handleExportData(p)}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
                      >
                          <Download size={16} /> Export Data (CSV)
                      </button>
                      <div className="h-px bg-gray-100 my-1" />
                      <button 
                          onClick={() => handleExportFullProject(p)}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
                      >
                          <Download size={16} /> Export Full Project (JSON)
                      </button>
                      <div className="h-px bg-gray-100 my-1" />
                      <button 
                          onClick={() => handleCompressImages(p)}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
                      >
                          <ImageIcon size={16} /> Compress Images
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
                  className="w-full p-3 bg-gray-50 rounded-xl outline-none focus:ring-2 transition-all font-medium"
                  style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                  onFocus={(e) => e.currentTarget.style.boxShadow = `0 0 0 2px ${themeColor}`}
                  onBlur={(e) => e.currentTarget.style.boxShadow = ''}
                  placeholder="My Mapp Trip"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-600 mb-2">Mode</label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => setNewProjectType('map')}
                    className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${newProjectType === 'map' ? '' : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}
                    style={newProjectType === 'map' ? { borderColor: themeColor, backgroundColor: `${themeColor}1A`, color: themeColor } : undefined}
                  >
                    <MapIcon size={24} />
                    <span className="font-bold text-sm">Map Based</span>
                  </button>
                  <button 
                    onClick={() => setNewProjectType('image')}
                    className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${newProjectType === 'image' ? '' : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}
                    style={newProjectType === 'image' ? { borderColor: themeColor, backgroundColor: `${themeColor}1A`, color: themeColor } : undefined}
                  >
                    <ImageIcon size={24} />
                    <span className="font-bold text-sm">Image Based</span>
                  </button>
                </div>
              </div>

              {newProjectType === 'image' && (
                <div>
                   <label className="block text-sm font-bold text-gray-600 mb-2">Background Image (Optional)</label>
                   <label 
                     className="block w-full p-4 border-2 border-dashed border-gray-300 rounded-xl text-center cursor-pointer hover:bg-gray-50 transition-colors"
                     onMouseEnter={(e) => e.currentTarget.style.borderColor = themeColor}
                     onMouseLeave={(e) => e.currentTarget.style.borderColor = ''}
                   >
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
                className="flex-1 py-3 text-yellow-950 font-bold rounded-xl shadow-lg disabled:opacity-50 disabled:shadow-none"
                style={{ backgroundColor: themeColor }}
                onMouseEnter={(e) => !e.currentTarget.disabled && (e.currentTarget.style.backgroundColor = themeColorDark)}
                onMouseLeave={(e) => !e.currentTarget.disabled && (e.currentTarget.style.backgroundColor = themeColor)}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Dialog */}
      {showImportDialog && (
        <div className="fixed inset-0 z-[3000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
            <h2 className="text-2xl font-black text-gray-800 mb-6">
              {isImportingFromData ? 'Import from Data' : 'Import Project'}
            </h2>
            <p className="text-sm text-gray-600 mb-6">
              {isImportingFromData 
                ? 'Import project data into the current project. Map notes will be added directly, board notes will be placed to the right.'
                : 'Select a project JSON file to import as a new project.'}
            </p>
            <input
              ref={importFileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportFileSelect}
              className="hidden"
            />
            <div className="flex gap-3">
              <button 
                onClick={() => {
                  setShowImportDialog(false);
                  setIsImportingFromData(false);
                }} 
                className="flex-1 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-xl"
              >
                Cancel
              </button>
              <button 
                onClick={() => importFileInputRef.current?.click()}
                className="flex-1 py-3 text-yellow-950 font-bold rounded-xl shadow-lg"
                style={{ backgroundColor: themeColor }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = themeColorDark}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = themeColor}
              >
                Select File
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Theme Color Picker */}
      {onThemeColorChange && (
        <ThemeColorPicker
          isOpen={showThemeColorPicker}
          onClose={() => setShowThemeColorPicker(false)}
          currentColor={themeColor}
          onColorChange={onThemeColorChange}
        />
      )}
    </div>
  );
};

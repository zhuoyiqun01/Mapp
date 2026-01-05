import { useState, useEffect, useCallback } from 'react';
import { Note, ViewMode, Project } from '../types';
import {
  loadAllProjects,
  loadProjectSummaries,
  saveProject,
  deleteProject as deleteProjectStorage,
  loadProject,
  loadNoteImages,
  ProjectSummary
} from '../../utils/storage';

interface UseProjectStateReturn {
  // Project state
  projects: Project[];
  projectSummaries: ProjectSummary[];
  activeProject: Project | null;
  currentProjectId: string | null;
  isLoading: boolean;
  isLoadingProject: boolean;
  loadingProgress: number;
  isDeletingProject: boolean;

  // Actions
  loadProjects: () => Promise<void>;
  createProject: (projectData: { name: string; type: 'mapping' | 'board'; backgroundImage?: string }) => Promise<string>;
  selectProject: (projectId: string) => Promise<void>;
  updateProject: (project: Project) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  duplicateProject: (project: Project) => Promise<void>;
  addNoteToProject: (projectId: string, note: Note) => Promise<void>;
  updateNoteInProject: (projectId: string, noteId: string, updates: Partial<Note>) => Promise<void>;
  deleteNoteFromProject: (projectId: string, noteId: string) => Promise<void>;
  setCurrentProjectId: (id: string | null) => void;
  setActiveProject: (project: Project | null) => void;
}

export const useProjectState = (): UseProjectStateReturn => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectSummaries, setProjectSummaries] = useState<ProjectSummary[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isDeletingProject, setIsDeletingProject] = useState(false);

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
      themeColor: '#3B82F6' // Default theme color
    }));
  }, []);

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

          // Load images for this batch of notes
          const loadedBatch = await Promise.all(
            batch.map(async (note) => {
              try {
                const loadedNote = await loadNoteImages(note);
                return loadedNote;
              } catch (error) {
                console.error(`Failed to load images for note ${note.id}:`, error);
                return note; // Return original note if loading fails
              }
            })
          );

          // Update the notes in the project
          for (let j = 0; j < batch.length; j++) {
            project.notes[i + j] = loadedBatch[j];
          }

          loadedNotes += batch.length;
          const progress = 10 + (loadedNotes / totalNotes) * 90;
          setLoadingProgress(Math.min(100, Math.round(progress)));
        }
      } else {
        setLoadingProgress(100);
      }

      return project;
    } catch (error) {
      console.error('Failed to load complete project:', error);
      return null;
    } finally {
      setIsLoadingProject(false);
      setLoadingProgress(0);
    }
  }, []);

  // Load projects on mount
  const loadProjects = useCallback(async () => {
    try {
      setIsLoading(true);
      const summaries = await loadProjectSummaries();
      setProjectSummaries(summaries);
      setProjects(summariesToProjects(summaries));
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setIsLoading(false);
    }
  }, [summariesToProjects]);

  // Create new project
  const createProject = useCallback(async (projectData: { name: string; type: 'mapping' | 'board'; backgroundImage?: string }): Promise<string> => {
    const newProject: Project = {
      id: `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: projectData.name,
      type: projectData.type,
      createdAt: new Date().toISOString(),
      backgroundImage: projectData.backgroundImage,
      notes: [],
      frames: [],
      connections: [],
      backgroundOpacity: 1,
      themeColor: '#3B82F6'
    };

    await saveProject(newProject);

    // Update state
    setProjects(prev => [...prev, newProject]);
    setProjectSummaries(prev => [...prev, {
      id: newProject.id,
      name: newProject.name,
      type: newProject.type,
      createdAt: newProject.createdAt,
      noteCount: 0,
      hasImages: false,
      storageSize: 0
    }]);

    return newProject.id;
  }, []);

  // Select project
  const selectProject = useCallback(async (projectId: string) => {
    setCurrentProjectId(projectId);
    const project = await loadCompleteProject(projectId);
    if (project) {
      setActiveProject(project);
    }
  }, [loadCompleteProject]);

  // Update project
  const updateProject = useCallback(async (updatedProject: Project) => {
    await saveProject(updatedProject);
    setActiveProject(updatedProject);
    setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));

    // Also update projectSummaries to reflect name changes
    setProjectSummaries(prev => prev.map(summary =>
      summary.id === updatedProject.id
        ? { ...summary, name: updatedProject.name }
        : summary
    ));
  }, []);

  // Delete project
  const deleteProject = useCallback(async (projectId: string) => {
    setIsDeletingProject(true);
    try {
      await deleteProjectStorage(projectId);
      setProjects(prev => prev.filter(p => p.id !== projectId));
      setProjectSummaries(prev => prev.filter(p => p.id !== projectId));
      if (currentProjectId === projectId) {
        setCurrentProjectId(null);
        setActiveProject(null);
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
    } finally {
      setIsDeletingProject(false);
    }
  }, [currentProjectId]);

  // Duplicate project
  const duplicateProject = useCallback(async (project: Project) => {
    // Generate new IDs for all entities
    const newProjectId = `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const duplicatedProject: Project = {
      id: newProjectId,
      name: `${project.name} (Copy)`,
      type: project.type,
      createdAt: new Date().toISOString(),
      backgroundImage: project.backgroundImage,
      notes: project.notes.map(note => ({
        ...note,
        id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date().toISOString()
      })),
      frames: project.frames?.map(frame => ({
        ...frame,
        id: `frame_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      })),
      connections: project.connections?.map(conn => ({
        ...conn,
        id: `connection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      })),
      backgroundOpacity: project.backgroundOpacity,
      themeColor: project.themeColor
    };

    await saveProject(duplicatedProject);

    // Update state
    setProjects(prev => [...prev, duplicatedProject]);
    setProjectSummaries(prev => [...prev, {
      id: duplicatedProject.id,
      name: duplicatedProject.name,
      type: duplicatedProject.type,
      createdAt: duplicatedProject.createdAt,
      noteCount: duplicatedProject.notes.length,
      hasImages: duplicatedProject.notes.some(note => note.images && note.images.length > 0),
      storageSize: 0 // Will be calculated when needed
    }]);
  }, []);

  // Add note to project
  const addNoteToProject = useCallback(async (projectId: string, note: Note) => {
    if (!activeProject || activeProject.id !== projectId) return;

    const updatedProject = {
      ...activeProject,
      notes: [...activeProject.notes, note]
    };

    await updateProject(updatedProject);
  }, [activeProject, updateProject]);

  // Update note in project
  const updateNoteInProject = useCallback(async (projectId: string, noteId: string, updates: Partial<Note>) => {
    if (!activeProject || activeProject.id !== projectId) return;

    const updatedProject = {
      ...activeProject,
      notes: activeProject.notes.map(note =>
        note.id === noteId ? { ...note, ...updates } : note
      )
    };

    await updateProject(updatedProject);
  }, [activeProject, updateProject]);

  // Delete note from project
  const deleteNoteFromProject = useCallback(async (projectId: string, noteId: string) => {
    if (!activeProject || activeProject.id !== projectId) return;

    const updatedProject = {
      ...activeProject,
      notes: activeProject.notes.filter(note => note.id !== noteId)
    };

    await updateProject(updatedProject);
  }, [activeProject, updateProject]);

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  return {
    projects,
    projectSummaries,
    activeProject,
    currentProjectId,
    isLoading,
    isLoadingProject,
    loadingProgress,
    isDeletingProject,
    loadProjects,
    createProject,
    selectProject,
    updateProject,
    deleteProject,
    duplicateProject,
    addNoteToProject,
    updateNoteInProject,
    deleteNoteFromProject,
    setCurrentProjectId,
    setActiveProject
  };
};



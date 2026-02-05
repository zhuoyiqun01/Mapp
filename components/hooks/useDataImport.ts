import { useCallback } from 'react';
import type { Note, Project } from '../../types';
import { generateId } from '../../utils';

function isDuplicateNote(note1: Note, note2: Note): boolean {
  if (!note1.coords || !note2.coords) return false;
  const latDiff = Math.abs(note1.coords.lat - note2.coords.lat);
  const lngDiff = Math.abs(note1.coords.lng - note2.coords.lng);
  const textMatch = (note1.text || '').trim() === (note2.text || '').trim();
  return latDiff < 0.0001 && lngDiff < 0.0001 && textMatch;
}

interface UseDataImportProps {
  project: Project;
  onUpdateProject?: (project: Project) => void;
}

export function useDataImport({ project, onUpdateProject }: UseDataImportProps) {
  const handleDataImport = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (!data.project || !data.project.notes) {
          alert('Invalid project file format');
          return;
        }

        const importedNotes = (data.project.notes || []).filter(
          (note: Note) => note.coords && note.coords.lat && note.coords.lng
        );

        if (importedNotes.length === 0) {
          alert('No notes with location data found in the imported file');
          return;
        }

        const existingNotes = project.notes || [];
        const uniqueImportedNotes = importedNotes.filter(
          (importedNote: Note) =>
            !existingNotes.some((existingNote: Note) =>
              isDuplicateNote(importedNote, existingNote)
            )
        );

        const newNotes = uniqueImportedNotes.map((note: Note) => ({
          ...note,
          isFavorite: note.isFavorite ?? false,
          id: generateId(),
          createdAt: Date.now() + Math.random()
        }));

        const mergedNotes = [...existingNotes, ...newNotes];

        if (onUpdateProject) {
          onUpdateProject({ ...project, notes: mergedNotes });
        }

        const duplicateCount = importedNotes.length - uniqueImportedNotes.length;
        if (duplicateCount > 0) {
          alert(
            `Successfully imported ${uniqueImportedNotes.length} new notes. ${duplicateCount} duplicate(s) were skipped.`
          );
        } else {
          alert(`Successfully imported ${uniqueImportedNotes.length} note(s).`);
        }
      } catch (error) {
        console.error('Failed to import data:', error);
        alert('Failed to import data. Please check the file format.');
      }
    },
    [project, onUpdateProject]
  );

  return { handleDataImport };
}

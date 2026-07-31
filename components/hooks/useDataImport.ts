import { useCallback } from 'react';
import type { Note, Project } from '../../types';
import {
  buildNewNotesFromProjectJsonRaws,
  parseProjectJsonNotesPayloadResult
} from '../../utils/import/projectDataImport';
import {
  formatImportErrorMessage,
  formatUnexpectedImportError
} from '../../utils/import/importErrorFormat';

interface UseDataImportProps {
  project: Project;
  onUpdateProject?: (project: Project) => void | Promise<void>;
}

export function useDataImport({ project, onUpdateProject }: UseDataImportProps) {
  const handleDataImport = useCallback(
    async (file: File) => {
      if (!project?.id) {
        alert('请先打开一个项目再导入数据');
        return;
      }
      try {
        const text = await file.text();
        const parsed = parseProjectJsonNotesPayloadResult(text);
        if (parsed.ok === false) {
          alert(formatImportErrorMessage(parsed.error, file.name));
          return;
        }

        const existingNotes = project.notes || [];
        const newNotes = buildNewNotesFromProjectJsonRaws(parsed.rawNotes, existingNotes);

        if (newNotes.length === 0) {
          alert(
            formatImportErrorMessage(
              {
                title: '没有可导入的新便签',
                location: 'project.notes',
                detail: '可能全部与已有数据重复，或 notes 数组为空'
              },
              file.name
            )
          );
          return;
        }

        const mergedNotes = [...existingNotes, ...newNotes];
        await onUpdateProject?.({ ...project, notes: mergedNotes });

        const skipped = parsed.rawNotes.length - newNotes.length;
        if (skipped > 0) {
          alert(`已导入 ${newNotes.length} 条便签；跳过 ${skipped} 条（与已有数据重复等）。`);
        } else {
          alert(`已成功导入 ${newNotes.length} 条便签。`);
        }
      } catch (error) {
        console.error('Failed to import data:', error);
        alert(formatUnexpectedImportError(error, file.name));
      }
    },
    [project, onUpdateProject]
  );

  return { handleDataImport };
}

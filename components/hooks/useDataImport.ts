import { useCallback } from 'react';
import type { Note, Project } from '../../types';
import {
  buildNewNotesFromProjectJsonRaws,
  parseProjectJsonNotesPayload
} from '../../utils/import/projectDataImport';

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
        const parsed = parseProjectJsonNotesPayload(text);
        if (!parsed) {
          alert('无效的项目 JSON：需要包含 project.notes 数组');
          return;
        }

        const existingNotes = project.notes || [];
        const newNotes = buildNewNotesFromProjectJsonRaws(parsed.rawNotes, existingNotes);

        if (newNotes.length === 0) {
          alert('没有可导入的新便签（可能全部重复或文件为空）');
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
        alert('导入失败，请检查文件格式。');
      }
    },
    [project, onUpdateProject]
  );

  return { handleDataImport };
}

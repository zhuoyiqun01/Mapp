import { useCallback } from 'react';
import type { Note } from '../../types';
import { nextSequentialSlot } from '../../utils/board/boardPlacement';

/**
 * 计算新便签在 Board 视图中的放置坐标。
 * 使用与 BoardView "+" 按钮一致的顺序定位算法（行优先填充）。
 */
export function useNotePositioning(notes: Note[]) {
  const computeBoardPosition = useCallback((): { boardX: number; boardY: number } => {
    const boardNotes = notes.filter((n) => n.boardX !== undefined && n.boardY !== undefined);
    return nextSequentialSlot(boardNotes.length);
  }, [notes]);

  return { computeBoardPosition };
}

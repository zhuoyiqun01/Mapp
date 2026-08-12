import type { Frame, Note } from '../../types';
import { boardNoteDimensions } from './boardPlacement';

/** 便签中心落在哪个 Frame 内（重叠取第一个） */
export function findFrameContainingNoteCenter(
  note: Pick<Note, 'boardX' | 'boardY' | 'imageWidth' | 'imageHeight' | 'variant' | 'media' | 'imageRefs'>,
  boardX: number,
  boardY: number,
  frames: Frame[]
): Frame | undefined {
  const { width, height } = boardNoteDimensions(note as Note);
  const centerX = boardX + width / 2;
  const centerY = boardY + height / 2;
  return frames.find(
    (frame) =>
      centerX >= frame.x &&
      centerX <= frame.x + frame.width &&
      centerY >= frame.y &&
      centerY <= frame.y + frame.height
  );
}

/** 写入 board 位置，并按中心点同步单簇 Frame 归属 */
export function noteWithBoardDragCommit(
  note: Note,
  boardX: number,
  boardY: number,
  frames: Frame[]
): Note {
  const frame = findFrameContainingNoteCenter(note, boardX, boardY, frames);
  if (frame) {
    return {
      ...note,
      boardX,
      boardY,
      groupIds: [frame.id],
      groupNames: [frame.title],
      groupId: frame.id,
      groupName: frame.title
    };
  }
  return {
    ...note,
    boardX,
    boardY,
    groupIds: undefined,
    groupNames: undefined,
    groupId: undefined,
    groupName: undefined
  };
}

/** 批量应用同一世界坐标偏移 */
export function applyBoardDragOffsetToNotes(
  notes: Note[],
  noteIds: Iterable<string>,
  offset: { x: number; y: number },
  frames: Frame[]
): { notes: Note[]; changed: boolean } {
  if (offset.x === 0 && offset.y === 0) return { notes, changed: false };
  const idSet = noteIds instanceof Set ? noteIds : new Set(noteIds);
  if (idSet.size === 0) return { notes, changed: false };

  let changed = false;
  const next = notes.map((n) => {
    if (!idSet.has(n.id)) return n;
    changed = true;
    return noteWithBoardDragCommit(n, n.boardX + offset.x, n.boardY + offset.y, frames);
  });
  return { notes: next, changed };
}

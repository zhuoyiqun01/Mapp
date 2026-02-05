import { useCallback } from 'react';
import type { Note } from '../../types';

const NOTE_WIDTH = 256;
const NOTE_HEIGHT = 256;
const SPACING = 50;
const ASPECT_RATIO_THRESHOLD = 2.5;
const DEFAULT_X = 100;
const DEFAULT_Y = 100;

function getNoteDimensions(note: Note): { width: number; height: number } {
  const size = note.variant === 'compact' ? 180 : 256;
  return { width: size, height: size };
}

/**
 * Computes boardX and boardY for a new note to avoid overlap with existing notes.
 * Uses same logic as BoardView's createNoteAtCenter.
 */
export function useNotePositioning(notes: Note[]) {
  const computeBoardPosition = useCallback((): { boardX: number; boardY: number } => {
    const boardNotes = notes.filter((n) => n.boardX !== undefined && n.boardY !== undefined);
    if (boardNotes.length === 0) {
      return { boardX: DEFAULT_X, boardY: DEFAULT_Y };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    boardNotes.forEach((note) => {
      const { width, height } = getNoteDimensions(note);
      const noteLeft = note.boardX!;
      const noteRight = noteLeft + width;
      const noteTop = note.boardY!;
      const noteBottom = noteTop + height;
      if (noteLeft < minX) minX = noteLeft;
      if (noteTop < minY) minY = noteTop;
      if (noteRight > maxX) maxX = noteRight;
      if (noteBottom > maxY) maxY = noteBottom;
    });

    if (maxX === -Infinity || minY === Infinity) {
      return { boardX: DEFAULT_X, boardY: DEFAULT_Y };
    }

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const aspectRatio = contentHeight > 0 ? contentWidth / contentHeight : 0;

    if (aspectRatio > ASPECT_RATIO_THRESHOLD) {
      return { boardX: minX, boardY: maxY + SPACING };
    }
    return { boardX: maxX + SPACING, boardY: minY };
  }, [notes]);

  return { computeBoardPosition };
}

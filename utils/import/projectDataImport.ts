import type { Coordinates, Note } from '../../types';
import { generateId } from '../../utils';

export function generateBoardSlotForImport(index: number): { boardX: number; boardY: number } {
  const col = index % 6;
  const row = Math.floor(index / 6);
  return { boardX: 100 + col * 306, boardY: 100 + row * 306 };
}

function normalizeCoordsFromRaw(note: Note): Coordinates {
  const c = note?.coords;
  if (c && typeof c.lat === 'number' && typeof c.lng === 'number' && !isNaN(c.lat) && !isNaN(c.lng)) {
    return { lat: c.lat, lng: c.lng };
  }
  return { lat: 0, lng: 0 };
}

function notesAreNearDuplicate(a: Note, b: Note): boolean {
  if ((a.text || '').trim() !== (b.text || '').trim()) return false;
  const ca = a.coords;
  const cb = b.coords;
  if (!ca || !cb) return false;
  if (Math.abs(ca.lat - cb.lat) >= 0.0001 || Math.abs(ca.lng - cb.lng) >= 0.0001) return false;
  if (Math.abs(a.boardX - b.boardX) >= 5 || Math.abs(a.boardY - b.boardY) >= 5) return false;
  return true;
}

/**
 * 自项目导出 JSON（data.project.notes）生成待合并的新便签：补全坐标/看板位、分配新 id。
 * 无地理信息的条目 coords 为 0,0，地图侧不绘制。
 */
export function buildNewNotesFromProjectJsonRaws(rawNotes: Note[], existingNotes: Note[]): Note[] {
  const combinedForDedupe: Note[] = [...existingNotes];
  const out: Note[] = [];

  rawNotes.forEach((raw, importIdx) => {
    const coords = normalizeCoordsFromRaw(raw);
    const hasBoard =
      typeof raw.boardX === 'number' &&
      !isNaN(raw.boardX) &&
      typeof raw.boardY === 'number' &&
      !isNaN(raw.boardY);
    const board = hasBoard
      ? { boardX: raw.boardX!, boardY: raw.boardY! }
      : generateBoardSlotForImport(combinedForDedupe.length + out.length);

    const rawVar = (raw as Note & { variant?: string }).variant;
    const variant: 'standard' | 'image' = rawVar === 'image' ? 'image' : 'standard';

    const candidate: Note = {
      ...raw,
      id: generateId(),
      createdAt: Date.now() + importIdx * 0.001 + Math.random(),
      coords,
      boardX: board.boardX,
      boardY: board.boardY,
      emoji: raw.emoji ?? '',
      text: raw.text ?? '',
      fontSize: typeof raw.fontSize === 'number' ? raw.fontSize : 3,
      isFavorite: raw.isFavorite ?? false,
      color: raw.color ?? '#FFFDF5',
      images: Array.isArray(raw.images) ? raw.images : [],
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      variant,
      startYear: raw.startYear,
      endYear: raw.endYear,
      sketch: raw.sketch,
      imageWidth: raw.imageWidth,
      imageHeight: raw.imageHeight,
      layoutScale: raw.layoutScale,
      groupId: raw.groupId,
      groupName: raw.groupName,
      groupIds: raw.groupIds,
      groupNames: raw.groupNames,
      noteGroupId: raw.noteGroupId,
      layerItemHidden: raw.layerItemHidden,
      layerStackOrder: raw.layerStackOrder
    };

    if (combinedForDedupe.some((e) => notesAreNearDuplicate(candidate, e))) return;
    if (out.some((o) => notesAreNearDuplicate(candidate, o))) return;
    out.push(candidate);
  });

  return out;
}

export function parseProjectJsonNotesPayload(text: string): { rawNotes: Note[] } | null {
  let data: { project?: { notes?: Note[] } };
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    return null;
  }
  if (!data?.project?.notes || !Array.isArray(data.project.notes)) return null;
  return { rawNotes: data.project.notes as Note[] };
}

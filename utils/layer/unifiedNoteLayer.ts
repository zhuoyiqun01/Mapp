import type { Frame, GraphLayerState, Note } from '../../types';
import { GRAPH_UNTAGGED_TAG_GROUP } from '../graph/graphRuntimeCore';
import type { GraphLayerGroupStandard } from '../graph/graphRuntimeCore';

/**
 * 地图可绘制的地理坐标：有效数字且非占位 0,0（无坐标/仅白板数据的导入使用 0,0）。
 */
export function noteHasRenderableMapPosition(note: Note): boolean {
  if (note.variant !== 'standard') return false;
  const c = note.coords;
  if (!c || typeof c.lat !== 'number' || typeof c.lng !== 'number' || isNaN(c.lat) || isNaN(c.lng)) {
    return false;
  }
  if (c.lat === 0 && c.lng === 0) return false;
  return true;
}

export function truncateRawTextLabel(text: string, maxLen = 56): string {
  const raw = String(text ?? '');
  const singleLine = raw.replace(/\r\n/g, '\n').replace(/\n/g, ' ').trim();
  if (!singleLine) return '（空）';
  return singleLine.length > maxLen ? `${singleLine.slice(0, Math.max(0, maxLen - 1))}…` : singleLine;
}

export function noteTagLayerGroupKey(note: Note): string {
  const raw = note.tags?.[0]?.label?.trim() ?? '';
  return raw === '' ? GRAPH_UNTAGGED_TAG_GROUP : raw;
}

export function noteFrameIdCandidates(note: Note): string[] {
  const raw = note.groupIds?.length
    ? note.groupIds
    : note.groupId
      ? [note.groupId]
      : note.groupNames?.length
        ? note.groupNames
        : note.groupName
          ? [note.groupName]
          : [];
  return raw.map((x) => String(x).trim()).filter((x) => x !== '');
}

/** 与图谱 frame 模式一致：取第一个未在 hiddenSet 中的帧；否则退回首候选 */
export function effectiveFrameGroupKeyForNote(note: Note, hiddenSet: Set<string>): string {
  const candidates = noteFrameIdCandidates(note);
  if (candidates.length === 0) return '';
  for (const id of candidates) {
    if (!hiddenSet.has(id)) return id;
  }
  return candidates[0];
}

export function noteBelongsToLayerGroupKey(
  note: Note,
  groupKey: string,
  standard: GraphLayerGroupStandard
): boolean {
  const k = String(groupKey).trim();
  if (standard === 'tag') {
    return noteTagLayerGroupKey(note) === k;
  }
  if (k === '') {
    return noteFrameIdCandidates(note).length === 0;
  }
  return noteFrameIdCandidates(note).includes(k);
}

/**
 * 组级未隐藏 且 节点未 layerItemHidden 时可在各视图显示。
 * frame 模式与图谱一致：按 effectiveFrameGroupKey 判断是否被组隐藏。
 */
export function isNoteVisibleInUnifiedLayer(
  note: Note,
  merged: GraphLayerState,
  standard: GraphLayerGroupStandard
): boolean {
  if (note.layerItemHidden) return false;
  const hiddenSet = new Set((merged.hidden ?? []).map((h) => String(h).trim()));
  if (standard === 'tag') {
    const g = noteTagLayerGroupKey(note);
    return !hiddenSet.has(g);
  }
  const g = effectiveFrameGroupKeyForNote(note, hiddenSet);
  return !hiddenSet.has(g);
}

export function groupDisplayLabel(
  key: string,
  standard: GraphLayerGroupStandard,
  framesById: Map<string, Frame>
): string {
  const k = String(key).trim();
  if (standard === 'tag') {
    if (k === '' || k === GRAPH_UNTAGGED_TAG_GROUP) return '无标签';
    return k;
  }
  if (k === '') return '无帧';
  return framesById.get(k)?.title ?? k;
}

export function sortNotesByLayerStack(noteList: Note[]): Note[] {
  return [...noteList].sort((a, b) => {
    const oa = a.layerStackOrder ?? a.createdAt;
    const ob = b.layerStackOrder ?? b.createdAt;
    if (oa !== ob) return oa - ob;
    return a.id.localeCompare(b.id);
  });
}

/** 同组内列表展示顺序：叠放靠前（大 layerStackOrder）在上 */
export function sortNotesForLayerPanelDesc(noteList: Note[]): Note[] {
  return [...noteList].sort((a, b) => {
    const oa = a.layerStackOrder ?? a.createdAt;
    const ob = b.layerStackOrder ?? b.createdAt;
    if (oa !== ob) return ob - oa;
    return a.id.localeCompare(b.id);
  });
}

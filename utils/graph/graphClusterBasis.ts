import type { Frame, Note, Tag } from '../../types';
import { tagHierarchyPrefix } from '../layer/tagHierarchy';

/** 与 graphRuntimeCore.GRAPH_UNTAGGED_TAG_GROUP 保持一致 */
const UNTAGGED = '无标签';

/** `'frame'` = 簇图层；其它字符串 = 一级标签前缀 */
export type GraphClusterBasis = 'frame' | string;

export const GRAPH_CLUSTER_BASIS_FRAME = 'frame' as const;

export function normalizeGraphClusterBasis(raw: unknown): GraphClusterBasis {
  const s = String(raw ?? '').trim();
  if (!s || s === GRAPH_CLUSTER_BASIS_FRAME) return GRAPH_CLUSTER_BASIS_FRAME;
  return s;
}

export function isFrameClusterBasis(basis: GraphClusterBasis): boolean {
  return normalizeGraphClusterBasis(basis) === GRAPH_CLUSTER_BASIS_FRAME;
}

/** 便签首标签（多标签只认 tags[0]） */
export function noteFirstTag(note: Note): Tag | undefined {
  const t = note.tags?.[0];
  if (!t) return undefined;
  const label = String(t.label ?? '').trim();
  if (!label) return undefined;
  return t;
}

/**
 * 时间线/图例/填色用的聚类分组键。
 * - frame：首个簇 id；无簇为 ''
 * - tagPrefix P：仅当 tags[0] 的一级前缀为 P 时返回完整标签，否则 ''
 */
export function resolveNoteClusterGroupKey(note: Note, basis: GraphClusterBasis): string {
  const b = normalizeGraphClusterBasis(basis);
  if (isFrameClusterBasis(b)) {
    return String(note.groupIds?.[0] ?? note.groupId ?? note.groupNames?.[0] ?? note.groupName ?? '').trim();
  }
  const first = noteFirstTag(note);
  if (!first) return '';
  const label = String(first.label).trim();
  if (label === UNTAGGED) return '';
  if (tagHierarchyPrefix(label) !== b) return '';
  return label;
}

/** 节点填色：与聚类依据 / 图例一致 */
export function noteColorForClusterBasis(
  note: Note,
  fallback: string,
  basis: GraphClusterBasis,
  framesById?: Map<string, Frame>
): string {
  const b = normalizeGraphClusterBasis(basis);
  if (isFrameClusterBasis(b)) {
    const frameId = String(note.groupIds?.[0] ?? note.groupId ?? '').trim();
    if (frameId && framesById?.has(frameId)) {
      const fc = framesById.get(frameId)?.color?.trim();
      if (fc) return fc;
    }
    const first = noteFirstTag(note);
    if (first?.color) return first.color;
    if (note.color) return note.color;
    return fallback;
  }
  const first = noteFirstTag(note);
  if (first) {
    const label = String(first.label).trim();
    if (label && tagHierarchyPrefix(label) === b && first.color) return first.color;
  }
  return fallback;
}

/** cytoscape 节点上按依据取时间线分组键（tagGroup 已是 tags[0]） */
export function resolveCyClusterGroupKey(
  tagGroup: string,
  frameGroup: string,
  basis: GraphClusterBasis
): string {
  const b = normalizeGraphClusterBasis(basis);
  if (isFrameClusterBasis(b)) return String(frameGroup ?? '').trim();
  const tag = String(tagGroup ?? '').trim();
  if (!tag || tag === UNTAGGED) return '';
  if (tagHierarchyPrefix(tag) !== b) return '';
  return tag;
}

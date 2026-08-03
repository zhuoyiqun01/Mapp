import type { Frame, Note, Tag } from '../../types';
import { tagHierarchyPrefix, tagHierarchySuffix } from '../layer/tagHierarchy';

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

/** 便签首标签（多标签默认顺序） */
export function noteFirstTag(note: Note): Tag | undefined {
  const t = note.tags?.[0];
  if (!t) return undefined;
  const label = String(t.label ?? '').trim();
  if (!label) return undefined;
  return t;
}

/**
 * 按聚类依据取用于分层的标签：在 tags 顺序中找「一级前缀 === basis」的第一个。
 * （多标签时仍按数组顺序；把匹配该维度的标签拖到更前即可优先。）
 */
export function noteTagMatchingClusterBasis(note: Note, basis: GraphClusterBasis): Tag | undefined {
  const b = normalizeGraphClusterBasis(basis);
  if (isFrameClusterBasis(b)) return undefined;
  for (const t of note.tags ?? []) {
    const label = String(t.label ?? '').trim();
    if (!label || label === UNTAGGED) continue;
    if (tagHierarchyPrefix(label) === b) return t;
  }
  return undefined;
}

/**
 * 时间线/图例/填色用的聚类分组键。
 * - frame：首个簇 id；无簇为 ''
 * - tagPrefix P：首个前缀为 P 的完整标签（按后缀区分层）；无匹配为 ''
 */
export function resolveNoteClusterGroupKey(note: Note, basis: GraphClusterBasis): string {
  const b = normalizeGraphClusterBasis(basis);
  if (isFrameClusterBasis(b)) {
    return String(note.groupIds?.[0] ?? note.groupId ?? note.groupNames?.[0] ?? note.groupName ?? '').trim();
  }
  const matched = noteTagMatchingClusterBasis(note, b);
  return matched ? String(matched.label).trim() : '';
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
  const matched = noteTagMatchingClusterBasis(note, b);
  if (matched?.color) return matched.color;
  return fallback;
}

/** cytoscape：按依据取时间线分组键（优先用全部 tagLabels，兼容仅有 tagGroup） */
export function resolveCyClusterGroupKey(
  tagGroup: string,
  frameGroup: string,
  basis: GraphClusterBasis,
  tagLabels?: unknown
): string {
  const b = normalizeGraphClusterBasis(basis);
  if (isFrameClusterBasis(b)) return String(frameGroup ?? '').trim();

  const labels: string[] = [];
  if (Array.isArray(tagLabels)) {
    for (const x of tagLabels) {
      const s = String(x ?? '').trim();
      if (s) labels.push(s);
    }
  }
  const primary = String(tagGroup ?? '').trim();
  if (primary && !labels.includes(primary)) labels.unshift(primary);

  for (const label of labels) {
    if (!label || label === UNTAGGED) continue;
    if (tagHierarchyPrefix(label) === b) return label;
  }
  return '';
}

export type GraphNodeColorLegendItem = {
  key: string;
  label: string;
  colors: string[];
};

/**
 * 节点颜色图例条目（顺序：图层 order 优先，其余字母序）。
 * 与 GraphView 左下角图例一致。
 */
export function buildGraphNodeColorLegendItems(opts: {
  notes: Note[];
  themeColor: string;
  frames?: Frame[] | null;
  clusterBasis?: unknown;
  tagLayerOrder?: string[] | null;
  frameLayerOrder?: string[] | null;
}): GraphNodeColorLegendItem[] {
  const themeColor = opts.themeColor;
  const notes = opts.notes ?? [];
  const frames = opts.frames ?? [];
  const framesById = new Map(frames.map((f) => [String(f.id).trim(), f]));

  const tagOrder = opts.tagLayerOrder ?? [];
  const prefixes = new Set(
    tagOrder
      .map((k) => tagHierarchyPrefix(String(k).trim()))
      .filter((p) => p && p !== UNTAGGED)
  );
  const raw = normalizeGraphClusterBasis(opts.clusterBasis);
  const clusterBasis =
    isFrameClusterBasis(raw) || prefixes.has(raw) ? raw : GRAPH_CLUSTER_BASIS_FRAME;

  if (isFrameClusterBasis(clusterBasis)) {
    const usedFrameIds = new Set<string>();
    let hasUnframed = false;
    for (const note of notes) {
      const fid = String(note.groupIds?.[0] ?? note.groupId ?? '').trim();
      if (fid && framesById.has(fid)) usedFrameIds.add(fid);
      else hasUnframed = true;
    }

    const keysInOrder = opts.frameLayerOrder ?? [];
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const k of keysInOrder) {
      const key = String(k).trim();
      if (!key) continue;
      if (usedFrameIds.has(key) && !seen.has(key)) {
        ordered.push(key);
        seen.add(key);
      }
    }
    const rest = [...usedFrameIds]
      .filter((k) => !seen.has(k))
      .sort((a, b) => {
        const ta = framesById.get(a)?.title ?? a;
        const tb = framesById.get(b)?.title ?? b;
        return ta.localeCompare(tb, 'zh-Hans-CN');
      });

    const items = [...ordered, ...rest].map((id) => {
      const f = framesById.get(id);
      const color = (f?.color ?? themeColor).toString().trim() || themeColor;
      return {
        key: id,
        label: f?.title?.trim() || id,
        colors: [color]
      };
    });

    if (hasUnframed) {
      items.push({
        key: '__no_frame__',
        label: '无簇',
        colors: [themeColor]
      });
    }
    return items;
  }

  const usedKeys = new Set<string>();
  let hasOther = false;
  const colorByKey = new Map<string, string>();
  for (const note of notes) {
    const key = resolveNoteClusterGroupKey(note, clusterBasis);
    if (!key) {
      hasOther = true;
      continue;
    }
    usedKeys.add(key);
    if (!colorByKey.has(key)) {
      const c = noteTagMatchingClusterBasis(note, clusterBasis)?.color?.trim();
      if (c) colorByKey.set(key, c);
    }
  }

  const keysInOrder = tagOrder;
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const k of keysInOrder) {
    const key = String(k).trim();
    if (!key || tagHierarchyPrefix(key) !== clusterBasis) continue;
    if (usedKeys.has(key) && !seen.has(key)) {
      ordered.push(key);
      seen.add(key);
    }
  }
  const rest = [...usedKeys]
    .filter((k) => !seen.has(k))
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));

  const items = [...ordered, ...rest].map((id) => ({
    key: id,
    label: tagHierarchySuffix(id) || id,
    colors: [colorByKey.get(id) ?? themeColor]
  }));

  if (hasOther) {
    items.push({
      key: '__no_cluster_tag__',
      label: '无/其他',
      colors: [themeColor]
    });
  }
  return items;
}

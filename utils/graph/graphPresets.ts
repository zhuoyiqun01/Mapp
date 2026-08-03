import type { Core } from 'cytoscape';
import { get, set } from 'idb-keyval';
import type { Frame, Note, TagVisibilityLogic } from '../../types';
import {
  buildGraphNodeColorLegendItems,
  GRAPH_CLUSTER_BASIS_FRAME,
  type GraphNodeColorLegendItem
} from './graphClusterBasis';
import { applyGraphDualLayerNodeVisibility } from './graphRuntimeCore';

/** 图谱视图临时预设（不写入 Project / 项目 JSON） */
export type GraphViewPreset = {
  id: string;
  name: string;
  updatedAt: number;
  clusterBasis: string;
  positions: Record<string, { x: number; y: number }>;
  nodeColors: Record<string, string>;
  legendItems: GraphNodeColorLegendItem[];
  /** 标签图层 hidden 键（与图层面板眼睛一致） */
  tagHidden?: string[];
  /** 簇图层 hidden 键 */
  frameHidden?: string[];
  /** 标签显隐逻辑 */
  tagVisibilityLogic?: TagVisibilityLogic;
  /** 单节点 layerItemHidden */
  layerItemHidden?: Record<string, boolean>;
};

export type GraphPresetsStore = {
  presets: GraphViewPreset[];
  activePresetId?: string | null;
};

function presetsStorageKey(projectId: string): string {
  return `mapp-graph-view-presets:v1:${projectId}`;
}

function newPresetId(): string {
  return `gp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isDecorNode(cy: Core, id: string): boolean {
  const n = cy.getElementById(id);
  if (n.empty() || !n.isNode()) return true;
  return n.hasClass('frame-cluster-label') || n.hasClass('frame-cluster-halo');
}

function normalizeHiddenList(raw?: string[] | null): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((h) => String(h).trim()).filter(Boolean);
}

/** 从当前 cy 捕获点位、颜色、图例与显隐 */
export function captureGraphViewPreset(
  cy: Core,
  opts: {
    name: string;
    notes: Note[];
    themeColor: string;
    frames?: Frame[] | null;
    clusterBasis: string;
    tagLayerOrder?: string[] | null;
    frameLayerOrder?: string[] | null;
    tagHidden?: string[] | null;
    frameHidden?: string[] | null;
    tagVisibilityLogic?: TagVisibilityLogic | null;
    existingId?: string;
  }
): GraphViewPreset {
  const positions: Record<string, { x: number; y: number }> = {};
  const nodeColors: Record<string, string> = {};
  const layerItemHidden: Record<string, boolean> = {};

  cy.nodes().forEach((n) => {
    if (n.hasClass('frame-cluster-label') || n.hasClass('frame-cluster-halo')) return;
    const id = n.id();
    const p = n.position();
    positions[id] = { x: p.x, y: p.y };
    const color = String(n.data('color') ?? '').trim();
    if (color) nodeColors[id] = color;
    const lh = n.data('layerItemHidden');
    layerItemHidden[id] = lh === true || lh === 'yes' || lh === 1;
  });

  for (const note of opts.notes ?? []) {
    if (!(note.id in layerItemHidden)) {
      layerItemHidden[note.id] = Boolean(note.layerItemHidden);
    }
  }

  const legendItems = buildGraphNodeColorLegendItems({
    notes: opts.notes,
    themeColor: opts.themeColor,
    frames: opts.frames,
    clusterBasis: opts.clusterBasis,
    tagLayerOrder: opts.tagLayerOrder,
    frameLayerOrder: opts.frameLayerOrder
  });

  return {
    id: opts.existingId || newPresetId(),
    name: String(opts.name || '预设').trim() || '预设',
    updatedAt: Date.now(),
    clusterBasis: opts.clusterBasis || GRAPH_CLUSTER_BASIS_FRAME,
    positions,
    nodeColors,
    legendItems,
    tagHidden: normalizeHiddenList(opts.tagHidden),
    frameHidden: normalizeHiddenList(opts.frameHidden),
    tagVisibilityLogic: opts.tagVisibilityLogic === 'and' ? 'and' : 'or',
    layerItemHidden
  };
}

/** 将预设点位、颜色与单节点显隐写回 cy（缺失 id 跳过） */
export function applyGraphViewPresetToCy(cy: Core, preset: GraphViewPreset): void {
  cy.batch(() => {
    for (const [id, pos] of Object.entries(preset.positions ?? {})) {
      if (isDecorNode(cy, id)) continue;
      const n = cy.getElementById(id);
      if (n.empty() || !n.isNode()) continue;
      if (
        typeof pos?.x === 'number' &&
        typeof pos?.y === 'number' &&
        Number.isFinite(pos.x) &&
        Number.isFinite(pos.y)
      ) {
        n.position({ x: pos.x, y: pos.y });
      }
    }
    for (const [id, color] of Object.entries(preset.nodeColors ?? {})) {
      if (isDecorNode(cy, id)) continue;
      const n = cy.getElementById(id);
      if (n.empty() || !n.isNode()) continue;
      const c = String(color ?? '').trim();
      if (c) n.data('color', c);
    }
    if (preset.layerItemHidden) {
      for (const [id, hidden] of Object.entries(preset.layerItemHidden)) {
        if (isDecorNode(cy, id)) continue;
        const n = cy.getElementById(id);
        if (n.empty() || !n.isNode()) continue;
        n.data('layerItemHidden', Boolean(hidden));
      }
    }
  });
}

/** 按预设恢复标签层 + 簇层显隐（旧预设无字段则跳过） */
export function applyGraphViewPresetVisibility(cy: Core, preset: GraphViewPreset): void {
  if (preset.tagHidden == null && preset.frameHidden == null) return;
  applyGraphDualLayerNodeVisibility(
    cy,
    normalizeHiddenList(preset.tagHidden),
    normalizeHiddenList(preset.frameHidden),
    preset.tagVisibilityLogic === 'and' ? 'and' : 'or'
  );
}

export async function loadGraphPresetsStore(projectId: string): Promise<GraphPresetsStore> {
  if (!projectId) return { presets: [], activePresetId: null };
  try {
    const raw = await get<GraphPresetsStore>(presetsStorageKey(projectId));
    if (!raw || !Array.isArray(raw.presets)) return { presets: [], activePresetId: null };
    return {
      presets: raw.presets.filter((p) => p && typeof p.id === 'string'),
      activePresetId: raw.activePresetId ?? null
    };
  } catch (err) {
    console.warn('Failed to load graph presets', err);
    return { presets: [], activePresetId: null };
  }
}

export async function saveGraphPresetsStore(
  projectId: string,
  store: GraphPresetsStore
): Promise<void> {
  if (!projectId) return;
  try {
    await set(presetsStorageKey(projectId), {
      presets: store.presets ?? [],
      activePresetId: store.activePresetId ?? null
    });
  } catch (err) {
    console.warn('Failed to save graph presets', err);
  }
}

export function upsertPresetInStore(
  store: GraphPresetsStore,
  preset: GraphViewPreset
): GraphPresetsStore {
  const idx = store.presets.findIndex((p) => p.id === preset.id);
  const presets =
    idx >= 0
      ? store.presets.map((p, i) => (i === idx ? preset : p))
      : [...store.presets, preset];
  return { presets, activePresetId: preset.id };
}

export function renamePresetInStore(
  store: GraphPresetsStore,
  id: string,
  name: string
): GraphPresetsStore {
  const nextName = String(name || '').trim() || '预设';
  return {
    ...store,
    presets: store.presets.map((p) =>
      p.id === id ? { ...p, name: nextName, updatedAt: Date.now() } : p
    )
  };
}

export function deletePresetInStore(store: GraphPresetsStore, id: string): GraphPresetsStore {
  const presets = store.presets.filter((p) => p.id !== id);
  const activePresetId =
    store.activePresetId === id ? (presets[0]?.id ?? null) : store.activePresetId;
  return { presets, activePresetId };
}

import type { Core, ElementDefinition, NodeSingular } from 'cytoscape';
import type { GraphExportPayload } from './graphData';
import type { GraphLayerState, Note } from '../../types';
// Cytoscape 的 style stylesheet 类型导出在当前工具链下不稳定，这里用宽类型避免无关的类型检查阻塞。
type Stylesheet = any;

const GRAPH_SORT_LOCALE = 'zh-Hans-CN';

function orderedTagGroupKeysFromState(allKeys: Set<string>, layers: GraphLayerState): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const k of layers.order) {
    const key = String(k).trim();
    if (allKeys.has(key) && !seen.has(key)) {
      ordered.push(key);
      seen.add(key);
    }
  }
  const rest = [...allKeys]
    .filter((k) => !seen.has(k))
    .sort((a, b) => {
      if (a === '' && b !== '') return 1;
      if (b === '' && a !== '') return -1;
      return a.localeCompare(b, GRAPH_SORT_LOCALE);
    });
  return [...ordered, ...rest];
}

export const GRAPH_LAYER_WEIGHT_MIN = 0.1;
export const GRAPH_LAYER_WEIGHT_MAX = 1;
const GRAPH_LAYER_WEIGHT_SPAN = GRAPH_LAYER_WEIGHT_MAX - GRAPH_LAYER_WEIGHT_MIN;

function clampGraphLayerWeight(w: number): number {
  return Math.min(GRAPH_LAYER_WEIGHT_MAX, Math.max(GRAPH_LAYER_WEIGHT_MIN, Number.isFinite(w) ? w : 0.5));
}

function graphLayerWeightNorm(wgt: number): number {
  return (clampGraphLayerWeight(wgt) - GRAPH_LAYER_WEIGHT_MIN) / GRAPH_LAYER_WEIGHT_SPAN;
}

/** 稳定字符串哈希：用于给每个标签组分配固定相位，避免全组重叠在同一角度。 */
function stableAngleSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/** 按 graphLayers.hidden 控制节点显示（与 tagGroup 一致） */
export function applyGraphLayerNodeVisibility(cy: Core, hidden: string[]): void {
  const hiddenSet = new Set(hidden.map((h) => String(h).trim()));
  cy.batch(() => {
    cy.nodes().forEach((node) => {
      const g = String(node.data('tagGroup') ?? '').trim();
      node.style('display', hiddenSet.has(g) ? 'none' : 'element');
    });
  });
}

function applyGraphWeightedCircleLayout(cy: Core, layers: GraphLayerState): void {
  const nodes = cy.nodes();
  if (nodes.length === 0) return;

  const byGroup = new Map<string, NodeSingular[]>();
  nodes.forEach((n) => {
    const key = String(n.data('tagGroup') ?? '').trim();
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key)!.push(n);
  });
  const allKeys = new Set(byGroup.keys());
  const keysOrdered = orderedTagGroupKeysFromState(allKeys, layers);
  const hiddenSet = new Set((layers.hidden ?? []).map((h) => String(h).trim()));

  const visibleGroups = new Map<string, NodeSingular[]>();
  const hiddenNodes: NodeSingular[] = [];
  for (const key of keysOrdered) {
    const groupNodes = [...(byGroup.get(key) ?? [])].sort((a, b) =>
      String(a.data('fullTitle') || '').localeCompare(String(b.data('fullTitle') || ''), GRAPH_SORT_LOCALE)
    );
    if (hiddenSet.has(key)) {
      hiddenNodes.push(...groupNodes);
    } else if (groupNodes.length > 0) {
      visibleGroups.set(key, groupNodes);
    }
  }

  const w = cy.width();
  const h = cy.height();
  const cx = w / 2;
  const cyy = h / 2;
  const baseR = Math.min(w, h) * 0.36;
  const rInner = baseR * 0.22;
  const rOuter = baseR;

  const pos = new Map<string, { x: number; y: number }>();

  // 每个标签组在自身权重半径上独立绕满 360°，并用稳定相位错开，避免只占一段弧。
  visibleGroups.forEach((groupNodes, tagKey) => {
    const wgt = layers.weights?.[tagKey] ?? 0.5;
    const norm = graphLayerWeightNorm(wgt);
    const r = rInner + norm * (rOuter - rInner);
    const n = groupNodes.length;
    const phase = stableAngleSeed(tagKey || '__untagged__') * 2 * Math.PI - Math.PI / 2;
    for (let i = 0; i < n; i += 1) {
      const angle = phase + (2 * Math.PI * i) / Math.max(1, n);
      const node = groupNodes[i];
      pos.set(node.id(), { x: cx + r * Math.cos(angle), y: cyy + r * Math.sin(angle) });
    }
  });
  hiddenNodes.forEach((node, i) => {
    pos.set(node.id(), { x: cx + (i - hiddenNodes.length / 2) * 10, y: cyy });
  });

  cy.nodes().layout({
    name: 'preset',
    animate: true,
    transform: (node) => pos.get(node.id()) ?? { x: cx, y: cyy }
  }).run();

  requestAnimationFrame(() => {
    cy.resize();
    cy.fit(undefined, 48);
  });
}

/** 与 `BoardView` 画布滚轮缩放同一系数：增量与 deltaY 线性相关 */
export const GRAPH_WHEEL_ZOOM_SENSITIVITY = 0.001;

type RendererWithProject = {
  projectIntoViewport: (clientX: number, clientY: number) => number[];
};

function getCyRenderer(cy: Core): RendererWithProject | null {
  const r = (cy as unknown as { renderer?: () => RendererWithProject }).renderer?.();
  return r && typeof r.projectIntoViewport === 'function' ? r : null;
}

/**
 * 与看板一致：滚轮增量线性叠加在 zoom 上，并以指针下点为锚；双指捏合仍走 Cytoscape 内置逻辑。
 * 需在 `wheelSensitivity: 0` 下使用，避免与内置滚轮叠加。
 */
export function attachBoardlikeWheelZoom(cy: Core): () => void {
  const container = cy.container();
  if (!container) return () => {};

  const handler = (e: WheelEvent) => {
    if (!container.contains(e.target as Node)) return;

    e.preventDefault();

    const scrollDelta = e.shiftKey
      ? Math.abs(e.deltaX) > Math.abs(e.deltaY)
        ? e.deltaX
        : e.deltaY
      : e.deltaY;

    if (scrollDelta === 0) return;

    const delta = -scrollDelta * GRAPH_WHEEL_ZOOM_SENSITIVITY;
    const z = cy.zoom();
    const minZ = cy.minZoom();
    const maxZ = cy.maxZoom();
    const newZoom = Math.min(Math.max(minZ, z + delta), maxZ);
    if (Math.abs(newZoom - z) < 1e-9) return;

    const r = getCyRenderer(cy);
    if (!r) return;

    const pos = r.projectIntoViewport(e.clientX, e.clientY);
    const pan = cy.pan();
    const rz = cy.zoom();
    const rx = pos[0] * rz + pan.x;
    const ry = pos[1] * rz + pan.y;

    cy.zoom({ level: newZoom, renderedPosition: { x: rx, y: ry } });
  };

  let attached = false;
  const attach = () => {
    if (attached) return;
    attached = true;
    container.addEventListener('wheel', handler, { passive: false });
  };

  cy.ready(attach);

  return () => {
    if (attached) {
      container.removeEventListener('wheel', handler);
      attached = false;
    }
  };
}

export function decodeGraphPayloadFromBase64(b64: string): GraphExportPayload {
  const json = decodeURIComponent(escape(atob(b64)));
  return JSON.parse(json) as GraphExportPayload;
}

export function attachGraphResizeObserver(cy: Core, el: HTMLElement): () => void {
  const ro = new ResizeObserver(() => {
    requestAnimationFrame(() => cy.resize());
  });
  ro.observe(el);
  return () => ro.disconnect();
}

export function scheduleGraphResizeAndFit(cy: Core): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      cy.resize();
      cy.fit(undefined, 40);
    });
  });
}

/** 将视图平移到以指定节点为中心，不改变缩放（避免 fit 单点导致过度放大） */
export function animateGraphCenterOnNode(cy: Core, nodeId: string): void {
  const el = cy.getElementById(nodeId);
  if (el.empty() || !el.isNode()) return;
  cy.animate({
    center: { eles: el },
    duration: 220,
    easing: 'ease-out-cubic'
  });
}

export function runGraphCoseLayout(cy: Core): void {
  cy.layout({ name: 'cose-bilkent', animate: true, padding: 40 } as any).run();
}

/**
 * 圆环布局。
 * 传入合并后的 `graphLayers` 时：按标签组权重分配半径（越大离圆心越远），不再接 cose（避免破坏环形）。
 * 未传时：使用 cytoscape 内置圆环，并可选用短时 cose-bilkent 微调。
 */
export function applyGraphCircleLayout(
  cy: Core,
  refineWithForce = true,
  layers: GraphLayerState | null = null
): void {
  if (layers != null) {
    applyGraphWeightedCircleLayout(cy, layers);
    return;
  }
  const circleLayout = cy.layout({ name: 'circle', animate: true, padding: 40 } as any);
  if (!refineWithForce) {
    circleLayout.run();
    return;
  }
  circleLayout.one('layoutstop', () => {
    cy.layout({
      name: 'cose-bilkent',
      randomize: false,
      animate: true,
      padding: 40,
      fit: true,
      quality: 'draft',
      numIter: 600,
      nodeDimensionsIncludeLabels: true
    } as any).run();
  });
  circleLayout.run();
}

export function applyGraphLayout(
  cy: Core,
  name: 'cose-bilkent' | 'circle',
  circleRefineWithForce = true,
  graphLayers: GraphLayerState | null = null
): void {
  if (name === 'circle') {
    applyGraphCircleLayout(cy, circleRefineWithForce, graphLayers);
    return;
  }
  cy.layout({
    name,
    animate: true,
    padding: 40
  } as any).run();
}

/**
 * 按标签分组（与节点主色一致：取便签第一个标签；无标签单独一组），组内按完整标题拼音/笔画排序。
 * `layers` 为合并后的图层面板状态：控制组顺序、隐藏组缩在底部条带。
 */
export function applyGraphTagGridLayout(cy: Core, layers: GraphLayerState | null = null): void {
  const nodes = cy.nodes();
  if (nodes.length === 0) return;

  const w = cy.width();
  const margin = 56;
  const gapX = 20;
  const gapY = 26;
  const cellW = 128;
  const cellH = 70;
  const groupGapY = 40;

  const byGroup = new Map<string, NodeSingular[]>();
  nodes.forEach((n) => {
    const key = String(n.data('tagGroup') ?? '').trim();
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key)!.push(n);
  });

  const allKeys = new Set(byGroup.keys());
  const hiddenSet = new Set((layers?.hidden ?? []).map((h) => String(h).trim()));
  const keys = layers
    ? orderedTagGroupKeysFromState(allKeys, layers)
    : [...allKeys].sort((a, b) => {
        if (a === '' && b !== '') return 1;
        if (b === '' && a !== '') return -1;
        return a.localeCompare(b, GRAPH_SORT_LOCALE);
      });

  const usableW = Math.max(80, w - 2 * margin);
  const cols = Math.max(1, Math.floor(usableW / (cellW + gapX)));

  let yTop = margin;
  const pos = new Map<string, { x: number; y: number }>();

  for (const key of keys) {
    const groupNodes = byGroup.get(key)!;
    groupNodes.sort((a, b) =>
      String(a.data('fullTitle') || '').localeCompare(String(b.data('fullTitle') || ''), GRAPH_SORT_LOCALE)
    );
    if (hiddenSet.has(key)) {
      groupNodes.forEach((node, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = margin + col * (cellW + gapX) + cellW / 2;
        const y = Math.max(margin + cellH / 2, cy.height() - margin - row * (cellH + gapY) - cellH / 2);
        pos.set(node.id(), { x, y });
      });
      continue;
    }
    const rows = Math.ceil(groupNodes.length / cols);
    groupNodes.forEach((node, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const x = margin + col * (cellW + gapX) + cellW / 2;
      const y = yTop + row * (cellH + gapY) + cellH / 2;
      pos.set(node.id(), { x, y });
    });
    yTop += rows * (cellH + gapY) + groupGapY;
  }

  cy.nodes().layout({
    name: 'preset',
    animate: true,
    transform: (node) => pos.get(node.id()) ?? { x: w / 2, y: cy.height() / 2 }
  }).run();

  requestAnimationFrame(() => {
    cy.resize();
    cy.fit(undefined, 48);
  });
}

/** 图谱二级布局（与底部四个按钮一致），用于恢复上次选择 */
export type GraphLayoutMode = 'tagGrid' | 'circle' | 'time' | 'cose';

export const DEFAULT_GRAPH_LAYOUT_MODE: GraphLayoutMode = 'tagGrid';

/** 合并便签中出现的标签组与已存顺序/隐藏；供时间线纵轴与导出一致 */
export function mergeGraphLayerState(notes: Note[], saved?: GraphLayerState | null): GraphLayerState {
  const allKeys = new Set<string>();
  for (const n of notes) {
    allKeys.add(String(n.tags?.[0]?.label?.trim() ?? ''));
  }
  const prevOrder = saved?.order ?? [];
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const k of prevOrder) {
    const key = String(k).trim();
    if (allKeys.has(key) && !seen.has(key)) {
      ordered.push(key);
      seen.add(key);
    }
  }
  const rest = [...allKeys]
    .filter((k) => !seen.has(k))
    .sort((a, b) => {
      if (a === '' && b !== '') return 1;
      if (b === '' && a !== '') return -1;
      return a.localeCompare(b, GRAPH_SORT_LOCALE);
    });
  const hidden = (saved?.hidden ?? []).filter((h) => allKeys.has(String(h).trim())).map((h) => String(h).trim());
  const prevW = saved?.weights ?? {};
  const weights: Record<string, number> = {};
  for (const k of allKeys) {
    const v = prevW[k];
    weights[k] =
      typeof v === 'number' && Number.isFinite(v) ? clampGraphLayerWeight(v) : clampGraphLayerWeight(0.5);
  }
  return {
    order: [...ordered, ...rest],
    hidden,
    weights
  };
}

/** 时间线 preset：横轴年份；纵轴可选受图层面板权重与 bias 牵引 */
export interface GraphTimeLayoutOptions {
  weightBias?: number;
}

/**
 * 按模式应用布局。`silentTimeFallback`：恢复缓存为时间线但无年份数据时，静默退回标签分组网格（不弹窗）。
 */
export function applyGraphLayoutMode(
  cy: Core,
  mode: GraphLayoutMode,
  options?: {
    silentTimeFallback?: boolean;
    timeLayout?: GraphTimeLayoutOptions;
    /** 圆环后是否力导向微调；未传时按开启处理 */
    circleRefineWithForce?: boolean;
    /** 合并后的标签图层状态；有则环形/标签网格尊重顺序、隐藏与半径权重 */
    graphLayers?: GraphLayerState | null;
  }
): void {
  const silent = options?.silentTimeFallback ?? false;
  const circleRefine = options?.circleRefineWithForce !== false;
  const gl = options?.graphLayers ?? null;
  if (mode === 'tagGrid') {
    applyGraphTagGridLayout(cy, gl);
    return;
  }
  if (mode === 'circle') {
    applyGraphCircleLayout(cy, circleRefine, gl);
    return;
  }
  if (mode === 'cose') {
    applyGraphLayout(cy, 'cose-bilkent');
    return;
  }
  const valid = cy.nodes().filter((n) => n.data('timeSort') != null);
  if (valid.length === 0) {
    if (silent) {
      applyGraphTagGridLayout(cy, gl);
    } else {
      applyGraphTimeLayout(cy, undefined, options?.timeLayout, gl);
    }
    return;
  }
  applyGraphTimeLayout(cy, undefined, options?.timeLayout, gl);
}

export function applyGraphTimeLayout(
  cy: Core,
  alertFn?: (message: string) => void,
  layoutOpts?: GraphTimeLayoutOptions,
  graphLayers?: GraphLayerState | null
): void {
  const fn = alertFn ?? ((m: string) => window.alert(m));
  const valid = cy.nodes().filter((n) => n.data('timeSort') != null);
  if (valid.length === 0) {
    fn('请先在便签中设置开始年份，再使用时间线排布。');
    return;
  }
  const biasRaw = layoutOpts?.weightBias ?? 0;
  const bias = Math.max(0, Math.min(1, Number.isFinite(biasRaw) ? biasRaw : 0));
  const times = valid.map((n) => Number(n.data('timeSort')));
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const range = maxT - minT || 1;
  const w = cy.width();
  const h = cy.height();
  const bandT = 80;
  const bandB = Math.max(bandT + 40, h - 80);
  const bandH = bandB - bandT;

  const tagKeysFromNodes = new Set<string>();
  valid.forEach((node) => {
    const tagKey = String(node.data('tagGroup') ?? '').trim();
    tagKeysFromNodes.add(tagKey);
  });
  const allKeys = tagKeysFromNodes;
  const hiddenSet = new Set((graphLayers?.hidden ?? []).map((h) => String(h).trim()));
  const keysOrdered = graphLayers
    ? orderedTagGroupKeysFromState(allKeys, graphLayers)
    : [...allKeys].sort((a, b) => {
        if (a === '' && b !== '') return 1;
        if (b === '' && a !== '') return -1;
        return a.localeCompare(b, GRAPH_SORT_LOCALE);
      });
  const keysVisible = keysOrdered.filter((k) => !hiddenSet.has(k));
  const keysForY = keysVisible.length > 0 ? keysVisible : keysOrdered;
  const idxByKey = new Map<string, number>();
  keysForY.forEach((k, i) => idxByKey.set(k, i));
  const denom = Math.max(1, keysForY.length - 1);

  cy.nodes()
    .layout({
      name: 'preset',
      animate: true,
      transform: (node) => {
        const t = node.data('timeSort');
        if (t == null) return { x: w / 2, y: h / 2 };
        const x = 80 + ((Number(t) - minT) / range) * (w - 160);
        const tagKey = String(node.data('tagGroup') ?? '').trim();
        const idx = idxByKey.get(tagKey) ?? 0;
        const norm = keysForY.length <= 1 ? 0 : idx / denom;
        // order 控制：越靠前的 tagKey 越靠上
        const yTarget = bandT + norm * bandH;
        const maxJitter = bandH * 0.48 * (1 - bias);
        const yRaw = yTarget + (Math.random() - 0.5) * 2 * maxJitter;
        const y = Math.max(bandT, Math.min(bandB, yRaw));
        return { x, y };
      }
    })
    .run();
}

export function patchGraphElementsData(cy: Core, elements: ElementDefinition[]): void {
  cy.batch(() => {
    elements.forEach((item) => {
      const id = item.data?.id as string | undefined;
      if (!id) return;
      const col = cy.getElementById(id);
      if (col.length > 0) col.data(item.data);
    });
  });
}

export function updateGraphStylesheet(cy: Core, stylesheet: Stylesheet): void {
  cy.style().fromJson(stylesheet as Parameters<Core['style']>[0]).update();
}

const HL = ['focus-core', 'focus-nh', 'focus-e'] as const;

export const GRAPH_HOVER_CLASS = 'focus-hover';

/** 点击节点：高亮自身、相邻节点及之间的连线（与 App 内 GraphView 一致） */
export function applyGraphNeighborHighlight(
  cy: Core,
  centerId: string | null,
  /** 关系链长度：通过连线连续扩展的层级数（1=当前实现） */
  chainLength: number = 1
): void {
  cy.batch(() => {
    cy.elements().removeClass([...HL]);
    if (!centerId) return;
    const el = cy.getElementById(centerId);
    if (el.empty() || !el.isNode()) return;

    const depth = Math.max(1, Math.floor(Number.isFinite(chainLength) ? chainLength : 1));

    const nodeIds = new Set<string>([centerId]);
    const edgeIds = new Set<string>();

    // BFS：按“经过的边数”扩展到 depth 层（distance = number of edges from center）
    let frontier = new Set<string>([centerId]);
    for (let dist = 0; dist < depth; dist += 1) {
      const nextFrontier = new Set<string>();
      for (const nodeId of frontier) {
        const nodeEl = cy.getElementById(nodeId);
        if (nodeEl.empty() || !nodeEl.isNode()) continue;

        nodeEl.connectedEdges().forEach((edge) => {
          edgeIds.add(edge.id());
          const ns = edge.connectedNodes();
          if (ns.length !== 2) return;
          const otherId = ns[0].id() === nodeId ? ns[1].id() : ns[0].id();
          if (!nodeIds.has(otherId)) {
            nodeIds.add(otherId);
            nextFrontier.add(otherId);
          }
        });
      }
      frontier = nextFrontier;
      if (frontier.size === 0) break;
    }

    el.addClass('focus-core');
    nodeIds.forEach((id) => {
      if (id === centerId) return;
      const n = cy.getElementById(id);
      if (!n.empty() && n.isNode()) n.addClass('focus-nh');
    });
    edgeIds.forEach((id) => {
      const e = cy.getElementById(id);
      if (!e.empty() && e.isEdge()) e.addClass('focus-e');
    });
  });
}

/** 悬停节点：加框 label 置顶（由样式表 z-index 高于选中/相连） */
export function applyGraphHoverHighlight(cy: Core, hoverNodeId: string | null): void {
  cy.batch(() => {
    cy.nodes().removeClass(GRAPH_HOVER_CLASS);
    if (!hoverNodeId) return;
    const el = cy.getElementById(hoverNodeId);
    if (!el.empty() && el.isNode()) el.addClass(GRAPH_HOVER_CLASS);
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

type MarkedLike = { parse: (md: string) => string } | null;

/** 独立 HTML：悬停预览 + 点击高亮（与 GraphView 一致） */
export function wireStandaloneGraphInteractions(
  cy: Core,
  payload: GraphExportPayload,
  themeColor: string,
  marked: MarkedLike
): void {
  const previews = payload.notePreviews || {};
  const previewEl = document.getElementById('graph-note-preview');
  let previewImgIdx = 0;
  let focusedId: string | null = null;
  let hoverId: string | null = null;

  function renderPreview(): void {
    if (!previewEl) return;
    const id = hoverId || focusedId;
    if (!id) {
      previewEl.classList.add('hidden');
      previewEl.innerHTML = '';
      return;
    }
    const p = previews[id];
    if (!p) {
      previewEl.classList.add('hidden');
      previewEl.innerHTML = '';
      return;
    }
    if (previewImgIdx < 0) previewImgIdx = 0;
    const imgs = [...(p.images || [])];
    if (p.sketch) imgs.push(p.sketch);
    if (previewImgIdx >= imgs.length) previewImgIdx = 0;

    const timeRange =
      p.startYear != null
        ? p.endYear != null && p.endYear !== p.startYear
          ? `${p.startYear}–${p.endYear}`
          : String(p.startYear)
        : '';

    let detailHtml = '';
    if (p.previewDetailMd.trim()) {
      try {
        detailHtml = marked?.parse(p.previewDetailMd) ?? escapeHtml(p.previewDetailMd).replace(/\n/g, '<br/>');
      } catch {
        detailHtml = escapeHtml(p.previewDetailMd).replace(/\n/g, '<br/>');
      }
    }

    const imgSection =
      imgs.length > 0
        ? `<div class="relative aspect-[4/3] bg-gray-100 flex items-center justify-center shrink-0">
            <img src="${escapeHtml(imgs[previewImgIdx])}" class="w-full h-full object-cover" alt="" />
            ${
              imgs.length > 1
                ? `<button type="button" class="km-g-prev absolute left-2 p-1.5 bg-black/30 text-white rounded-full">‹</button>
                   <button type="button" class="km-g-next absolute right-2 p-1.5 bg-black/30 text-white rounded-full">›</button>`
                : ''
            }
          </div>`
        : '';

    previewEl.classList.remove('hidden');
    previewEl.innerHTML = `
      <div data-allow-context-menu class="fixed top-4 left-4 z-[1000] w-72 sm:w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden pointer-events-auto flex flex-col" style="max-height:calc(100vh - 2rem)">
        <div class="p-4 pb-2 flex items-start justify-between gap-3 border-b border-gray-100 shrink-0">
          <div class="flex items-start gap-3 flex-1 min-w-0">
            ${p.emoji ? `<span class="text-2xl mt-0.5 shrink-0">${escapeHtml(p.emoji)}</span>` : ''}
            <div class="min-w-0 flex-1">
              <h3 class="text-lg font-bold text-gray-900 leading-tight whitespace-pre-line break-words">${escapeHtml(p.previewTitle)}</h3>
              ${timeRange ? `<div class="mt-1 text-xs text-gray-500 font-medium truncate">${escapeHtml(timeRange)}</div>` : ''}
            </div>
          </div>
        </div>
        <div class="flex-1 overflow-y-auto text-sm">
          ${
            detailHtml
              ? `<div class="px-4 py-3 text-gray-800 leading-snug break-words border-b border-gray-50 bg-gray-50/30 mapping-preview-markdown">${detailHtml}</div>`
              : ''
          }
          ${imgSection}
        </div>
      </div>`;

    const prev = previewEl.querySelector('.km-g-prev');
    const next = previewEl.querySelector('.km-g-next');
    prev?.addEventListener('click', (e) => {
      e.stopPropagation();
      previewImgIdx = (previewImgIdx - 1 + imgs.length) % imgs.length;
      renderPreview();
    });
    next?.addEventListener('click', (e) => {
      e.stopPropagation();
      previewImgIdx = (previewImgIdx + 1) % imgs.length;
      renderPreview();
    });
  }

  cy.on('mouseover', 'node', (evt) => {
    const n = evt.target;
    hoverId = n.id();
    previewImgIdx = 0;
    applyGraphHoverHighlight(cy, hoverId);
    renderPreview();
  });
  cy.on('mouseout', 'node', () => {
    hoverId = null;
    applyGraphHoverHighlight(cy, null);
    renderPreview();
  });

  cy.on('tap', 'node', (evt) => {
    cy.elements().unselect();
    const n = evt.target;
    const id = n.id();
    if (focusedId === id) {
      focusedId = null;
      applyGraphNeighborHighlight(cy, null);
    } else {
      focusedId = id;
      applyGraphNeighborHighlight(cy, id);
    }
    previewImgIdx = 0;
    applyGraphHoverHighlight(cy, hoverId);
    renderPreview();
  });

  cy.on('tap', 'edge', () => {
    cy.elements().unselect();
    focusedId = null;
    applyGraphNeighborHighlight(cy, null);
    renderPreview();
  });

  cy.on('tap', (evt) => {
    if (evt.target === cy) {
      cy.elements().unselect();
      focusedId = null;
      applyGraphNeighborHighlight(cy, null);
      renderPreview();
    }
  });
}

export function downloadGraphPayloadJson(payload: GraphExportPayload, safeName: string): void {
  const text = JSON.stringify(payload, null, 2);
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${safeName}-graph-data.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function copyGraphPayloadJson(
  payload: GraphExportPayload,
  safeName: string,
  alertFn: (message: string) => void = (m) => window.alert(m)
): void {
  const text = JSON.stringify(payload, null, 2);
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(
      () => alertFn('已复制到剪贴板'),
      () => downloadGraphPayloadJson(payload, safeName)
    );
  } else {
    downloadGraphPayloadJson(payload, safeName);
  }
}

/** 独立 HTML：绑定固定 id 的按钮（与 graphExportHtml 中 DOM 一致） */
export function wireStandaloneGraphControls(
  cy: Core,
  payload: GraphExportPayload,
  safeName: string
): void {
  const dl = document.getElementById('btnDlJson');
  const cp = document.getElementById('btnCopyJson');
  if (dl) {
    dl.onclick = (e) => {
      e.stopPropagation();
      downloadGraphPayloadJson(payload, safeName);
    };
  }
  if (cp) {
    cp.onclick = (e) => {
      e.stopPropagation();
      copyGraphPayloadJson(payload, safeName);
    };
  }

  const tagGrid = document.getElementById('btnTagGrid');
  const circle = document.getElementById('btnCircle');
  const time = document.getElementById('btnTime');
  const cose = document.getElementById('btnCose');
  if (tagGrid) tagGrid.onclick = () => applyGraphTagGridLayout(cy);
  if (circle) circle.onclick = () => applyGraphLayout(cy, 'circle');
  if (time) time.onclick = () => applyGraphTimeLayout(cy);
  if (cose) cose.onclick = () => applyGraphLayout(cy, 'cose-bilkent');
}

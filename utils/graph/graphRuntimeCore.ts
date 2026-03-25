import cytoscape, { type Core, type ElementDefinition, type NodeSingular } from 'cytoscape';
import {
  DEFAULT_MAP_UI_CHROME_BLUR_PX,
  DEFAULT_MAP_UI_CHROME_OPACITY,
  mapChromeHaloFillAndBorder
} from '../map/mapChromeStyle';
import type { GraphExportPayload } from './graphData';
import type { Frame, GraphLayerState, Note } from '../../types';
// Cytoscape 的 style stylesheet 类型导出在当前工具链下不稳定，这里用宽类型避免无关的类型检查阻塞。
type Stylesheet = any;

const GRAPH_SORT_LOCALE = 'zh-Hans-CN';

/** 便签无首个标签时，在图谱与图层面板中的分组键（与 buildGraphElements 一致） */
export const GRAPH_UNTAGGED_TAG_GROUP = '无标签';

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

export type GraphLayerGroupStandard = 'tag' | 'frame';

function getGraphLayerCandidateKeys(n: NodeSingular, standard: GraphLayerGroupStandard): string[] {
  if (standard === 'tag') {
    const k = n.data('tagGroup');
    return [String(k ?? '').trim()];
  }

  const raw = n.data('frameGroups') as unknown;
  const arr =
    Array.isArray(raw)
      ? raw
      : // 兼容旧导出/历史数据：仅有首帧归属字段
        [n.data('frameGroup')];
  return arr.map((x) => String(x ?? '').trim()).filter((x) => x !== '');
}

function getGraphLayerEffectiveGroupKey(
  n: NodeSingular,
  standard: GraphLayerGroupStandard,
  hiddenSet: Set<string>
): string {
  if (standard === 'tag') {
    // tagGroup 本身就是单一归属；不需要跳过 hidden（hidden 决定显示/隐藏）
    const k = n.data('tagGroup');
    return String(k ?? '').trim();
  }

  const candidates = getGraphLayerCandidateKeys(n, standard);
  // 没有帧候选：归属空组（后续由 hidden 控制显示/隐藏）
  if (candidates.length === 0) return '';

  // 逐个跳过已隐藏的帧：取第一个“未隐藏”的归属帧
  for (const id of candidates) {
    if (!hiddenSet.has(id)) return id;
  }

  // 全部被隐藏：退回第一个候选（最终会被隐藏）
  return candidates[0];
}

/** 按 graphLayers.hidden 控制节点显示（与分组标准一致：tagGroup / frameGroup） */
export function applyGraphLayerNodeVisibility(
  cy: Core,
  hidden: string[],
  standard: GraphLayerGroupStandard = 'tag'
): void {
  const hiddenSet = new Set(hidden.map((h) => String(h).trim()));
  cy.batch(() => {
    cy.nodes().forEach((node) => {
      const g = getGraphLayerEffectiveGroupKey(node, standard, hiddenSet);
      node.style('display', hiddenSet.has(g) ? 'none' : 'element');
    });
  });
}

function applyGraphWeightedCircleLayout(
  cy: Core,
  layers: GraphLayerState,
  standard: GraphLayerGroupStandard
): void {
  const nodes = cy.nodes();
  if (nodes.length === 0) return;

  const hiddenSet = new Set((layers.hidden ?? []).map((h) => String(h).trim()));

  const byGroup = new Map<string, NodeSingular[]>();
  nodes.forEach((n) => {
    const key = getGraphLayerEffectiveGroupKey(n, standard, hiddenSet);
    if (standard === 'tag' && key === '') return; // 无标签节点：不参与圆环分组/布局
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key)!.push(n);
  });
  const allKeys = new Set(byGroup.keys());
  const keysOrdered = orderedTagGroupKeysFromState(allKeys, layers);

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
  layers: GraphLayerState | null = null,
  standard: GraphLayerGroupStandard = 'tag'
): void {
  if (layers != null) {
    applyGraphWeightedCircleLayout(cy, layers, standard);
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
  graphLayers: GraphLayerState | null = null,
  standard: GraphLayerGroupStandard = 'tag'
): void {
  if (name === 'circle') {
    applyGraphCircleLayout(cy, circleRefineWithForce, graphLayers, standard);
    return;
  }
  cy.layout({
    name,
    animate: true,
    padding: 40
  } as any).run();
}

/**
 * 按标签分组（与节点主色一致：取便签第一个标签；无标签不参与布局），组内按完整标题拼音/笔画排序。
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
    if (key === '') return; // 无标签节点：不参与标签网格布局
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
export type GraphLayoutMode = 'tagGrid' | 'circle' | 'time' | 'cose' | 'frameCluster';

export const DEFAULT_GRAPH_LAYOUT_MODE: GraphLayoutMode = 'tagGrid';

/** 合并便签中出现的分组与已存顺序/隐藏；供时间线纵轴与导出一致 */
export function mergeGraphLayerState(
  notes: Note[],
  saved?: GraphLayerState | null,
  standard: GraphLayerGroupStandard = 'tag'
): GraphLayerState {
  const allKeys = new Set<string>();
  for (const n of notes) {
    if (standard === 'tag') {
      const k = String(n.tags?.[0]?.label?.trim() ?? '');
      allKeys.add(k === '' ? GRAPH_UNTAGGED_TAG_GROUP : k);
      continue;
    }

    // frame 标准：收集便签所属的所有 frames（用于保证面板展示所有可选分组）
    const candidates =
      n.groupIds?.length
        ? n.groupIds
        : n.groupId
          ? [n.groupId]
          : n.groupNames?.length
            ? n.groupNames
            : n.groupName
              ? [n.groupName]
              : [];

    const cleaned = candidates.map((x) => String(x).trim()).filter((x) => x !== '');
    if (cleaned.length === 0) {
      allKeys.add(''); // 无帧归属（可在面板中显隐/加权）
      continue;
    }
    cleaned.forEach((k) => allKeys.add(k));
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
    /**
     * 分层标准：用于圆环/时间轴的分组依据。
     * `tag` => tagGroup；`frame` => frameGroup
     */
    graphLayerGroupStandard?: GraphLayerGroupStandard;
    /**
     * 合并后的分层面板状态：有则环形/时间轴尊重顺序、隐藏与半径权重
     */
    graphLayers?: GraphLayerState | null;
    /**
     * tagGrid 的分层状态；用于 silentTimeFallback 的回退。
     * 若未提供，则回退到 graphLayers。
     */
    tagGridGraphLayers?: GraphLayerState | null;
    frames?: Frame[];
    chromeSurface?: { opacity: number; blurPx: number };
  }
): void {
  const silent = options?.silentTimeFallback ?? false;
  const circleRefine = options?.circleRefineWithForce !== false;
  const gl = options?.graphLayers ?? null;
  const tagGridGl = options?.tagGridGraphLayers ?? gl;
  const groupStandard = options?.graphLayerGroupStandard ?? 'tag';
  if (mode === 'tagGrid') {
    applyGraphTagGridLayout(cy, tagGridGl);
    return;
  }
  if (mode === 'circle') {
    applyGraphCircleLayout(cy, circleRefine, gl, groupStandard);
    return;
  }
  if (mode === 'cose') {
    applyGraphLayout(cy, 'cose-bilkent');
    return;
  }
  if (mode === 'frameCluster') {
    applyGraphFrameClusterMembersLayout(
      cy,
      gl,
      options?.frames ?? [],
      options?.tagGridGraphLayers ?? null,
      options?.chromeSurface ?? null
    );
    return;
  }
  const valid = cy.nodes().filter((n) => n.data('timeSort') != null);
  if (valid.length === 0) {
    if (silent) {
      applyGraphTagGridLayout(cy, tagGridGl);
    } else {
      applyGraphTimeLayout(cy, undefined, options?.timeLayout, gl, groupStandard);
    }
    return;
  }
  applyGraphTimeLayout(cy, undefined, options?.timeLayout, gl, groupStandard);
}

export function applyGraphTimeLayout(
  cy: Core,
  alertFn?: (message: string) => void,
  layoutOpts?: GraphTimeLayoutOptions,
  graphLayers?: GraphLayerState | null,
  standard: GraphLayerGroupStandard = 'tag'
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

  const hiddenSet = new Set((graphLayers?.hidden ?? []).map((h) => String(h).trim()));
  const groupKeysFromNodes = new Set<string>();
  valid.forEach((node) => {
    const groupKey = getGraphLayerEffectiveGroupKey(node, standard, hiddenSet);
    if (standard === 'tag' && groupKey === '') return; // 无标签不参与时间线纵轴
    groupKeysFromNodes.add(groupKey);
  });
  const allKeys = groupKeysFromNodes;
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

  // 小斥力：在 preset 布局动画完成后，做一次近邻碰撞的轻推，避免点重叠。
  const applySmallRepulsion = (): void => {
    // 仅处理可见的纵轴分组节点，避免把 tagGroup 为空的“隐藏节点”也挤开。
    const repulseNodes =
      standard === 'tag'
        ? cy.nodes().filter((n) => String(n.data('tagGroup') ?? '').trim() !== '')
        : cy.nodes();
    if (repulseNodes.length < 2) return;

    const nodesArr = repulseNodes.toArray();
    const baseSizeFallback = 28;
    let baseSize = baseSizeFallback;
    repulseNodes.forEach((n) => {
      baseSize = Math.max(baseSize, Math.max(n.outerWidth(), n.outerHeight()));
    });

    const minDist = Math.max(10, baseSize * 0.92);
    const minDist2 = minDist * minDist;

    // x 推开权重小，尽量沿 y 维度“分层”以贴合时间视图直觉。
    const xScale = 0.18;
    const yScale = 1.0;
    const iterations = 3;
    const step = 0.42 * (0.2 + 0.8 * (1 - bias)); // bias 越弱(抖动越大)推开越多一点

    const wLocal = cy.width();
    const hLocal = cy.height();

    // 用数组快照避免在迭代时读写 cytoscape 位置带来的抖动/性能问题。
    const pos = nodesArr.map((n) => ({ x: n.position('x'), y: n.position('y') }));

    for (let iter = 0; iter < iterations; iter += 1) {
      for (let i = 0; i < nodesArr.length; i += 1) {
        for (let j = i + 1; j < nodesArr.length; j += 1) {
          const dx = pos[j].x - pos[i].x;
          const dy = pos[j].y - pos[i].y;

          // 过滤：x 距离过远的碰撞基本不需要处理
          if (Math.abs(dx) > minDist * 1.1) continue;

          const dist2 = dx * dx + dy * dy;
          if (dist2 <= 1e-9 || dist2 >= minDist2) continue;
          const dist = Math.sqrt(dist2);

          // overlap 比例越大推开越多
          const overlap = (minDist - dist) / dist;
          const push = overlap * step;

          const pushX = dx * push * xScale;
          const pushY = dy * push * yScale;

          pos[i].x -= pushX;
          pos[i].y -= pushY;
          pos[j].x += pushX;
          pos[j].y += pushY;
        }
      }
    }

    cy.batch(() => {
      nodesArr.forEach((n, idx) => {
        const p = pos[idx];
        n.position({
          x: Math.max(0, Math.min(wLocal, p.x)),
          y: Math.max(0, Math.min(hLocal, p.y))
        });
      });
    });
  };

  const presetLayout = cy.nodes().layout({
    name: 'preset',
    animate: true,
    transform: (node) => {
      const t = node.data('timeSort');
      if (t == null) return { x: w / 2, y: h / 2 };
      const x = 80 + ((Number(t) - minT) / range) * (w - 160);
        const groupKey = getGraphLayerEffectiveGroupKey(node, standard, hiddenSet);
      const idx = idxByKey.get(groupKey) ?? 0;
      const norm = keysForY.length <= 1 ? 0 : idx / denom;
      // order 控制：越靠前的 groupKey 越靠上
      const yTarget = bandT + norm * bandH;
      const maxJitter = bandH * 0.48 * (1 - bias);
      const yRaw = yTarget + (Math.random() - 0.5) * 2 * maxJitter;
      // 不对 y 进行 bandT/bandB 裁剪：避免边界处抖动被“卡住”，导致同一 group
      // 的节点在边界上出现更明显的重叠/堆叠。
      const y = yRaw;
      return { x, y };
    }
  });

  presetLayout.one('layoutstop', () => {
    applySmallRepulsion();
    requestAnimationFrame(() => cy.resize());
  });

  presetLayout.run();
}

/**
 * frameCluster（cluster+members）：
 * 1) 按当前 `frame` hidden 规则计算每个节点的 effective frame key（跳过已隐藏的前序 frame）
 * 2) 构建“簇图”（簇为节点、跨簇边为边），用 cose-bilkent 布局得到簇中心（簇更近）
 * 3) 簇内：参考圆环布局，用标签分层顺序与权重做多环半径；无 tag 面板数据时退化为单环。
 * 4) 每簇增加略大于最外圈的玻璃感圆形底衬。
 */
const FRAME_CLUSTER_TAG_RING_DEPTH = 0.26;

export function applyGraphFrameClusterMembersLayout(
  cy: Core,
  graphFrameLayers: GraphLayerState | null = null,
  frames: Frame[] = [],
  tagGraphLayers: GraphLayerState | null = null,
  chromeSurface: { opacity: number; blurPx: number } | null = null
): void {
  const layers: GraphLayerState = graphFrameLayers ?? { order: [], hidden: [], weights: {} };

  const framesById = new Map(frames.map((f) => [String(f.id).trim(), f.title]));

  cy.batch(() => {
    cy.nodes('.frame-cluster-label').remove();
    cy.nodes('.frame-cluster-halo').remove();
  });

  const nodes = cy.nodes();
  if (nodes.length === 0) return;

  const w = cy.width();
  const h = cy.height();
  const cxMain = w / 2;
  const cyMain = h / 2;

  const hiddenSet = new Set((layers.hidden ?? []).map((x) => String(x).trim()));

  // 1) 节点 -> effective frame key（frame rule：跳过 hidden 的前序 frame）
  const effectiveKeyByNodeId = new Map<string, string>();
  const membersByClusterKey = new Map<string, NodeSingular[]>();

  nodes.forEach((n) => {
    const key = getGraphLayerEffectiveGroupKey(n, 'frame', hiddenSet);
    effectiveKeyByNodeId.set(n.id(), key);
    if (!membersByClusterKey.has(key)) membersByClusterKey.set(key, []);
    membersByClusterKey.get(key)!.push(n);
  });

  const allClusterKeys = new Set(membersByClusterKey.keys());
  const keysOrdered = orderedTagGroupKeysFromState(allClusterKeys, layers);
  const visibleKeys = keysOrdered.filter((k) => !hiddenSet.has(k));
  const keysForLayout = visibleKeys.length > 0 ? visibleKeys : keysOrdered;
  if (keysForLayout.length === 0) return;

  // Cytoscape 内部 id 需非空；对空串单独映射
  const keyToClusterId = new Map<string, string>();
  keysForLayout.forEach((k) => {
    const id = k === '' ? '__empty_frame__' : `frame__${k}`;
    keyToClusterId.set(k, id);
  });

  // 2) 构建“簇图”边：按簇对聚合跨簇边权重（sum），再用重复边近似权重拉近
  const pairWeight = new Map<string, number>();
  cy.edges().forEach((e) => {
    const sNode = e.source();
    const tNode = e.target();
    if (sNode.empty() || tNode.empty()) return;
    const sKey = effectiveKeyByNodeId.get(sNode.id()) ?? '';
    const tKey = effectiveKeyByNodeId.get(tNode.id()) ?? '';
    if (sKey === tKey) return; // 同簇不参与“簇间拉近”
    if (!keyToClusterId.has(sKey) || !keyToClusterId.has(tKey)) return;

    const baseW = Number(e.data('edgeWeight') ?? 0.3);
    const wgt = Number.isFinite(baseW) ? baseW : 0.3;

    // 无向聚合：只管“簇-簇”距离
    const a = sKey;
    const b = tKey;
    const pair = a < b ? `${a}||${b}` : `${b}||${a}`;
    pairWeight.set(pair, (pairWeight.get(pair) ?? 0) + wgt);
  });

  // 2.1) 准备临时 clusterCy
  const temp = document.createElement('div');
  temp.style.position = 'absolute';
  temp.style.left = '-99999px';
  temp.style.top = '-99999px';
  temp.style.width = `${Math.max(320, w)}px`;
  temp.style.height = `${Math.max(220, h)}px`;
  document.body.appendChild(temp);

  try {
    const clusterNodes = keysForLayout.map((k) => ({
      data: {
        id: keyToClusterId.get(k)!,
        label: k === '' ? '无帧' : k
      }
    }));

    const clusterEdges: Array<{ data: { id: string; source: string; target: string } }> = [];
    // 将簇对边权重映射到“重复边数”
    for (const [pairKey, sumW] of pairWeight.entries()) {
      const rep = Math.max(1, Math.min(6, Math.round(sumW / 0.35)));
      const [a, b] = pairKey.split('||');
      const aId = keyToClusterId.get(a) ?? '';
      const bId = keyToClusterId.get(b) ?? '';
      if (!aId || !bId) continue;
      for (let i = 0; i < rep; i += 1) {
        clusterEdges.push({
          data: {
            id: `ce-${pairKey}-${i}`,
            source: aId,
            target: bId
          }
        });
      }
    }

    const clusterCy = cytoscape({
      container: temp,
      elements: { nodes: clusterNodes, edges: clusterEdges },
      style: [
        {
          selector: 'node',
          style: { width: 8, height: 8, 'background-color': '#000', label: 'data(label)', 'font-size': 1, opacity: 0 }
        },
        {
          selector: 'edge',
          style: { width: 1, 'line-color': '#999', 'target-arrow-shape': 'none', 'curve-style': 'bezier', opacity: 0.001 }
        }
      ],
      minZoom: 0.1,
      maxZoom: 1
    });

    // keysForLayout === 1 时，cose 布局多余；直接放中心
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const posByKey = new Map<string, { x: number; y: number }>();

    if (keysForLayout.length > 1) {
      clusterCy.layout({
        name: 'cose-bilkent',
        animate: false,
        randomize: false,
        padding: 40,
        quality: 'draft',
        numIter: 500
      } as any).run();
    } else {
      const onlyKey = keysForLayout[0];
      posByKey.set(onlyKey, { x: 0, y: 0 });
    }

    // 采样位置范围（用于映射到主画布）
    keysForLayout.forEach((k) => {
      if (!keyToClusterId.has(k)) return;
      const el = clusterCy.getElementById(keyToClusterId.get(k)!);
      if (!el || el.empty()) return;
      const p = el.position();
      posByKey.set(k, { x: p.x, y: p.y });
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    });

    const mapToMain = (p: { x: number; y: number }) => {
      const dx = maxX - minX;
      const dy = maxY - minY;
      if (dx < 1e-6 || dy < 1e-6) return { x: cxMain, y: cyMain };
      const x = 80 + ((p.x - minX) / dx) * (w - 160);
      const y = 80 + ((p.y - minY) / dy) * (h - 160);
      return { x, y };
    };

    // 3) 簇中心确定后：成员围绕中心局部圆排列
  const centerPosByKey = new Map<string, { x: number; y: number }>();
  keysForLayout.forEach((k) => {
    const p = posByKey.get(k);
    centerPosByKey.set(k, p ? mapToMain(p) : { x: cxMain, y: cyMain });
  });

    const memberPos = new Map<string, { x: number; y: number }>();

    keysOrdered.forEach((clusterKey) => {
      const members = membersByClusterKey.get(clusterKey) ?? [];
      if (members.length === 0) return;

      const centerKey = keysForLayout.includes(clusterKey) ? clusterKey : keysForLayout[0];
      const center = centerPosByKey.get(centerKey) ?? { x: cxMain, y: cyMain };

      if (!keysForLayout.includes(clusterKey) || hiddenSet.has(clusterKey)) {
        // hidden 或不在 layout keys：放到底部条带（类似 circle/tagGrid 的“隐藏区”）
        const startY = Math.max(120, h - 90);
        members.forEach((m, i) => {
          const y = startY + i * 14;
          memberPos.set(m.id(), { x: cxMain + (i - members.length / 2) * 10, y });
        });
        return;
      }

      const sorted = [...members].sort((a, b) =>
        String(a.data('fullTitle') || '').localeCompare(String(b.data('fullTitle') || ''), GRAPH_SORT_LOCALE)
      );
      const n = sorted.length;
      const wgt = layers.weights?.[clusterKey] ?? 0.5;
      const frameNorm = graphLayerWeightNorm(wgt);
      const outerR = (24 + Math.min(160, n * 9)) * (0.62 + frameNorm * 0.7);

      if (n === 1) {
        memberPos.set(sorted[0].id(), { x: center.x, y: center.y });
        return;
      }

      const useTagRings = tagGraphLayers != null;
      if (!useTagRings) {
        const phase = stableAngleSeed(`frameCluster::${clusterKey}`) * 2 * Math.PI - Math.PI / 2;
        for (let i = 0; i < n; i += 1) {
          const angle = phase + (2 * Math.PI * i) / Math.max(1, n);
          memberPos.set(sorted[i].id(), {
            x: center.x + outerR * Math.cos(angle),
            y: center.y + outerR * Math.sin(angle)
          });
        }
        return;
      }

      const tagLayersState = tagGraphLayers!;
      const byTag = new Map<string, NodeSingular[]>();
      for (const m of sorted) {
        const tk = String(m.data('tagGroup') ?? '').trim() || GRAPH_UNTAGGED_TAG_GROUP;
        if (!byTag.has(tk)) byTag.set(tk, []);
        byTag.get(tk)!.push(m);
      }
      const allTagKeys = new Set(byTag.keys());
      const tagKeysOrdered = orderedTagGroupKeysFromState(allTagKeys, tagLayersState);
      const innerR = outerR * (1 - FRAME_CLUSTER_TAG_RING_DEPTH);

      for (const tagKey of tagKeysOrdered) {
        const groupNodes = byTag.get(tagKey);
        if (!groupNodes?.length) continue;
        const tw = tagLayersState.weights?.[tagKey] ?? 0.5;
        const tNorm = graphLayerWeightNorm(tw);
        const r = innerR + tNorm * (outerR - innerR);
        const phase = stableAngleSeed(`frameCluster::${clusterKey}::${tagKey}`) * 2 * Math.PI - Math.PI / 2;
        const gn = groupNodes.length;
        for (let i = 0; i < gn; i += 1) {
          const angle = phase + (2 * Math.PI * i) / Math.max(1, gn);
          memberPos.set(groupNodes[i].id(), {
            x: center.x + r * Math.cos(angle),
            y: center.y + r * Math.sin(angle)
          });
        }
      }
    });

    const haloRByCluster = new Map<string, number>();
    keysForLayout.forEach((clusterKey) => {
      if (hiddenSet.has(clusterKey)) return;
      const mems = membersByClusterKey.get(clusterKey) ?? [];
      const center = centerPosByKey.get(clusterKey) ?? { x: cxMain, y: cyMain };
      let maxD = 0;
      for (const m of mems) {
        const p = memberPos.get(m.id());
        if (p) maxD = Math.max(maxD, Math.hypot(p.x - center.x, p.y - center.y));
      }
      haloRByCluster.set(clusterKey, Math.max(40, maxD * 1.12 + 18));
    });

    cy.nodes()
      .filter((ele) => memberPos.has(ele.id()))
      .layout({
        name: 'preset',
        animate: true,
        transform: (node) => memberPos.get(node.id()) ?? { x: cxMain, y: cyMain }
      })
      .run();

    const { fill: haloFill, border: haloBorder } = mapChromeHaloFillAndBorder(
      chromeSurface?.opacity ?? DEFAULT_MAP_UI_CHROME_OPACITY,
      chromeSurface?.blurPx ?? DEFAULT_MAP_UI_CHROME_BLUR_PX
    );

    cy.batch(() => {
      cy.nodes('.frame-cluster-label').remove();
      cy.nodes('.frame-cluster-halo').remove();
      keysForLayout.forEach((clusterKey) => {
        if (hiddenSet.has(clusterKey)) return;
        const center = centerPosByKey.get(clusterKey);
        if (!center) return;
        const haloR = haloRByCluster.get(clusterKey) ?? 48;
        const haloW = haloR * 2;
        const haloId = `frameClusterHalo__${clusterKey === '' ? '__empty__' : clusterKey}`;
        cy.add({
          group: 'nodes',
          data: { id: haloId, haloW, haloH: haloW, haloFill, haloBorder },
          classes: ['frame-cluster-halo']
        });
        cy.getElementById(haloId).position({ x: center.x, y: center.y });

        const labelText =
          clusterKey === '' ? '无帧' : framesById.get(clusterKey) ?? clusterKey;
        const id = `frameClusterLabel__${clusterKey === '' ? '__empty__' : clusterKey}`;
        if (!cy.getElementById(id).empty()) return;
        cy.add({
          group: 'nodes',
          data: { id, label: labelText },
          classes: ['frame-cluster-label']
        });
        cy.getElementById(id).position({ x: center.x, y: center.y });
      });
    });

    requestAnimationFrame(() => {
      cy.resize();
      cy.fit(undefined, 48);
    });

    clusterCy.destroy();
  } finally {
    temp.remove();
  }
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

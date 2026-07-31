import cytoscape, { type Core, type ElementDefinition, type NodeSingular } from 'cytoscape';
import {
  DEFAULT_MAP_UI_CHROME_BLUR_PX,
  DEFAULT_MAP_UI_CHROME_OPACITY
} from '../map/mapChromeStyle';
import { GRAPH_FOCUS_CORE_NODE_SCALE, DEFAULT_GRAPH_TIME_AXIS_WEIGHT_BIAS, type GraphExportPayload } from './graphData';
import type { GraphLayerState, Note } from '../../types';
import {
  compareTagLayerKeysForAutoOrder,
  defaultWeightForTagLayer
} from '../layer/layerRegistry';
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
      : // 兼容旧导出/历史数据：仅有首簇归属字段
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
  // 没有簇候选：归属空组（后续由 hidden 控制显示/隐藏）
  if (candidates.length === 0) return '';

  // 逐个跳过已隐藏的簇：取第一个“未隐藏”的归属簇
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
      let disp: 'none' | 'element' = hiddenSet.has(g) ? 'none' : 'element';
      if (disp === 'element') {
        const lh = node.data('layerItemHidden');
        if (lh === true || lh === 'yes' || lh === 1) disp = 'none';
      }
      node.style('display', disp);
    });
  });
  applyGraphNodeStackZIndex(cy);
}

/** 标签层与簇层同时生效：任一层隐藏则节点隐藏；选中高亮的邻居临时强制显示 */
export function applyGraphDualLayerNodeVisibility(
  cy: Core,
  tagHidden: string[],
  frameHidden: string[],
  tagVisibilityLogic: 'and' | 'or' = 'or'
): void {
  const tagSet = new Set(tagHidden.map((h) => String(h).trim()));
  const frameSet = new Set(frameHidden.map((h) => String(h).trim()));
  const logic = tagVisibilityLogic === 'and' ? 'and' : 'or';
  cy.batch(() => {
    cy.nodes().forEach((node) => {
      if (node.hasClass('frame-cluster-halo') || node.hasClass('frame-cluster-label')) return;
      const rawLabels = node.data('tagLabels');
      const tagLabels: string[] = Array.isArray(rawLabels)
        ? rawLabels.map((x) => String(x).trim()).filter(Boolean)
        : [];
      let tagBlocked: boolean;
      if (tagLabels.length === 0) {
        tagBlocked = tagSet.has(GRAPH_UNTAGGED_TAG_GROUP);
      } else if (logic === 'and') {
        // 且：只要有一个标签隐藏就隐藏节点
        tagBlocked = tagLabels.some((l) => tagSet.has(l));
      } else {
        // 或：只要有一个标签显示就显示节点
        tagBlocked = tagLabels.every((l) => tagSet.has(l));
      }
      const frameKey = getGraphLayerEffectiveGroupKey(node, 'frame', frameSet);
      let disp: 'none' | 'element' =
        tagBlocked || frameSet.has(frameKey) ? 'none' : 'element';
      if (disp === 'element') {
        const lh = node.data('layerItemHidden');
        if (lh === true || lh === 'yes' || lh === 1) disp = 'none';
      }
      // 选中关系链高亮：临时显示本应隐藏的相连节点（筛选取消勾选后会去掉 class 并回到隐藏）
      if (
        disp === 'none' &&
        (node.hasClass('focus-core') ||
          node.hasClass('focus-nh') ||
          node.hasClass('focus-edge-endpoint'))
      ) {
        disp = 'element';
      }
      node.style('display', disp);
    });
  });
  applyGraphNodeStackZIndex(cy);
}

/**
 * 便签叠放序写在元素 bypass `z-index` 上，会盖过样式表。
 * 高亮节点抬到 top 并大幅抬升 z；未高亮保持 auto，让高亮连线（top）能盖过它们。
 */
const GRAPH_Z_BOOST = {
  nh: 100_000,
  endpoint: 110_000,
  core: 120_000,
  hover: 130_000
} as const;

export function applyGraphNodeStackZIndex(cy: Core): void {
  if (!cy || cy.destroyed?.()) return;
  cy.batch(() => {
    cy.nodes().forEach((node) => {
      if (node.hasClass('frame-cluster-halo') || node.hasClass('frame-cluster-label')) return;
      const base = Number(node.data('stackZ'));
      const stack = Number.isFinite(base) ? base : 2;
      let boost = 0;
      if (node.hasClass('focus-hover')) boost = GRAPH_Z_BOOST.hover;
      else if (node.hasClass('focus-core')) boost = GRAPH_Z_BOOST.core;
      else if (node.hasClass('focus-edge-endpoint')) boost = GRAPH_Z_BOOST.endpoint;
      else if (node.hasClass('focus-nh')) boost = GRAPH_Z_BOOST.nh;
      // bypass 同步 compound：避免仅改 z-index 时仍停在错误层
      node.style({
        'z-compound-depth': boost > 0 ? 'top' : 'auto',
        'z-index': stack + boost
      });
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
  // 约定：权重越大越靠近圆心。
  visibleGroups.forEach((groupNodes, tagKey) => {
    const wgt = layers.weights?.[tagKey] ?? 0.5;
    const norm = graphLayerWeightNorm(wgt);
    const r = rInner + (1 - norm) * (rOuter - rInner);
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

function isCyActive(cy: Core | null | undefined): cy is Core {
  if (!cy) return false;
  try {
    return !(cy as any).destroyed?.();
  } catch {
    return false;
  }
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
    requestAnimationFrame(() => {
      if (!isCyActive(cy)) return;
      cy.resize();
    });
  });
  ro.observe(el);
  return () => ro.disconnect();
}

export function scheduleGraphResizeAndFit(cy: Core): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!isCyActive(cy)) return;
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

const GRAPH_COSE_EDGE_LENGTH_MIN = 64;
const GRAPH_COSE_EDGE_LENGTH_MAX = 276;
const GRAPH_COSE_EDGE_WEIGHT_MIN = 0.1;
const GRAPH_COSE_EDGE_WEIGHT_MAX = 3.2;
const GRAPH_COSE_REPULSION_MIN = 3200;
const GRAPH_COSE_REPULSION_MAX = 9200;
const GRAPH_COSE_CROSSING_OPT_MAX_EDGES = 220;
const GRAPH_COSE_FLOW_BIAS_MAX_EDGES = 500;

type GraphCoseCentralityStats = {
  normByNodeId: Map<string, number>;
  avgNormByEdgeId: Map<string, number>;
};

function graphCoseBuildWeightedDegreeCentrality(cy: Core): GraphCoseCentralityStats {
  const degreeByNodeId = new Map<string, number>();
  cy.nodes().forEach((n) => {
    degreeByNodeId.set(n.id(), 0);
  });

  cy.edges().forEach((e) => {
    const raw = Number(e.data('edgeWeight'));
    const edgeW = Number.isFinite(raw) ? Math.max(GRAPH_COSE_EDGE_WEIGHT_MIN, raw) : 0.3;
    const s = e.source().id();
    const t = e.target().id();
    degreeByNodeId.set(s, (degreeByNodeId.get(s) ?? 0) + edgeW);
    degreeByNodeId.set(t, (degreeByNodeId.get(t) ?? 0) + edgeW);
  });

  let maxDeg = 0;
  degreeByNodeId.forEach((v) => {
    if (v > maxDeg) maxDeg = v;
  });
  const denom = maxDeg > 0 ? maxDeg : 1;

  const normByNodeId = new Map<string, number>();
  degreeByNodeId.forEach((v, k) => {
    normByNodeId.set(k, Math.max(0, Math.min(1, v / denom)));
  });

  const avgNormByEdgeId = new Map<string, number>();
  cy.edges().forEach((e) => {
    const sNorm = normByNodeId.get(e.source().id()) ?? 0;
    const tNorm = normByNodeId.get(e.target().id()) ?? 0;
    avgNormByEdgeId.set(e.id(), (sNorm + tNorm) / 2);
  });

  return { normByNodeId, avgNormByEdgeId };
}

/** 与「加权度归一化」对比：邻居中心度高于该阈值视为 hub，用于多 hub 竞争拉长辐条边 */
const GRAPH_COSE_HUB_CENTRALITY_THRESHOLD = 0.52;

function graphCoseBuildHubNeighborCounts(cy: Core, normByNodeId: Map<string, number>): Map<string, number> {
  const counts = new Map<string, number>();
  cy.nodes().forEach((n) => {
    counts.set(n.id(), 0);
  });
  cy.edges().forEach((e) => {
    const s = e.source();
    const t = e.target();
    if (s.empty() || t.empty()) return;
    const sId = s.id();
    const tId = t.id();
    const sN = normByNodeId.get(sId) ?? 0;
    const tN = normByNodeId.get(tId) ?? 0;
    if (sN >= GRAPH_COSE_HUB_CENTRALITY_THRESHOLD) counts.set(tId, (counts.get(tId) ?? 0) + 1);
    if (tN >= GRAPH_COSE_HUB_CENTRALITY_THRESHOLD) counts.set(sId, (counts.get(sId) ?? 0) + 1);
  });
  return counts;
}

type GraphCoseSegment = {
  sourceId: string;
  targetId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

function graphCoseBuildVisibleSegments(cy: Core): GraphCoseSegment[] {
  const segs: GraphCoseSegment[] = [];
  cy.edges().forEach((e) => {
    const s = e.source();
    const t = e.target();
    if (s.empty() || t.empty()) return;
    if (s.id() === t.id()) return;
    if (s.style('display') === 'none' || t.style('display') === 'none' || e.style('display') === 'none') return;
    const sp = s.position();
    const tp = t.position();
    segs.push({
      sourceId: s.id(),
      targetId: t.id(),
      x1: sp.x,
      y1: sp.y,
      x2: tp.x,
      y2: tp.y
    });
  });
  return segs;
}

function graphCoseSegmentsShareEndpoint(a: GraphCoseSegment, b: GraphCoseSegment): boolean {
  return (
    a.sourceId === b.sourceId ||
    a.sourceId === b.targetId ||
    a.targetId === b.sourceId ||
    a.targetId === b.targetId
  );
}

function graphCoseOrientation(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cyy: number
): number {
  return (bx - ax) * (cyy - ay) - (by - ay) * (cx - ax);
}

function graphCoseSegmentsCross(a: GraphCoseSegment, b: GraphCoseSegment): boolean {
  const eps = 1e-7;
  const o1 = graphCoseOrientation(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1);
  const o2 = graphCoseOrientation(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2);
  const o3 = graphCoseOrientation(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1);
  const o4 = graphCoseOrientation(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2);
  if (Math.abs(o1) < eps || Math.abs(o2) < eps || Math.abs(o3) < eps || Math.abs(o4) < eps) return false;
  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
}

function graphCoseCountCrossingsFromSegments(segs: GraphCoseSegment[]): number {
  let count = 0;
  for (let i = 0; i < segs.length; i += 1) {
    const a = segs[i];
    for (let j = i + 1; j < segs.length; j += 1) {
      const b = segs[j];
      if (graphCoseSegmentsShareEndpoint(a, b)) continue;
      if (graphCoseSegmentsCross(a, b)) count += 1;
    }
  }
  return count;
}

function runGraphCoseCrossingPostProcess(cy: Core): void {
  const edgeCount = cy.edges().length;
  if (edgeCount < 4 || edgeCount > GRAPH_COSE_CROSSING_OPT_MAX_EDGES) return;

  const allNodes = cy
    .nodes()
    .filter((n) => n.style('display') !== 'none' && !n.hasClass('frame-cluster-label') && !n.hasClass('frame-cluster-halo'));
  if (allNodes.length < 3) return;

  const nodes = allNodes
    .toArray()
    .filter((n): n is NodeSingular => n.isNode())
    .sort((a, b) => b.connectedEdges().length - a.connectedEdges().length)
    .slice(0, Math.min(28, allNodes.length));

  const viewport = Math.max(120, Math.min(cy.width(), cy.height()));
  const step = Math.max(10, Math.min(34, viewport * 0.02));
  const offsets = [
    { x: 0, y: 0 },
    { x: step, y: 0 },
    { x: -step, y: 0 },
    { x: 0, y: step },
    { x: 0, y: -step },
    { x: step, y: step },
    { x: step, y: -step },
    { x: -step, y: step },
    { x: -step, y: -step }
  ];

  for (let pass = 0; pass < 2; pass += 1) {
    let improved = false;
    for (const node of nodes) {
      const base = node.position();
      let bestX = base.x;
      let bestY = base.y;
      let bestCross = graphCoseCountCrossingsFromSegments(graphCoseBuildVisibleSegments(cy));
      for (const off of offsets) {
        const nx = base.x + off.x;
        const ny = base.y + off.y;
        node.position({ x: nx, y: ny });
        const c = graphCoseCountCrossingsFromSegments(graphCoseBuildVisibleSegments(cy));
        if (c < bestCross) {
          bestCross = c;
          bestX = nx;
          bestY = ny;
        }
      }
      node.position({ x: bestX, y: bestY });
      if (bestX !== base.x || bestY !== base.y) improved = true;
    }
    if (!improved) break;
  }
}

function runGraphCoseLeftFlowPostProcess(cy: Core): void {
  const edges = cy.edges();
  if (edges.length < 2 || edges.length > GRAPH_COSE_FLOW_BIAS_MAX_EDGES) return;

  const nodes = cy
    .nodes()
    .filter((n) => n.style('display') !== 'none' && !n.hasClass('frame-cluster-label') && !n.hasClass('frame-cluster-halo'));
  if (nodes.length < 2) return;

  const nodeIds = nodes.map((n) => n.id());
  const nodeSet = new Set(nodeIds);
  const outAdj = new Map<string, Array<{ to: string; w: number }>>();
  const inAdj = new Map<string, Array<{ from: string; w: number }>>();
  nodeIds.forEach((id) => {
    outAdj.set(id, []);
    inAdj.set(id, []);
  });

  const normW = (raw: unknown) => {
    const v = Number(raw);
    const safe = Number.isFinite(v) ? Math.max(0.1, Math.min(4.5, v)) : 0.3;
    return 0.45 + ((safe - 0.1) / (4.5 - 0.1)) * 0.55;
  };

  const pushDirEdge = (from: string, to: string, w: number) => {
    if (!nodeSet.has(from) || !nodeSet.has(to) || from === to) return;
    outAdj.get(from)!.push({ to, w });
    inAdj.get(to)!.push({ from, w });
  };

  edges.forEach((e) => {
    const dir = String(e.data('direction') ?? 'none');
    const s = e.source().id();
    const t = e.target().id();
    const w = normW(e.data('edgeWeight'));
    if (dir === 'forward') {
      pushDirEdge(s, t, w);
      return;
    }
    if (dir === 'backward') {
      pushDirEdge(t, s, w);
      return;
    }
    if (dir === 'both') {
      pushDirEdge(s, t, w);
      pushDirEdge(t, s, w);
    }
  });

  // 完整链路累加：不是只看一步 out-in，而是沿有向图多步传播（带衰减）估计“源头性”。
  const ITER = 12;
  const DECAY = 0.72;
  let downstream = new Map<string, number>();
  let upstream = new Map<string, number>();
  nodeIds.forEach((id) => {
    downstream.set(id, 1);
    upstream.set(id, 1);
  });

  for (let i = 0; i < ITER; i += 1) {
    const nextDown = new Map<string, number>();
    const nextUp = new Map<string, number>();
    nodeIds.forEach((id) => {
      let downVal = 1;
      let upVal = 1;
      const outs = outAdj.get(id) ?? [];
      const ins = inAdj.get(id) ?? [];
      for (const e of outs) {
        downVal += DECAY * e.w * (downstream.get(e.to) ?? 1);
      }
      for (const e of ins) {
        upVal += DECAY * e.w * (upstream.get(e.from) ?? 1);
      }
      nextDown.set(id, downVal);
      nextUp.set(id, upVal);
    });
    downstream = nextDown;
    upstream = nextUp;
  }

  const scoreByNodeId = new Map<string, number>();
  nodeIds.forEach((id) => {
    const s = (downstream.get(id) ?? 1) - (upstream.get(id) ?? 1);
    scoreByNodeId.set(id, s);
  });

  let minScore = Infinity;
  let maxScore = -Infinity;
  scoreByNodeId.forEach((v) => {
    if (v < minScore) minScore = v;
    if (v > maxScore) maxScore = v;
  });
  if (!Number.isFinite(minScore) || !Number.isFinite(maxScore)) return;

  const width = cy.width();
  const left = width * 0.08;
  const right = width * 0.92;
  const range = Math.max(1e-6, maxScore - minScore);
  const strength = 0.6; // 提升约束强度，让“源头靠左”更明显

  // 非线性放大两端差异，避免中段节点都堆在中间带。
  const remapNorm = (u: number) => 0.5 + Math.sign(u - 0.5) * Math.pow(Math.abs(u - 0.5) * 2, 0.72) * 0.5;

  for (let pass = 0; pass < 2; pass += 1) {
    nodes.forEach((n) => {
      const s = scoreByNodeId.get(n.id()) ?? 0;
      const norm = remapNorm(Math.max(0, Math.min(1, (s - minScore) / range)));
      // 分数越高（更像源头）越靠左
      const xTarget = right - norm * (right - left);
      const p = n.position();
      n.position({ x: p.x + (xTarget - p.x) * strength, y: p.y });
    });
  }
}

type GraphCosePostProcessOptions = {
  enableCrossingPostProcess?: boolean;
  enableLeftFlowPostProcess?: boolean;
};

function graphCoseIdealEdgeLengthFromWeight(edgeWeightRaw: number): number {
  const w = Number.isFinite(edgeWeightRaw) ? edgeWeightRaw : 0.3;
  const clamped = Math.max(GRAPH_COSE_EDGE_WEIGHT_MIN, Math.min(GRAPH_COSE_EDGE_WEIGHT_MAX, w));
  const tLinear =
    (clamped - GRAPH_COSE_EDGE_WEIGHT_MIN) / (GRAPH_COSE_EDGE_WEIGHT_MAX - GRAPH_COSE_EDGE_WEIGHT_MIN);
  // 非线性放大低-中区间差异，让 tag 赋权对边长的影响更明显。
  const t = Math.pow(Math.max(0, Math.min(1, tLinear)), 0.58);
  return GRAPH_COSE_EDGE_LENGTH_MIN + t * (GRAPH_COSE_EDGE_LENGTH_MAX - GRAPH_COSE_EDGE_LENGTH_MIN);
}

/**
 * 力导布局参数：让 edgeWeight 越大的边有更长的理想长度，帮助降低中心拥挤与交叉。
 * 可通过 overrides 覆盖默认项（如 animate/numIter 等）。
 */
export function buildGraphCoseLayoutOptions(
  cy: Core,
  overrides?: Record<string, unknown>,
  postProcessOptions?: GraphCosePostProcessOptions
): Record<string, unknown> {
  const centrality = graphCoseBuildWeightedDegreeCentrality(cy);
  const hubNeighborCountByNodeId = graphCoseBuildHubNeighborCounts(cy, centrality.normByNodeId);
  const enableCrossingPostProcess = postProcessOptions?.enableCrossingPostProcess !== false;
  const enableLeftFlowPostProcess = postProcessOptions?.enableLeftFlowPostProcess !== false;
  const userStop = typeof overrides?.stop === 'function' ? (overrides.stop as () => void) : undefined;
  const safeOverrides = { ...(overrides ?? {}) };
  if ('stop' in safeOverrides) delete safeOverrides.stop;
  return {
    name: 'fcose',
    animate: true,
    padding: 40,
    idealEdgeLength: (edge: any) => {
      const sNode = edge?.source?.();
      const tNode = edge?.target?.();
      if (!sNode || !tNode || sNode.empty?.() || tNode.empty?.()) {
        return graphCoseIdealEdgeLengthFromWeight(Number(edge?.data?.('edgeWeight')));
      }
      const sId = String(sNode.id());
      const tId = String(tNode.id());
      const cS = centrality.normByNodeId.get(sId) ?? 0;
      const cT = centrality.normByNodeId.get(tId) ?? 0;
      const cAvg = (cS + cT) / 2;

      const base = graphCoseIdealEdgeLengthFromWeight(Number(edge?.data?.('edgeWeight')));
      // 整体：边两端加权度越高，理想边稍短（核心簇收紧）
      let len = base * (1 - cAvg * 0.26);

      // 节点图层面板 tag 权重：在 edgeWeight 之外再拉高/压低理想长度（权重越大 → 边越长）
      const tagS = Number(sNode.data?.('tagLayerNorm'));
      const tagT = Number(tNode.data?.('tagLayerNorm'));
      const tagAvg =
        Number.isFinite(tagS) && Number.isFinite(tagT) ? (tagS + tagT) / 2 : 0.5;
      len *= 1 + (tagAvg - 0.5) * 0.82;

      // “层级跨度”可视化：buildGraphElements 为边写入 edgeIdealLenFactor（默认 1）。
      // 该因子主要由 Δlevel（层级跨度）驱动，用于让跨层边更长、更醒目。
      const rawLenFactor = Number(edge?.data?.('edgeIdealLenFactor'));
      if (Number.isFinite(rawLenFactor)) {
        // 允许更大的长度倍率，否则差异会被夹平
        const f = Math.max(0.55, Math.min(4.0, rawLenFactor));
        len *= f;
      }

      // 一侧为 hub、一侧明显更弱：辐条略短；若弱侧同时连接多个 hub，则拉长该辐条，避免多个高中心簇被同一节点拽得太近
      const cLow = Math.min(cS, cT);
      const cHigh = Math.max(cS, cT);
      const lowId = cS <= cT ? sId : tId;
      const hubTh = GRAPH_COSE_HUB_CENTRALITY_THRESHOLD;
      if (cHigh >= hubTh && cLow < cHigh - 0.07) {
        len *= 0.92 + (1 - cHigh) * 0.08;
        const kHub = hubNeighborCountByNodeId.get(lowId) ?? 0;
        if (kHub >= 2) {
          const competition = kHub - 1;
          len *= 1 + 0.26 * competition * (0.4 + 0.6 * (1 - cLow));
        }
      }

      // 提高上限，保证“源头辐射”的长边能拉开差异
      return Math.max(46, Math.min(720, len));
    },
    nodeRepulsion: (node: any) => {
      const c = centrality.normByNodeId.get(String(node?.id?.() ?? '')) ?? 0;
      // 中心节点排斥略低、外围节点排斥略高：通常可减少外围挤压和连线缠绕。
      return Math.round(GRAPH_COSE_REPULSION_MIN + (1 - c) * (GRAPH_COSE_REPULSION_MAX - GRAPH_COSE_REPULSION_MIN));
    },
    stop: () => {
      requestAnimationFrame(() => {
        if (!isCyActive(cy)) return;
        syncGraphEdgeCurveDistances(cy);
        if (enableCrossingPostProcess || enableLeftFlowPostProcess) {
          if (enableLeftFlowPostProcess) runGraphCoseLeftFlowPostProcess(cy);
          if (enableCrossingPostProcess) runGraphCoseCrossingPostProcess(cy);
          syncGraphEdgeCurveDistances(cy);
          requestAnimationFrame(() => {
            if (!isCyActive(cy)) return;
            cy.resize();
          });
        }
      });
      userStop?.();
    },
    ...safeOverrides
  };
}

export function runGraphCoseLayout(cy: Core): void {
  try {
    cy.layout(buildGraphCoseLayoutOptions(cy) as any).run();
  } catch {
    // 防御：若第三方布局在某些数据组合下拒绝函数型 idealEdgeLength，回退到稳定默认值。
    cy.layout({ name: 'fcose', animate: true, padding: 40 } as any).run();
  }
}

/**
 * 圆环布局。
 * 传入合并后的 `graphLayers` 时：按标签组权重分配半径（越大越靠近圆心），不再接力导（避免破坏环形）。
 * 未传时：使用 cytoscape 内置圆环，并可选用短时 fcose 微调。
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
    cy.layout(buildGraphCoseLayoutOptions(cy, {
      randomize: false,
      animate: true,
      fit: true,
      // fCoSE：randomize:false 时须用 proof（增量精修）
      quality: 'proof',
      numIter: 600,
      nodeDimensionsIncludeLabels: true
    }) as any).run();
  });
  circleLayout.run();
}

/**
 * 切到力导前移除历史簇装饰节点（若有），避免 fcose 把 halo/label 当真实节点算力。
 */
export function prepareGraphForForceLayout(cy: Core): void {
  cy.batch(() => {
    cy.nodes('.frame-cluster-label').remove();
    cy.nodes('.frame-cluster-halo').remove();
  });
}

/** 是否已有可用的现有布局坐标（用于增量 fcose，从当前位置动画导向力导结果） */
function graphForceLayoutHasSeedPositions(cy: Core): boolean {
  const nodes = cy.nodes().filter((n) => {
    if (n.style('display') === 'none') return false;
    if (n.hasClass('frame-cluster-label') || n.hasClass('frame-cluster-halo')) return false;
    return true;
  });
  if (nodes.length < 2) return false;
  const bb = nodes.boundingBox({ includeLabels: false });
  return Number.isFinite(bb.w) && Number.isFinite(bb.h) && (bb.w > 48 || bb.h > 48);
}

export function applyGraphLayout(
  cy: Core,
  name: 'fcose' | 'circle',
  circleRefineWithForce = true,
  graphLayers: GraphLayerState | null = null,
  standard: GraphLayerGroupStandard = 'tag'
): void {
  if (name === 'circle') {
    applyGraphCircleLayout(cy, circleRefineWithForce, graphLayers, standard);
    return;
  }
  prepareGraphForForceLayout(cy);
  const incremental = graphForceLayoutHasSeedPositions(cy);
  try {
    // 从时间线等已有布局切入：randomize:false 从当前位置增量跑 fcose，动画导向最终位置。
    // 冷启动（节点堆叠）：randomize:true 做光谱初值。
    // 增量动画时关闭后处理，避免 layoutstop 后硬跳破坏「导向 fcose」的观感。
    cy.layout(
      buildGraphCoseLayoutOptions(
        cy,
        {
          name: 'fcose',
          randomize: !incremental,
          quality: incremental ? 'proof' : 'default',
          animate: true,
          animationDuration: 1000,
          fit: true,
          nodeDimensionsIncludeLabels: true
        },
        {
          enableCrossingPostProcess: !incremental,
          enableLeftFlowPostProcess: !incremental
        }
      ) as any
    ).run();
  } catch {
    cy.layout({
      name: 'fcose',
      animate: true,
      animationDuration: 1000,
      padding: 40,
      randomize: !incremental,
      quality: incremental ? 'proof' : 'default'
    } as any).run();
  }
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
    if (!isCyActive(cy)) return;
    cy.resize();
    cy.fit(undefined, 48);
  });
}

/** 图谱二级布局（时间线 / 力导），用于恢复上次选择 */
export type GraphLayoutMode = 'time' | 'cose';

export const DEFAULT_GRAPH_LAYOUT_MODE: GraphLayoutMode = 'cose';

export function coerceGraphLayoutMode(raw: unknown): GraphLayoutMode {
  if (raw === 'time' || raw === 'cose') return raw;
  // 历史 frameCluster 已移除，回退到默认力导
  return DEFAULT_GRAPH_LAYOUT_MODE;
}

/** 合并便签中出现的分组与已存顺序/隐藏；供时间线纵轴与导出一致 */
export function mergeGraphLayerState(
  notes: Note[],
  saved?: GraphLayerState | null,
  standard: GraphLayerGroupStandard = 'tag'
): GraphLayerState {
  const allKeys = new Set<string>();
  for (const n of notes) {
    if (standard === 'tag') {
      const labels = (n.tags ?? [])
        .map((t) => String(t.label ?? '').trim())
        .filter((l) => l !== '');
      if (labels.length === 0) {
        allKeys.add(GRAPH_UNTAGGED_TAG_GROUP);
      } else {
        labels.forEach((l) => allKeys.add(l));
      }
      continue;
    }

    // frame 标准：每便签至多一个 frame（旧多簇取第一个）
    const candidates =
      n.groupIds?.length
        ? n.groupIds.slice(0, 1)
        : n.groupId
          ? [n.groupId]
          : n.groupNames?.length
            ? n.groupNames.slice(0, 1)
            : n.groupName
              ? [n.groupName]
              : [];

    const cleaned = candidates.map((x) => String(x).trim()).filter((x) => x !== '');
    if (cleaned.length === 0) {
      allKeys.add(''); // 无簇归属（可在面板中显隐/加权）
      continue;
    }
    cleaned.forEach((k) => allKeys.add(k));
  }
  const prevOrder = saved?.order ?? [];
  const ordered: string[] = [];
  const seen = new Set<string>();
  if (standard === 'tag') {
    // 标签面板：全部标签按首字母顺序（不沿用拖拽顺序）
    [...allKeys]
      .sort((a, b) => compareTagLayerKeysForAutoOrder(a, b, GRAPH_UNTAGGED_TAG_GROUP))
      .forEach((k) => {
        ordered.push(k);
        seen.add(k);
      });
  } else {
    for (const k of prevOrder) {
      const key = String(k).trim();
      if (allKeys.has(key) && !seen.has(key)) {
        ordered.push(key);
        seen.add(key);
      }
    }
  }
  const rest = [...allKeys]
    .filter((k) => !seen.has(k))
    .sort((a, b) =>
      standard === 'tag'
        ? compareTagLayerKeysForAutoOrder(a, b, GRAPH_UNTAGGED_TAG_GROUP)
        : (() => {
            if (a === '' && b !== '') return 1;
            if (b === '' && a !== '') return -1;
            return a.localeCompare(b, GRAPH_SORT_LOCALE);
          })()
    );
  const hidden = (saved?.hidden ?? []).filter((h) => allKeys.has(String(h).trim())).map((h) => String(h).trim());
  const prevW = saved?.weights ?? {};
  const weights: Record<string, number> = {};
  for (const k of allKeys) {
    const v = prevW[k];
    const fallback =
      standard === 'tag' ? defaultWeightForTagLayer(k) : 0.5;
    weights[k] =
      typeof v === 'number' && Number.isFinite(v) ? clampGraphLayerWeight(v) : clampGraphLayerWeight(fallback);
  }
  return {
    order: [...ordered, ...rest],
    hidden,
    weights,
    tagVisibilityLogic: saved?.tagVisibilityLogic === 'and' ? 'and' : 'or'
  };
}

/** 时间线 preset：横轴年份；纵轴可选受图层面板权重与 bias 牵引 */
export interface GraphTimeLayoutOptions {
  weightBias?: number;
}

/**
 * 按模式应用布局。`silentTimeFallback`：恢复缓存为时间线但无年份数据时，静默退回力导。
 */
export function applyGraphLayoutMode(
  cy: Core,
  mode: GraphLayoutMode,
  options?: {
    silentTimeFallback?: boolean;
    timeLayout?: GraphTimeLayoutOptions;
    /** @deprecated 圆环已移除；保留以免旧调用方报错 */
    circleRefineWithForce?: boolean;
    /**
     * 时间轴分组依据；图谱时间线固定传 `frame`。
     */
    graphLayerGroupStandard?: GraphLayerGroupStandard;
    /**
     * 合并后的分层面板状态（时间线用簇层）
     */
    graphLayers?: GraphLayerState | null;
  }
): void {
  const silent = options?.silentTimeFallback ?? false;
  const gl = options?.graphLayers ?? null;
  const groupStandard = options?.graphLayerGroupStandard ?? 'frame';
  if (mode === 'cose') {
    applyGraphLayout(cy, 'fcose');
    return;
  }
  const valid = cy.nodes().filter((n) => n.data('timeSort') != null);
  if (valid.length === 0) {
    if (silent) {
      applyGraphLayout(cy, 'fcose');
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
  const biasRaw = layoutOpts?.weightBias ?? DEFAULT_GRAPH_TIME_AXIS_WEIGHT_BIAS;
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

/**
 * 按当前节点间距刷新边的 unbundled-bezier 控制点距：
 * 幅度 ≈ 边长 × 比例（夹紧），平行边交替正负并拉开档位。
 */
export function syncGraphEdgeCurveDistances(cy: Core): void {
  const pairIndex = new Map<string, number>();
  cy.batch(() => {
    cy.edges().forEach((edge) => {
      const s = edge.source();
      const t = edge.target();
      if (s.empty() || t.empty() || !s.isNode() || !t.isNode()) return;
      if (
        s.hasClass('frame-cluster-label') ||
        t.hasClass('frame-cluster-label') ||
        s.hasClass('frame-cluster-halo') ||
        t.hasClass('frame-cluster-halo')
      ) {
        return;
      }
      const sp = s.position();
      const tp = t.position();
      const dx = tp.x - sp.x;
      const dy = tp.y - sp.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (!Number.isFinite(len) || len < 1e-3) {
        edge.data('controlPointDistance', 0);
        return;
      }
      const a = s.id();
      const b = t.id();
      const pairKey = a < b ? `${a}\0${b}` : `${b}\0${a}`;
      const idx = pairIndex.get(pairKey) ?? 0;
      pairIndex.set(pairKey, idx + 1);
      const sign = idx % 2 === 0 ? 1 : -1;
      const band = Math.floor(idx / 2) + 1;
      // 长边弯得更开；短边压低，避免小图里弧线夸张
      const mag = Math.max(14, Math.min(140, len * 0.2)) * (0.85 + (band - 1) * 0.45);
      edge.data('controlPointDistance', sign * mag);
      edge.data('curveSign', sign);
    });
  });
}

const HL = ['focus-core', 'focus-nh', 'focus-e'] as const;

/** 选中焦点节点直径放大/缩回动画时长 */
const FOCUS_CORE_SIZE_ANIM_MS = 180;

function graphNodeBaseSizePx(node: NodeSingular): number {
  const fav = node.data('favorite') === 'yes';
  const raw = Number(node.data(fav ? 'nodeSizeFav' : 'nodeSize'));
  if (Number.isFinite(raw) && raw > 0) return raw;
  return 28;
}

function graphNodeFocusCoreSizePx(node: NodeSingular): number {
  const fav = node.data('favorite') === 'yes';
  const raw = Number(node.data(fav ? 'nodeSizeFavCore' : 'nodeSizeCore'));
  if (Number.isFinite(raw) && raw > 0) return raw;
  return graphNodeBaseSizePx(node) * GRAPH_FOCUS_CORE_NODE_SCALE;
}

function graphNodeRenderedSizePx(node: NodeSingular): number {
  const w = node.numericStyle('width');
  if (typeof w === 'number' && Number.isFinite(w) && w > 0) return w;
  const bb = node.boundingBox({ includeLabels: false });
  const d = Math.max(bb.w, bb.h);
  return Number.isFinite(d) && d > 0 ? d : graphNodeBaseSizePx(node);
}

/**
 * 将节点宽高动画到目标直径；结束后若仍与 focus-core 状态一致则清 bypass，交回 stylesheet。
 */
function animateGraphNodeDiameter(node: NodeSingular, targetPx: number, wantCore: boolean): void {
  const cy = node.cy();
  if (!cy || cy.destroyed()) return;
  const from = graphNodeRenderedSizePx(node);
  node.stop(true);
  if (Math.abs(from - targetPx) < 0.5) {
    node.removeStyle('width');
    node.removeStyle('height');
    return;
  }
  node.style({ width: from, height: from });
  // cytoscape 类型把 style 动画标成必须带 position，运行时仅 style 合法
  const anim = node.animation({
    style: { width: targetPx, height: targetPx },
    duration: FOCUS_CORE_SIZE_ANIM_MS,
    easing: 'ease-out'
  } as any);
  anim.play().promise('complete').then(() => {
    if (cy.destroyed() || node.removed()) return;
    if (node.hasClass('focus-core') === wantCore) {
      node.removeStyle('width');
      node.removeStyle('height');
    }
  });
}

export const GRAPH_HOVER_CLASS = 'focus-hover';

/** 边标签用于筛选/合并的键：trim 后；空标签为 '' */
export function graphEdgeLabelKey(raw?: string | null): string {
  return String(raw ?? '').trim();
}

export const GRAPH_EMPTY_EDGE_LABEL_DISPLAY = '（无标签）';

export function graphEdgeLabelDisplay(key: string): string {
  return key === '' ? GRAPH_EMPTY_EDGE_LABEL_DISPLAY : key;
}

export type RelatedEdgeLabelColumn = 'from' | 'to';

export type RelatedEdgeLabelEntry = {
  /** `${column}\u0001${labelKey}`，同栏相同文案合并 */
  key: string;
  column: RelatedEdgeLabelColumn;
  labelKey: string;
  label: string;
  count: number;
};

export type RelatedEdgeLabelGroups = {
  from: RelatedEdgeLabelEntry[];
  to: RelatedEdgeLabelEntry[];
};

type ConnLabelLike = {
  id: string;
  fromNoteId: string;
  toNoteId: string;
  label?: string;
  arrow?: 'none' | 'forward' | 'reverse';
  fromArrow?: 'arrow' | 'none';
  toArrow?: 'arrow' | 'none';
};

/** 与 graphData.connectionToGraphDirection 一致（避免循环依赖） */
function connectionDirectionLocal(c: ConnLabelLike): 'forward' | 'backward' | 'both' | 'none' {
  if (c.arrow === 'none') return 'none';
  const derivedFrom: 'arrow' | 'none' =
    c.fromArrow != null ? c.fromArrow : c.arrow === 'reverse' ? 'arrow' : 'none';
  const derivedTo: 'arrow' | 'none' =
    c.toArrow != null ? c.toArrow : c.arrow === 'forward' ? 'arrow' : 'none';
  if (derivedFrom === 'arrow' && derivedTo === 'arrow') return 'both';
  if (derivedTo === 'arrow') return 'forward';
  if (derivedFrom === 'arrow') return 'backward';
  return 'none';
}

export function relatedEdgeSelectionKey(
  column: RelatedEdgeLabelColumn,
  labelKey: string
): string {
  return `${column}\u0001${labelKey}`;
}

/**
 * 相对「当前扩展端点」将边归入 From / To。
 * To = 选中点为语义起点的关系；From = 选中点为语义终点。
 * 双向与无箭头优先归入 To。
 */
export function relatedEdgeColumnForEndpoint(
  endpointId: string,
  dir: 'forward' | 'backward' | 'both' | 'none',
  fromNoteId: string,
  toNoteId: string
): RelatedEdgeLabelColumn {
  if (dir === 'both' || dir === 'none') return 'to';
  const semanticSource = dir === 'forward' ? fromNoteId : toNoteId;
  return endpointId === semanticSource ? 'to' : 'from';
}

function sortRelatedEntries(entries: RelatedEdgeLabelEntry[]): RelatedEdgeLabelEntry[] {
  return entries.sort((a, b) => {
    if (a.labelKey === '' && b.labelKey !== '') return 1;
    if (b.labelKey === '' && a.labelKey !== '') return -1;
    return a.label.localeCompare(b.label, GRAPH_SORT_LOCALE);
  });
}

/**
 * 无过滤时关系链内出现的边标签，按 From / To 分栏（栏内相同合并计数）。
 * 与 applyGraphNeighborHighlight 的 BFS 深度一致。
 */
export function collectRelatedEdgeLabelEntries(
  centerId: string,
  connections: ConnLabelLike[],
  chainLength: number = 1
): RelatedEdgeLabelGroups {
  const depth = Math.max(1, Math.floor(Number.isFinite(chainLength) ? chainLength : 1));
  const byNode = new Map<string, ConnLabelLike[]>();
  for (const c of connections) {
    if (!byNode.has(c.fromNoteId)) byNode.set(c.fromNoteId, []);
    if (!byNode.has(c.toNoteId)) byNode.set(c.toNoteId, []);
    byNode.get(c.fromNoteId)!.push(c);
    if (c.fromNoteId !== c.toNoteId) byNode.get(c.toNoteId)!.push(c);
  }

  const seenEdges = new Set<string>();
  const fromCounts = new Map<string, number>();
  const toCounts = new Map<string, number>();
  const nodeIds = new Set<string>([centerId]);
  let frontier = new Set<string>([centerId]);

  for (let dist = 0; dist < depth; dist += 1) {
    const nextFrontier = new Set<string>();
    for (const nodeId of frontier) {
      for (const c of byNode.get(nodeId) ?? []) {
        if (seenEdges.has(c.id)) continue;
        seenEdges.add(c.id);
        const labelKey = graphEdgeLabelKey(c.label);
        const dir = connectionDirectionLocal(c);
        const column = relatedEdgeColumnForEndpoint(nodeId, dir, c.fromNoteId, c.toNoteId);
        const bucket = column === 'from' ? fromCounts : toCounts;
        bucket.set(labelKey, (bucket.get(labelKey) ?? 0) + 1);
        const otherId = c.fromNoteId === nodeId ? c.toNoteId : c.fromNoteId;
        if (!nodeIds.has(otherId)) {
          nodeIds.add(otherId);
          nextFrontier.add(otherId);
        }
      }
    }
    frontier = nextFrontier;
    if (frontier.size === 0) break;
  }

  const toEntries = (column: RelatedEdgeLabelColumn, counts: Map<string, number>) =>
    sortRelatedEntries(
      [...counts.entries()].map(([labelKey, count]) => ({
        key: relatedEdgeSelectionKey(column, labelKey),
        column,
        labelKey,
        label: graphEdgeLabelDisplay(labelKey),
        count
      }))
    );

  return {
    from: toEntries('from', fromCounts),
    to: toEntries('to', toCounts)
  };
}

export function flattenRelatedEdgeLabelGroups(
  groups: RelatedEdgeLabelGroups
): RelatedEdgeLabelEntry[] {
  return [...groups.from, ...groups.to];
}

/** 点击节点：高亮自身、相邻节点及之间的连线（与 App 内 GraphView 一致） */
export function applyGraphNeighborHighlight(
  cy: Core,
  centerId: string | null,
  /** 关系链长度：通过连线连续扩展的层级数（1=当前实现） */
  chainLength: number = 1,
  /**
   * 允许遍历的边筛选键（`from\u0001label` / `to\u0001label`）；`null` 表示不过滤。
   * 空集合时仅高亮中心点。
   */
  allowedEdgeLabelKeys: Set<string> | null = null
): void {
  const prevCores = cy.nodes('.focus-core').toArray();
  // 卸下 focus-core 前先 bypass 锁住当前直径，避免 stylesheet 瞬缩打断动画
  for (const n of prevCores) {
    if (centerId && n.id() === centerId) continue;
    const w = graphNodeRenderedSizePx(n);
    n.stop(true);
    n.style({ width: w, height: w });
  }

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
          if (allowedEdgeLabelKeys) {
            const labelKey = graphEdgeLabelKey(edge.data('label'));
            const rawDir = String(edge.data('direction') ?? 'none');
            const dir =
              rawDir === 'forward' || rawDir === 'backward' || rawDir === 'both' || rawDir === 'none'
                ? rawDir
                : 'none';
            const srcId = edge.source().id();
            const tgtId = edge.target().id();
            const column = relatedEdgeColumnForEndpoint(nodeId, dir, srcId, tgtId);
            const selKey = relatedEdgeSelectionKey(column, labelKey);
            if (!allowedEdgeLabelKeys.has(selKey)) return;
          }
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
  applyGraphNodeStackZIndex(cy);

  // 选中焦点：直径放大；取消/切换：旧焦点缩回（单节点，开销很小）
  for (const n of prevCores) {
    if (centerId && n.id() === centerId) continue;
    animateGraphNodeDiameter(n, graphNodeBaseSizePx(n), false);
  }
  if (centerId) {
    const el = cy.getElementById(centerId);
    if (!el.empty() && el.isNode()) {
      const alreadyCore = prevCores.some((n) => n.id() === centerId);
      if (!alreadyCore) {
        const base = graphNodeBaseSizePx(el);
        el.stop(true);
        el.style({ width: base, height: base });
        animateGraphNodeDiameter(el, graphNodeFocusCoreSizePx(el), true);
      }
    }
  }
}

/** 悬停节点：加框 label 置顶（叠放序在 applyGraphNodeStackZIndex 中抬升） */
export function applyGraphHoverHighlight(cy: Core, hoverNodeId: string | null): void {
  cy.batch(() => {
    cy.nodes().removeClass(GRAPH_HOVER_CLASS);
    if (!hoverNodeId) return;
    const el = cy.getElementById(hoverNodeId);
    if (!el.empty() && el.isNode()) el.addClass(GRAPH_HOVER_CLASS);
  });
  applyGraphNodeStackZIndex(cy);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** marked 输出的链接：新窗口打开 */
function withExternalMarkdownLinks(html: string): string {
  return html.replace(/<a\b([^>]*)>/gi, (_full, attrs: string) => {
    let next = String(attrs)
      .replace(/\s*target\s*=\s*(["']).*?\1/gi, '')
      .replace(/\s*rel\s*=\s*(["']).*?\1/gi, '');
    return `<a${next} target="_blank" rel="noopener noreferrer">`;
  });
}

type MarkedLike = { parse: (md: string) => string } | null;

const STANDALONE_DIM_KEEP =
  'node.focus-core, node.focus-nh, node.focus-hover, node.focus-edge-endpoint, node:selected,' +
  'edge.focus-e, edge.focus-edge-hover, edge.focus-edge-selected, edge:selected';

function applyStandaloneGraphDim(cy: Core, hasSelection: boolean): void {
  cy.batch(() => {
    cy.elements().removeClass('graph-dim');
    if (!hasSelection) return;
    const keep = cy.elements(STANDALONE_DIM_KEEP);
    cy.elements().not(keep).addClass('graph-dim');
  });
}

function eyeSvg(open: boolean): string {
  return open
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-4.86"/><path d="m2 2 20 20"/></svg>`;
}

/** 独立 HTML：悬停预览 + 点击高亮 + From/To 筛选 + dim（与 GraphView 浏览态一致） */
export function wireStandaloneGraphInteractions(
  cy: Core,
  payload: GraphExportPayload,
  themeColor: string,
  marked: MarkedLike,
  onHighlightChange?: () => void
): void {
  const previews = payload.notePreviews || {};
  const previewEl = document.getElementById('graph-note-preview');
  const relatedEl = document.getElementById('graph-related-panel');
  const chainLength = Math.max(1, Math.min(3, Math.round(payload.chainLength ?? 1)));
  const connections = payload.connections || [];
  let previewImgIdx = 0;
  let focusedId: string | null = null;
  let hoverId: string | null = null;
  let relatedKeys = new Set<string>();

  const notifyHighlight = () => {
    onHighlightChange?.();
  };

  const applyFocusHighlight = (noteId: string | null) => {
    if (!noteId) {
      applyGraphNeighborHighlight(cy, null, chainLength, null);
      applyStandaloneGraphDim(cy, false);
      notifyHighlight();
      return;
    }
    applyGraphNeighborHighlight(cy, noteId, chainLength, relatedKeys);
    applyStandaloneGraphDim(cy, true);
    notifyHighlight();
  };

  function renderRelatedPanel(): void {
    if (!relatedEl) return;
    if (!focusedId) {
      relatedEl.innerHTML = '';
      return;
    }
    const groups = collectRelatedEdgeLabelEntries(focusedId, connections, chainLength);
    const flat = flattenRelatedEdgeLabelGroups(groups);
    const total = flat.length;
    const selectedCount = flat.reduce((n, e) => n + (relatedKeys.has(e.key) ? 1 : 0), 0);

    const colHtml = (title: string, column: RelatedEdgeLabelColumn, entries: typeof groups.from) => {
      const allOn = entries.length > 0 && entries.every((e) => relatedKeys.has(e.key));
      const rows =
        entries.length === 0
          ? `<p class="text-[11px] text-gray-400">—</p>`
          : `<ul class="space-y-0.5">${entries
              .map((entry) => {
                const checked = relatedKeys.has(entry.key);
                return `<li>
                  <label class="flex cursor-pointer items-center gap-1.5 py-0.5 text-left text-xs ${checked ? 'text-gray-800' : 'text-gray-400'}">
                    <input type="checkbox" data-rel-key="${encodeURIComponent(entry.key)}" ${checked ? 'checked' : ''} class="h-3.5 w-3.5 shrink-0 rounded border-gray-300" style="accent-color:${escapeHtml(themeColor)}" />
                    <span class="min-w-0 flex-1 truncate font-medium" title="${escapeHtml(entry.label)}">${escapeHtml(entry.label)}</span>
                    <span class="shrink-0 tabular-nums text-[10px] text-gray-400">${entry.count}</span>
                  </label>
                </li>`;
              })
              .join('')}</ul>`;
      return `<div class="min-w-0 flex-1">
        <div class="mb-1.5 flex items-center justify-between gap-1">
          <div class="text-[10px] font-semibold uppercase tracking-wide text-gray-400">${title}</div>
          ${
            entries.length > 0
              ? `<button type="button" data-rel-col="${column}" class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="${allOn ? `隐藏全部 ${title}` : `显示全部 ${title}`}">${eyeSvg(allOn)}</button>`
              : ''
          }
        </div>
        ${rows}
      </div>`;
    };

    relatedEl.innerHTML = `
      <div data-allow-context-menu class="relative w-72 sm:w-80 rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col pointer-events-auto bg-white shrink-0" style="max-height:min(40vh,22rem)">
        <div class="shrink-0 flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2.5">
          <div class="min-w-0 flex-1">
            <div class="text-[10px] font-semibold uppercase tracking-wide text-gray-400">关联</div>
            <div class="truncate text-sm font-semibold text-gray-900">
              高亮筛选
              ${total > 0 ? `<span class="ml-1 font-medium text-gray-400">${selectedCount}/${total}</span>` : ''}
            </div>
          </div>
          ${
            total > 0
              ? `<span class="flex shrink-0 gap-1">
                  <button type="button" data-rel-all class="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800">全选</button>
                  <button type="button" data-rel-none class="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800">清空</button>
                </span>`
              : ''
          }
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          ${
            total === 0
              ? `<p class="text-xs text-gray-400">当前关系链内暂无连线。</p>`
              : `<div class="flex gap-4">
                  ${colHtml('From', 'from', groups.from)}
                  <div class="w-px shrink-0 self-stretch bg-gray-100" aria-hidden="true"></div>
                  ${colHtml('To', 'to', groups.to)}
                </div>`
          }
        </div>
      </div>`;

    relatedEl.querySelectorAll<HTMLInputElement>('input[data-rel-key]').forEach((input) => {
      input.addEventListener('change', () => {
        const raw = input.getAttribute('data-rel-key') || '';
        let key = '';
        try {
          key = decodeURIComponent(raw);
        } catch {
          key = raw;
        }
        if (!key) return;
        if (input.checked) relatedKeys.add(key);
        else relatedKeys.delete(key);
        applyFocusHighlight(focusedId);
        renderRelatedPanel();
      });
    });
    relatedEl.querySelectorAll<HTMLButtonElement>('button[data-rel-col]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const col = btn.getAttribute('data-rel-col') as RelatedEdgeLabelColumn | null;
        if (col !== 'from' && col !== 'to') return;
        const entries = col === 'from' ? groups.from : groups.to;
        const keys = entries.map((x) => x.key);
        const allOn = keys.length > 0 && keys.every((k) => relatedKeys.has(k));
        if (allOn) keys.forEach((k) => relatedKeys.delete(k));
        else keys.forEach((k) => relatedKeys.add(k));
        applyFocusHighlight(focusedId);
        renderRelatedPanel();
      });
    });
    relatedEl.querySelector<HTMLButtonElement>('button[data-rel-all]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      relatedKeys = new Set(flat.map((x) => x.key));
      applyFocusHighlight(focusedId);
      renderRelatedPanel();
    });
    relatedEl.querySelector<HTMLButtonElement>('button[data-rel-none]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      relatedKeys = new Set();
      applyFocusHighlight(focusedId);
      renderRelatedPanel();
    });
  }

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
      detailHtml = withExternalMarkdownLinks(String(detailHtml));
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
      <div data-allow-context-menu class="relative w-72 sm:w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden pointer-events-auto flex flex-col shrink-0" style="max-height:min(52vh,28rem)">
        <div class="p-4 pb-2 flex items-start justify-between gap-3 border-b border-gray-100 shrink-0">
          <div class="flex items-start gap-3 flex-1 min-w-0">
            ${p.emoji ? `<span class="text-2xl mt-0.5 shrink-0">${escapeHtml(p.emoji)}</span>` : ''}
            <div class="min-w-0 flex-1">
              <h3 class="text-lg font-bold text-gray-900 leading-tight whitespace-pre-line break-words">${escapeHtml(p.previewTitle)}</h3>
              ${timeRange ? `<div class="mt-1 text-xs text-gray-500 font-medium truncate">${escapeHtml(timeRange)}</div>` : ''}
            </div>
          </div>
        </div>
        <div class="flex-1 overflow-y-auto text-sm min-h-0">
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

  const clearFocus = () => {
    focusedId = null;
    relatedKeys = new Set();
    applyFocusHighlight(null);
    renderRelatedPanel();
    renderPreview();
  };

  cy.on('mouseover', 'node', (evt) => {
    const n = evt.target;
    if (n.hasClass?.('frame-cluster-label') || n.hasClass?.('frame-cluster-halo')) return;
    hoverId = n.id();
    previewImgIdx = 0;
    applyGraphHoverHighlight(cy, hoverId);
    notifyHighlight();
    renderPreview();
  });
  cy.on('mouseout', 'node', () => {
    hoverId = null;
    applyGraphHoverHighlight(cy, null);
    notifyHighlight();
    renderPreview();
  });

  cy.on('tap', 'node', (evt) => {
    cy.elements().unselect();
    const n = evt.target;
    if (n.hasClass?.('frame-cluster-label') || n.hasClass?.('frame-cluster-halo')) return;
    const id = n.id();
    if (focusedId === id) {
      clearFocus();
      return;
    }
    focusedId = id;
    const groups = collectRelatedEdgeLabelEntries(id, connections, chainLength);
    relatedKeys = new Set(flattenRelatedEdgeLabelGroups(groups).map((e) => e.key));
    previewImgIdx = 0;
    applyFocusHighlight(id);
    applyGraphHoverHighlight(cy, hoverId);
    renderRelatedPanel();
    renderPreview();
  });

  cy.on('tap', 'edge', () => {
    cy.elements().unselect();
    clearFocus();
  });

  cy.on('tap', (evt) => {
    if (evt.target === cy) {
      cy.elements().unselect();
      clearFocus();
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
  _cy: Core,
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
}

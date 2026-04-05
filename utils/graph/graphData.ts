import type { Core, ElementDefinition } from 'cytoscape';
import type { Connection, Note, Project } from '../../types';
import { parseNoteContent } from '../../utils';
import { GRAPH_UNTAGGED_TAG_GROUP, mergeGraphLayerState } from './graphRuntimeCore';

// Cytoscape 的 style stylesheet 类型在当前工具链下可能不可用，这里用宽类型避免无关类型检查阻塞。
type Stylesheet = any[];

export type GraphEdgeDirection = 'forward' | 'backward' | 'both' | 'none';

/** 与看板连线逻辑一致：由 arrow / fromArrow / toArrow 推导方向 */
export function connectionToGraphDirection(c: Connection): GraphEdgeDirection {
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

/**
 * 「箭头仅在开端 / source 端、末端无箭头」（backward）时，交换两端便签与锚边及箭头字段，
 * 使语义变为「末端（target）指向开端」即 Cytoscape forward。
 */
export function reverseConnectionEndpoints(c: Connection): Connection {
  const next: Connection = {
    ...c,
    fromNoteId: c.toNoteId,
    toNoteId: c.fromNoteId,
    fromSide: c.toSide,
    toSide: c.fromSide,
    fromArrow: c.toArrow,
    toArrow: c.fromArrow
  };
  if (next.fromArrow != null || next.toArrow != null) {
    delete next.arrow;
  } else {
    if (c.arrow === 'reverse') next.arrow = 'forward';
    else if (c.arrow === 'forward') next.arrow = 'reverse';
  }
  return next;
}

/**
 * 打开项目时整理连线：删除端点便签已不存在的边；将仅开端带箭头的边规范为交换端点后的 forward。
 */
export function normalizeProjectConnections(project: Project): { project: Project; mutated: boolean } {
  const noteIds = new Set(project.notes.map((n) => n.id));
  const raw = project.connections ?? [];
  let mutated = false;
  const next: Connection[] = [];

  for (const c of raw) {
    if (!noteIds.has(c.fromNoteId) || !noteIds.has(c.toNoteId)) {
      mutated = true;
      continue;
    }
    let row: Connection = c;
    if (
      c.labelAnchorNoteId != null &&
      c.labelAnchorNoteId !== c.fromNoteId &&
      c.labelAnchorNoteId !== c.toNoteId
    ) {
      row = { ...row };
      delete row.labelAnchorNoteId;
      mutated = true;
    }
    if (connectionToGraphDirection(row) === 'backward') {
      row = reverseConnectionEndpoints(row);
      mutated = true;
    }
    next.push(row);
  }

  if (!mutated) {
    return { project, mutated: false };
  }
  return { project: { ...project, connections: next }, mutated: true };
}

function noteNodeColor(note: Note, fallback: string): string {
  if (note.tags?.length) {
    const t = note.tags[0];
    if (t.color) return t.color;
  }
  if (note.color) return note.color;
  return fallback;
}

/** 首行（换行符前），与 parseNoteContent 一致 */
function graphNoteFirstLine(text: string): string {
  const t = (text || '').trim();
  if (!t) return '';
  const br = t.indexOf('\n');
  return br === -1 ? t : t.slice(0, br);
}

/**
 * 关系图节点短标题：先按换行取首行，再按英文/中文逗号取逗号前一段（与便签「标题, 副标题」习惯一致）
 */
function graphNoteShortTitle(text: string): string {
  const line = graphNoteFirstLine(text).replace(/^#+\s+/, '').trim();
  if (!line) return '便签';
  const parts = line.split(/[,，]/, 2);
  const head = (parts[0] ?? '').trim();
  return head || '便签';
}

function noteLabel(note: Note): string {
  const short = graphNoteShortTitle(note.text || '');
  const raw = `${note.emoji || ''}${short}`.trim();
  return raw.length > 48 ? `${raw.slice(0, 45)}…` : raw;
}

/** 与关联面板检索一致，供顶栏节点定位等复用 */
export function graphNoteSearchLabel(note: Note): string {
  const short = graphNoteShortTitle(note.text || '');
  const raw = `${note.emoji || ''}${short}`.trim();
  return raw || '便签';
}

function yearLabel(note: Note): string {
  if (note.startYear == null) return '';
  if (note.endYear != null && note.endYear !== note.startYear) {
    return `${note.startYear}–${note.endYear}`;
  }
  return String(note.startYear);
}

export function buildGraphElements(
  notes: Note[],
  connections: Connection[],
  themeColor: string,
  edgeWeightBase?: number,
  tagLayerWeights?: Record<string, number>
): ElementDefinition[] {
  const noteById = new Map<string, Note>();
  notes.forEach((n) => noteById.set(n.id, n));
  const noteIds = new Set(noteById.keys());

  // edgeWeight 本质上用于连线粗细映射；你的需求需要让“收藏端点数”对每条边生效，
  // 因此这里为每条边计算出独立的 line width 数据字段（供样式表 data(...) 引用）。
  const baseEdgeWeight = edgeWeightBase ?? DEFAULT_GRAPH_STYLESHEET_SIZING.edgeWeight;
  // Cytoscape 的箭头几何由 `arrow-scale` 控制；但其内部对小线宽存在最小值截断，
  // 导致箭头尺寸在小边权上会“看起来不随边权变化”。这里显式把 arrow-scale
  // 与 edgeWeight 的等比缩放绑定起来，并保持当前基准外观（默认对应 0.8）。
  const EDGE_ARROW_SCALE_BASE = 0.8;
  const EDGE_ARROW_SCALE_MIN_FACTOR = 0.25;
  // 当边权进入“较大步进”区间时，避免箭头尺寸随 edgeWidth 近似线性增长过快。
  // 小于等于 baseEdgeWidth 的区间保持原逻辑（edge=0.2 时的观感锚定），
  // 大于 baseEdgeWidth 时用低于 1 的幂次做衰减。
  const EDGE_ARROW_WIDTH_GROWTH_HIGH_EXP = 0.75;
  // Cytoscape 内部 getArrowWidth 实际为：
  //   size = max((edgeWidth * 13.37)^0.9, 29) * arrow-scale
  // 我们按这个公式反推一个 arrow-scale，使“箭头端点尺寸”随 edgeWidth 单调增长；
  // 同时把最小 edgeWidth 对应的箭头尺寸压到当前的一半（通过 EDGE_ARROW_SCALE_MIN_FACTOR 实现）。
  const arrowWidthDenom = (edgeWidth: number) => Math.max(Math.pow(edgeWidth * 13.37, 0.9), 29);

  const getArrowScaleForEdgeWidth = (
    edgeWidth: number,
    baseEdgeWidth: number,
    minEdgeWidth: number
  ): number => {
    const safeBase = baseEdgeWidth > 0 ? baseEdgeWidth : 1;
    const safeMin = minEdgeWidth > 0 ? minEdgeWidth : 1;
    const baseDenom = arrowWidthDenom(safeBase);
    const denom = arrowWidthDenom(edgeWidth);

    // 在 [minEdgeWidth, baseEdgeWidth] 内做 minFactor -> 1 的过渡；
    // 在 baseEdgeWidth 及以上进入“衰减增长”以减少大步进造成的箭头过大。
    const range = safeBase - safeMin;
    const t = range <= 1e-6 ? 1 : Math.max(0, Math.min(1, (edgeWidth - safeMin) / range));
    const factor = EDGE_ARROW_SCALE_MIN_FACTOR + (1 - EDGE_ARROW_SCALE_MIN_FACTOR) * t; // minFactor..1

    const growthExp = edgeWidth <= safeBase ? 1 : EDGE_ARROW_WIDTH_GROWTH_HIGH_EXP;

    // 目标 arrowWidth：先用 baseEdgeWidth 对齐到 EDGE_ARROW_SCALE_BASE，再乘因子与衰减幂次。
    const baseArrowWidth = EDGE_ARROW_SCALE_BASE * baseDenom;
    const targetArrowWidth =
      baseArrowWidth * factor * Math.pow(edgeWidth / safeBase, growthExp);

    // arrow-scale = targetArrowWidth / denom
    return targetArrowWidth / denom;
  };
  const edgeWeightToLines = (edgeWeight: number) => {
    const ewNorm = (Math.max(0.1, edgeWeight) - 0.1) / 0.9;
    const edgeLine = Math.max(
      0.4,
      Math.min(4.6, Math.round((0.4 + ewNorm * 2.8) * 100) / 100)
    );
    const edgeLineFocus = Math.max(
      0.8,
      Math.min(6.6, Math.round((edgeLine * 1.35) * 100) / 100)
    );
    const edgeLineHi = Math.max(
      0.8,
      Math.min(9.2, Math.round((edgeLine * 1.85) * 100) / 100)
    );
    return { edgeLine, edgeLineFocus, edgeLineHi };
  };
  // 箭头缩放的“参照基准”固定为默认 edgeWeight，避免当面板 edgeWeight 变大时，
  // 基准系数反向变化，导致在 clamp 到上限的粗边上出现“越大越小”的真实反比。
  const refLines = edgeWeightToLines(DEFAULT_GRAPH_STYLESHEET_SIZING.edgeWeight);
  const refEdgeLine = refLines.edgeLine;
  const refEdgeLineFocus = refLines.edgeLineFocus;
  const refEdgeLineHi = refLines.edgeLineHi;

  const linkedIds = new Set<string>();
  for (const c of connections) {
    if (!noteIds.has(c.fromNoteId) || !noteIds.has(c.toNoteId)) continue;
    linkedIds.add(c.fromNoteId);
    linkedIds.add(c.toNoteId);
  }

  const stackOrder = [...notes].sort((a, b) => {
    const oa = a.layerStackOrder ?? a.createdAt;
    const ob = b.layerStackOrder ?? b.createdAt;
    if (oa !== ob) return oa - ob;
    return a.id.localeCompare(b.id);
  });
  const stackZById = new Map<string, number>();
  stackOrder.forEach((n, i) => stackZById.set(n.id, 2 + i));

  const nodes: ElementDefinition[] = notes.map((note) => {
      const rawTag = note.tags?.[0]?.label?.trim() ?? '';
      const tagGroup = rawTag !== '' ? rawTag : GRAPH_UNTAGGED_TAG_GROUP;
      const rawTagLayerW = Number(tagLayerWeights?.[tagGroup] ?? 0.5);
      const tagLayerW = Math.min(
        1,
        Math.max(0.1, Number.isFinite(rawTagLayerW) ? rawTagLayerW : 0.5)
      );
      /** 0～1，与图层面板半径权重一致；力导 idealEdgeLength 单独引用，增强 tag 对边长的影响 */
      const tagLayerNorm = (tagLayerW - 0.1) / 0.9;
      const main = noteLabel(note);
      const yl = yearLabel(note);
      /** 单行：时间在主标题右侧（用 em 空格拉开，避免框过窄过高） */
      const label = yl ? `${main}\u2003\u2003${yl}` : main;
      return {
        data: {
          id: note.id,
          label,
          fullTitle: parseNoteContent(note.text || '').title || '便签',
          year: yl,
          timeSort: note.startYear != null ? note.startYear : undefined,
          color: noteNodeColor(note, themeColor),
          layerItemHidden: Boolean(note.layerItemHidden),
          stackZ: stackZById.get(note.id) ?? 2,
          /** 0~1：图中“相对层级(level)”归一化分数（后续在本函数末尾填充） */
          levelNorm: 0,
          /** 图谱「按标签分组网格」用：无首个标签时归入 GRAPH_UNTAGGED_TAG_GROUP，避免被样式表隐藏 */
          tagGroup,
          /**
           * 图谱「按帧(frame)分簇」用：
           * - `frameGroups`：该便签所属的多个 frames（按便签数据里的顺序）
           * - `frameGroup`：兼容旧逻辑的首帧归属（仍保留，但真正的归属会在运行时按 hidden 动态跳过）
           */
          frameGroups: (() => {
            const raw =
              note.groupIds?.length
                ? note.groupIds
                : note.groupId
                  ? [note.groupId]
                  : note.groupNames?.length
                    ? note.groupNames
                    : note.groupName
                      ? [note.groupName]
                      : [];
            return raw.map((x) => String(x).trim()).filter((x) => x !== '');
          })(),
          frameGroup: String(
            note.groupIds?.[0] ?? note.groupId ?? note.groupNames?.[0] ?? note.groupName ?? ''
          ).trim(),
          tagHint: note.tags?.map((t) => t.label).join(' · ') || '',
          tagLayerNorm,
          favorite: note.isFavorite ? 'yes' : 'no',
          graphLinked: linkedIds.has(note.id) ? 'yes' : 'no'
        }
      };
    });

  // ---- level（相对层级，连续值）----
  // 仅使用“有效单向边”参与：forward/backward；排除 both/none（不提供层级约束）
  const nodeIds = notes.map((n) => n.id);
  const dirEdges: Array<{ u: string; v: string; w: number }> = [];
  for (const c of connections) {
    if (!noteIds.has(c.fromNoteId) || !noteIds.has(c.toNoteId)) continue;
    const dir = connectionToGraphDirection(c);
    if (dir !== 'forward' && dir !== 'backward') continue;
    const u = dir === 'forward' ? c.fromNoteId : c.toNoteId; // u -> v
    const v = dir === 'forward' ? c.toNoteId : c.fromNoteId;
    if (u === v) continue;
    // 用现有 edgeWeight 作为约束权重的近似（越粗的边通常语义越强）
    // edgeWeight 在后面也会算，这里先用 1，随后用节点/边数据再校准也不影响稳定性。
    dirEdges.push({ u, v, w: 1 });
  }

  // 用 soft 约束拟合层级：希望 L(v) - L(u) >= margin；允许违背但惩罚
  // logistic loss: log(1 + exp(margin - (Lv - Lu))) + l2
  const level = new Map<string, number>();
  nodeIds.forEach((id) => {
    const note = noteById.get(id);
    const t = note?.startYear;
    // 有时间时用时间做一个温和初始化（更快收敛）；无时间则 0
    level.set(id, t != null && Number.isFinite(t) ? Number(t) : 0);
  });
  const levelVals0 = nodeIds.map((id) => level.get(id) ?? 0);
  const min0 = Math.min(...levelVals0, 0);
  const max0 = Math.max(...levelVals0, 0);
  if (max0 - min0 > 1e-6) {
    nodeIds.forEach((id) => {
      const x = level.get(id) ?? 0;
      level.set(id, (x - min0) / (max0 - min0));
    });
  }

  const margin = 0.08;
  const lr = 0.06;
  const l2 = 0.0025;
  const iters = Math.max(60, Math.min(240, Math.round(18 + dirEdges.length * 0.12)));
  for (let iter = 0; iter < iters; iter += 1) {
    // 简单洗牌（Fisher–Yates）
    for (let i = dirEdges.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = dirEdges[i];
      dirEdges[i] = dirEdges[j];
      dirEdges[j] = tmp;
    }
    for (const e of dirEdges) {
      const lu = level.get(e.u) ?? 0;
      const lv = level.get(e.v) ?? 0;
      const d = lv - lu;
      const z = margin - d;
      // sigmoid(z) = 1 / (1 + exp(-z))
      const s = 1 / (1 + Math.exp(-z));
      const g = s * e.w;
      // 梯度：∂/∂lu = +g , ∂/∂lv = -g （推动 lv-lu 变大）
      const du = g + l2 * lu;
      const dv = -g + l2 * lv;
      level.set(e.u, lu - lr * du);
      level.set(e.v, lv - lr * dv);
    }
  }

  // 归一化到 0~1（分位数，抗极端值）
  const lvAll = nodeIds.map((id) => level.get(id) ?? 0).sort((a, b) => a - b);
  const q = (p: number) => {
    if (lvAll.length === 0) return 0;
    const idx = Math.max(0, Math.min(lvAll.length - 1, Math.round(p * (lvAll.length - 1))));
    return lvAll[idx];
  };
  const p10 = q(0.1);
  const p90 = q(0.9);
  const span = Math.abs(p90 - p10) < 1e-9 ? 1 : (p90 - p10);
  const levelNormById = new Map<string, number>();
  nodeIds.forEach((id) => {
    const s = level.get(id) ?? 0;
    levelNormById.set(id, Math.max(0, Math.min(1, (s - p10) / span)));
  });

  nodes.forEach((n) => {
    const id = String(n.data?.id ?? '');
    if (!id) return;
    (n.data as any).levelNorm = levelNormById.get(id) ?? 0;
  });

  const edges: ElementDefinition[] = [];
  for (const c of connections) {
    if (!noteIds.has(c.fromNoteId) || !noteIds.has(c.toNoteId)) continue;
    const direction = connectionToGraphDirection(c);

    const edgeUntagged = 'no';

    const fromFav = Boolean(noteById.get(c.fromNoteId)?.isFavorite);
    const toFav = Boolean(noteById.get(c.toNoteId)?.isFavorite);
    const favEndpointCount = (fromFav ? 1 : 0) + (toFav ? 1 : 0);
    const fromTag = noteById.get(c.fromNoteId)?.tags?.[0]?.label?.trim() ?? '';
    const toTag = noteById.get(c.toNoteId)?.tags?.[0]?.label?.trim() ?? '';
    const fromTagWeight = fromTag ? Number(tagLayerWeights?.[fromTag] ?? 0.5) : 0.5;
    const toTagWeight = toTag ? Number(tagLayerWeights?.[toTag] ?? 0.5) : 0.5;
    const tagAvgWeight = (fromTagWeight + toTagWeight) / 2;
    const tagNorm = (Math.max(0.1, Math.min(1, tagAvgWeight)) - 0.1) / 0.9;
    // tag 权重越高，连线越粗；以 0.5 作为中位基准，不改 edge label 字号逻辑。
    const tagBoost = Math.max(0, tagNorm - 0.5) * 1.2;
    const edgeWeight = baseEdgeWeight + favEndpointCount * 0.5 + tagBoost;
    let { edgeLine, edgeLineFocus, edgeLineHi } = edgeWeightToLines(edgeWeight);

    // 分普通/收藏加粗/收藏高亮态：minEdgeWidth 由 edgeWeightToLines 的 clamp 决定。
    // level → 边粗度/长度（跨层越大越显著；用于“辐射/层级跨度”的可视化）
    // 仅对有效单向边生效，排除 both/none。
    let edgeIdealLenFactor = 1;
    let widthFactor = 1;
    if (direction === 'forward' || direction === 'backward') {
      const a = direction === 'forward' ? c.fromNoteId : c.toNoteId; // source (语义起点)
      const b = direction === 'forward' ? c.toNoteId : c.fromNoteId; // target
      const la = levelNormById.get(a) ?? 0;
      const lb = levelNormById.get(b) ?? 0;
      const d = Math.max(0, lb - la); // “顺层”跨度；跨层/回指不作为辐射依据
      const edgeSpan = Math.min(1, Math.max(0, d / 0.6)); // 经验尺度：0.6 视为“大跨度”
      // 线宽步进拉开一些：让跨度大的边更明显
      widthFactor = 0.85 + (2.25 - 0.85) * Math.pow(edgeSpan, 1.65); // 0.85..2.25
      // 长度强调“源头辐射”：source 越靠源头（level 越小），边越长；同时叠加层级跨度。
      const sourceRootness = Math.max(0, Math.min(1, 1 - la)); // 1=最源头，0=最末端
      // 增强对比：让前 20% 源头的边明显更长（更陡的非线性）
      const rootBoost = 0.9 + 3.1 * Math.pow(sourceRootness, 2.2); // 0.9..4.0
      const spanBoost = 1.0 + 1.2 * Math.pow(edgeSpan, 1.35); // 1.0..2.2
      edgeIdealLenFactor = rootBoost * spanBoost; // 0.9..~8.8（布局侧会夹紧到 4.0）
      edgeLine = Math.max(0.25, edgeLine * widthFactor);
      edgeLineFocus = Math.max(0.35, edgeLineFocus * widthFactor);
      edgeLineHi = Math.max(0.4, edgeLineHi * widthFactor);
    }

    // 箭头步进阻尼：线宽可以更粗，但箭头几何不要等比暴涨。
    // 用 widthFactor 的较小指数参与箭头计算，并对最终 arrow-scale 做上限夹紧。
    const arrowWidthFactor = Math.pow(Math.max(0.6, Math.min(2.25, widthFactor)), 0.55);
    const edgeArrowScale = Math.min(
      1.35,
      Math.max(0.15, getArrowScaleForEdgeWidth(edgeLine / Math.max(1e-6, widthFactor) * arrowWidthFactor, refEdgeLine, 0.4))
    );
    const edgeArrowScaleFocus = Math.min(
      1.35,
      Math.max(
        0.15,
        getArrowScaleForEdgeWidth(
          edgeLineFocus / Math.max(1e-6, widthFactor) * arrowWidthFactor,
          refEdgeLineFocus,
          0.8
        )
      )
    );
    const edgeArrowScaleHi = Math.min(
      1.35,
      Math.max(
        0.15,
        getArrowScaleForEdgeWidth(
          edgeLineHi / Math.max(1e-6, widthFactor) * arrowWidthFactor,
          refEdgeLineHi,
          0.8
        )
      )
    );

    edges.push({
      data: {
        id: c.id,
        source: c.fromNoteId,
        target: c.toNoteId,
        label: c.label || '',
        direction,
        edgeWeight,
        // 兼容样式表字段；无标签便签已归入「无标签」分组，此处恒为可见
        edgeUntagged,
        // 用于样式表中按数据决定连线粗细
        edgeLineWidth: edgeLine,
        edgeLineFocusWidth: edgeLineFocus,
        edgeLineHiWidth: edgeLineHi,
        // 用于力导 idealEdgeLength：让源头边更长、更像辐射
        edgeIdealLenFactor,
        // 用于样式表中按数据决定箭头端点几何大小
        edgeArrowScale,
        edgeArrowScaleFocus,
        edgeArrowScaleHi
      }
    });
  }

  return [...nodes, ...edges];
}

/** 仅便签 id 集合：用于决定何时重建 Cytoscape（连线增删用增量同步，避免非力导向布局被重算） */
export function graphNodeStructureKey(notes: Note[]): string {
  return notes
    .map((x) => x.id)
    .sort()
    .join(',');
}

export function graphStructureKey(notes: Note[], connections: Connection[]): string {
  const n = notes
    .map((x) => x.id)
    .sort()
    .join(',');
  const e = connections
    .map((c) => c.id)
    .sort()
    .join(',');
  return `${n}|${e}`;
}

export type GraphStylesheetSizing = {
  nodeSize: number;
  labelFontPx: number;
  edgeWeight: number;
};

export const DEFAULT_GRAPH_STYLESHEET_SIZING: GraphStylesheetSizing = {
  nodeSize: 28,
  labelFontPx: 10,
  edgeWeight: 0.3
};

/** 关系链/选点高亮中心（focus-core）相对邻居（focus-nh）的节点缩放，便于区分 */
export const GRAPH_FOCUS_CORE_NODE_SCALE = 1.5;

function mergeGraphSizing(partial?: Partial<GraphStylesheetSizing>): GraphStylesheetSizing {
  const o = { ...DEFAULT_GRAPH_STYLESHEET_SIZING };
  if (partial?.nodeSize != null && Number.isFinite(partial.nodeSize)) {
    o.nodeSize = Math.min(36, Math.max(1, partial.nodeSize));
  }
  if (partial?.labelFontPx != null && Number.isFinite(partial.labelFontPx)) {
    o.labelFontPx = Math.min(16, Math.max(4, partial.labelFontPx));
  }
  if (partial?.edgeWeight != null && Number.isFinite(partial.edgeWeight)) {
    o.edgeWeight = Math.min(4, Math.max(0.1, Math.round(partial.edgeWeight * 10) / 10));
  }
  return o;
}

/** 节点/标签尺寸 → 样式表各 px 字段 */
function graphSizingCss(themeColor: string, s: GraphStylesheetSizing) {
  const ns = s.nodeSize;
  const nf = s.labelFontPx;
  const ew = s.edgeWeight;
  // 注意：ewNorm 不再在 1 上截断，避免当边因收藏端点而加粗后出现“上限截平”。
  const ewNorm = (Math.max(0.1, ew) - 0.1) / 0.9;
  const px = (n: number) => `${n}px`;
  const pad = Math.max(4, Math.round(nf * 0.8));
  /** 标签与节点间距：随字号留底限，并按节点直径相对默认 28px 缩放，小节点时间距同步收紧 */
  const refNs = DEFAULT_GRAPH_STYLESHEET_SIZING.nodeSize;
  const baseGap = Math.max(4, Math.round(nf * 0.8));
  const marginY = Math.max(2, Math.round((ns / refNs) * baseGap));
  const coreScale = GRAPH_FOCUS_CORE_NODE_SCALE;
  const nsCore = Math.round(ns * coreScale * 100) / 100;
  const favScale = 1.5;
  const favNs = ns * favScale;
  const favNf = nf * favScale;
  const padFav = Math.max(4, Math.round(favNf * 0.8));
  const baseGapFav = Math.max(4, Math.round(favNf * 0.8));
  const marginYFav = Math.max(2, Math.round((favNs / refNs) * baseGapFav));
  const favNsCore = Math.round(favNs * coreScale * 100) / 100;
  const marginYCore = Math.max(2, Math.round(marginY * coreScale));
  const marginYFavCore = Math.max(2, Math.round(marginYFav * coreScale));

  // 连线权重同时联动默认节点白描边（普通与收藏态均复用同一 ewNorm）。
  const borderBase = Math.max(0.2, Math.min(0.6, Math.round((ns * 0.071) * (0.1 + 0.2 * ewNorm) * 100) / 100));
  const borderBaseFav = Math.max(
    0.2,
    Math.min(0.6, Math.round((favNs * 0.071) * (0.1 + 0.2 * ewNorm) * 100) / 100)
  );
  const borderNh = Math.max(3, Math.min(8, Math.round(ns * 0.11)));
  const borderNhFav = Math.max(3, Math.min(8, Math.round(favNs * 0.11)));
  const borderCore = Math.max(4, Math.min(10, Math.round(ns * 0.14)));
  const borderCoreFav = Math.max(4, Math.min(10, Math.round(favNs * 0.14)));
  const borderSel = Math.max(3, Math.min(8, Math.round(ns * 0.11)));
  const borderSelFav = Math.max(3, Math.min(8, Math.round(favNs * 0.11)));
  const txtBorder = Math.max(1.5, Math.min(3, nf * 0.2));
  const txtBorderFav = Math.max(1.5, Math.min(3, favNf * 0.2));
  const txtBorderHi = Math.max(2, Math.min(4, nf * 0.24));
  const txtBorderHiFav = Math.max(2, Math.min(4, favNf * 0.24));
  const edgeLine = Math.max(0.4, Math.min(4.6, Math.round((0.4 + ewNorm * 2.8) * 100) / 100));
  // edge label 字号整体收缩（包括 margin 与描边厚度），避免在小边权下视觉显得过大
  const EDGE_LABEL_SCALE = 0.5;
  const edgeFont = Math.max(6, Math.min(32, Math.round((6 + ewNorm * 10) * 10) / 10));
  const edgeFontScaled = Math.max(3, edgeFont * EDGE_LABEL_SCALE);
  const edgeMarginY = Math.max(2, Math.round(edgeFontScaled * 0.72));
  const edgeOutline = Math.max(0.6, Math.min(1.4, Math.round((0.6 + ewNorm * 0.8) * 100) / 100));
  // 高亮态 label 描边不受面板 edgeWeight 影响：固定为当前最大值(1.4)的 4 倍。
  const edgeOutlineHighlight = 5.6 * EDGE_LABEL_SCALE;
  const edgeLineFocus = Math.max(0.8, Math.min(6.6, Math.round((edgeLine * 1.35) * 100) / 100));
  const edgeLineHi = Math.max(0.8, Math.min(9.2, Math.round((edgeLine * 1.85) * 100) / 100));
  const vpEdgeOff = Math.max(48, Math.round(ns * 3.2));
  return {
    ns,
    favNs,
    nf,
    favNf,
    px,
    pad,
    padFav,
    marginY,
    marginYFav,
    nsCore,
    favNsCore,
    marginYCore,
    marginYFavCore,
    borderBase,
    borderBaseFav,
    borderNh,
    borderNhFav,
    borderCore,
    borderCoreFav,
    borderSel,
    borderSelFav,
    txtBorder,
    txtBorderFav,
    txtBorderHi,
    txtBorderHiFav,
    edgeLine,
    edgeLineFocus,
    edgeLineHi,
    edgeFont: edgeFontScaled,
    edgeMarginY,
    edgeOutline,
    edgeOutlineHighlight,
    vpEdgeOff,
    themeColor
  };
}

export function getGraphStylesheet(
  themeColor: string,
  sizingPartial?: Partial<GraphStylesheetSizing>
): Stylesheet {
  const sizing = mergeGraphSizing(sizingPartial);
  const z = graphSizingCss(themeColor, sizing);
  return [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        'background-color': 'data(color)',
        // 交互命中区域：比视觉半径外扩 2px（不改变渲染尺寸）
        'bounds-expansion': 2,
        /** 未选中：与地图 label 未强调态一致的浅灰字，无衬底 */
        color: '#9ca3af',
        'text-valign': 'bottom',
        'text-margin-y': z.marginY,
        'font-size': z.px(z.nf),
        'font-weight': '600',
        'line-height': 1,
        width: z.ns,
        height: z.ns,
        'border-width': z.borderBase,
        'border-color': '#ffffff',
        'text-background-opacity': 0,
        'text-border-width': 0,
        /** 显式压低默认节点，便于高亮连线画在邻居节点之上 */
        'z-index': 1,
        /** 与 edge 同用 manual，否则 auto 下边永远在节点下方，z-index 无效 */
        'z-index-compare': 'manual'
      }
    },
    {
      selector: 'node[graphLinked = "no"]',
      style: {
        opacity: 0.42
      }
    },
    {
      selector: 'node[favorite = "yes"]',
      style: {
        'text-margin-y': z.marginYFav,
        'font-size': z.px(z.favNf),
        width: z.favNs,
        height: z.favNs,
        'border-width': z.borderBaseFav
      }
    },
    {
      selector: 'node:selected',
      style: {
        opacity: 1,
        'border-width': z.borderSel,
        'border-color': z.themeColor
      }
    },
    {
      selector: 'node:selected[favorite = "yes"]',
      style: {
        opacity: 1,
        'border-width': z.borderSelFav,
        'border-color': z.themeColor
      }
    },
    /** 与选中点相连：白底描边 label；低于高亮连线，高于普通节点 */
    {
      selector: 'node.focus-nh',
      style: {
        'border-width': z.borderNh,
        'border-color': z.themeColor,
        opacity: 1,
        color: '#000000',
        'font-weight': '500',
        'font-size': z.px(z.nf),
        'line-height': 1,
        'text-background-color': '#ffffff',
        'text-background-opacity': 1,
        'text-background-padding': z.pad,
        'text-background-shape': 'roundrectangle',
        'text-border-color': z.themeColor,
        'text-border-width': z.txtBorder,
        'text-border-opacity': 1,
        'z-index': 14000
      }
    },
    {
      selector: 'node.focus-nh[favorite = "yes"]',
      style: {
        color: z.themeColor,
        'font-weight': 'bold',
        'border-width': z.borderNhFav,
        'font-size': z.px(z.favNf),
        'text-background-padding': z.padFav,
        'text-border-width': z.txtBorderHiFav
      }
    },
    /** 选中边时两端便签：与 focus-nh 同视觉（独立类名，便于与节点焦点高亮互斥清理） */
    {
      selector: 'node.focus-edge-endpoint',
      style: {
        'border-width': z.borderNh,
        'border-color': z.themeColor,
        opacity: 1,
        color: '#000000',
        'font-weight': '500',
        'font-size': z.px(z.nf),
        'line-height': 1,
        'text-background-color': '#ffffff',
        'text-background-opacity': 1,
        'text-background-padding': z.pad,
        'text-background-shape': 'roundrectangle',
        'text-border-color': z.themeColor,
        'text-border-width': z.txtBorder,
        'text-border-opacity': 1,
        'z-index': 14000
      }
    },
    {
      selector: 'node.focus-edge-endpoint[favorite = "yes"]',
      style: {
        color: z.themeColor,
        'font-weight': 'bold',
        'border-width': z.borderNhFav,
        'font-size': z.px(z.favNf),
        'text-background-padding': z.padFav,
        'text-border-width': z.txtBorderHiFav
      }
    },
    /** 选中（焦点中心）：白底框；高于高亮连线（端点盖住连线） */
    {
      selector: 'node.focus-core',
      style: {
        opacity: 1,
        width: z.nsCore,
        height: z.nsCore,
        'text-margin-y': z.marginYCore,
        'border-width': z.borderCore,
        'border-color': z.themeColor,
        color: '#000000',
        'font-weight': '500',
        'font-size': z.px(z.nf),
        'line-height': 1,
        'text-background-color': '#ffffff',
        'text-background-opacity': 1,
        'text-background-padding': z.pad,
        'text-background-shape': 'roundrectangle',
        'text-border-color': z.themeColor,
        'text-border-width': z.txtBorder,
        'text-border-opacity': 1,
        'z-index': 16000
      }
    },
    {
      selector: 'node.focus-core[favorite = "yes"]',
      style: {
        opacity: 1,
        width: z.favNsCore,
        height: z.favNsCore,
        'text-margin-y': z.marginYFavCore,
        color: z.themeColor,
        'font-weight': 'bold',
        'border-width': z.borderCoreFav,
        'font-size': z.px(z.favNf),
        'text-background-padding': z.padFav,
        'text-border-width': z.txtBorderHiFav
      }
    },
    /** 悬停：同焦点加框样式，层级最高 */
    {
      selector: 'node.focus-hover',
      style: {
        opacity: 1,
        'border-width': z.borderCore,
        'border-color': z.themeColor,
        color: '#000000',
        'font-weight': '500',
        'font-size': z.px(z.nf),
        'line-height': 1,
        'text-background-color': '#ffffff',
        'text-background-opacity': 1,
        'text-background-padding': z.pad,
        'text-background-shape': 'roundrectangle',
        'text-border-color': z.themeColor,
        'text-border-width': z.txtBorder,
        'text-border-opacity': 1,
        'z-index': 17000
      }
    },
    {
      selector: 'node.focus-hover[favorite = "yes"]',
      style: {
        opacity: 1,
        color: z.themeColor,
        'font-weight': 'bold',
        'border-width': z.borderCoreFav,
        'font-size': z.px(z.favNf),
        'text-background-padding': z.padFav,
        'text-border-width': z.txtBorderHiFav
      }
    },
    {
      selector: 'edge',
      style: {
        label: 'data(label)',
        opacity: 0.4,
        'line-color': '#d1d5db',
        width: 'data(edgeLineWidth)',
        'arrow-scale': 'data(edgeArrowScale)',
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        'target-arrow-color': '#d1d5db',
        'source-arrow-shape': 'none',
        'font-size': z.px(z.edgeFont),
        'text-rotation': 'autorotate',
        'text-margin-y': -z.edgeMarginY,
        color: '#9ca3af',
        // 普通边始终在节点下方（悬停/选中/高亮边会在下面的 selector 里抬高）
        'z-index': -1,
        'z-index-compare': 'manual'
      }
    },
    {
      selector: 'edge[direction = "forward"]',
      style: {
        'source-arrow-shape': 'none',
        'target-arrow-shape': 'triangle'
      }
    },
    {
      selector: 'edge[direction = "backward"]',
      style: {
        'source-arrow-shape': 'triangle',
        'target-arrow-shape': 'none',
        'source-arrow-color': '#d1d5db'
      }
    },
    {
      selector: 'edge[direction = "both"]',
      style: {
        'source-arrow-shape': 'triangle',
        'target-arrow-shape': 'triangle',
        'source-arrow-color': '#d1d5db'
      }
    },
    {
      selector: 'edge[direction = "none"]',
      style: {
        'source-arrow-shape': 'none',
        'target-arrow-shape': 'none'
      }
    },
    {
      selector: 'edge:selected',
      style: {
        opacity: 1,
        'line-color': z.themeColor,
        'target-arrow-color': z.themeColor,
        'source-arrow-color': z.themeColor,
        'z-index': 15000
      }
    },
    {
      selector: 'edge.focus-e',
      style: {
        opacity: 1,
        'line-color': z.themeColor,
        'target-arrow-color': z.themeColor,
        'source-arrow-color': z.themeColor,
        width: 'data(edgeLineFocusWidth)',
        'arrow-scale': 'data(edgeArrowScaleFocus)',
        /** 高于 focus-nh(14000)，低于 focus-core(16000)，避免被邻居节点与其它未高亮点挡住 */
        'z-index': 15000,
        'font-weight': '600',
        color: '#374151',
        'text-outline-width': z.edgeOutlineHighlight,
        'text-outline-color': '#ffffff',
        'text-outline-opacity': 1
      }
    },
    /** 悬停边：整段连线与 label 置顶（高于节点 focus-hover） */
    {
      selector: 'edge.focus-edge-hover',
      style: {
        opacity: 1,
        'line-color': z.themeColor,
        'target-arrow-color': z.themeColor,
        'source-arrow-color': z.themeColor,
        width: 'data(edgeLineHiWidth)',
        'arrow-scale': 'data(edgeArrowScaleHi)',
        'z-index': 30000,
        'font-weight': '600',
        color: '#374151',
        'text-outline-width': z.edgeOutlineHighlight,
        'text-outline-color': '#ffffff',
        'text-outline-opacity': 1
      }
    },
    /** 面板/状态选中的边（cy 内未保持 :selected，用类控制；层级高于悬停边） */
    {
      selector: 'edge.focus-edge-selected',
      style: {
        opacity: 1,
        'line-color': z.themeColor,
        'target-arrow-color': z.themeColor,
        'source-arrow-color': z.themeColor,
        width: 'data(edgeLineHiWidth)',
        'arrow-scale': 'data(edgeArrowScaleHi)',
        'z-index': 35000,
        'font-weight': '600',
        color: '#374151',
        'text-outline-width': z.edgeOutlineHighlight,
        'text-outline-color': '#ffffff',
        'text-outline-opacity': 1
      }
    },
    /**
     * 仅一端在视口内时：主 label 改到屏内端（source-label / target-label），避免放大后中点在屏外。
     * 由 applyGraphEdgeLabelViewportPlacement 挂类 edge-lbl-vp-src | edge-lbl-vp-tgt。
     */
    {
      selector:
        'edge.focus-e.edge-lbl-vp-src, edge.focus-edge-hover.edge-lbl-vp-src, edge.focus-edge-selected.edge-lbl-vp-src',
      style: {
        label: '',
        'source-label': 'data(label)',
        'target-label': '',
        /** 沿边远离 source 端（屏内可见节点），避免贴在节点旁 */
        'source-text-offset': z.vpEdgeOff,
        'source-text-rotation': 'autorotate',
        'source-text-margin-y': -z.edgeMarginY,
        'font-size': z.px(z.edgeFont),
        'font-weight': '600',
        color: '#374151',
        'text-outline-width': z.edgeOutlineHighlight,
        'text-outline-color': '#ffffff',
        'text-outline-opacity': 1
      }
    },
    {
      selector:
        'edge.focus-e.edge-lbl-vp-tgt, edge.focus-edge-hover.edge-lbl-vp-tgt, edge.focus-edge-selected.edge-lbl-vp-tgt',
      style: {
        label: '',
        'source-label': '',
        'target-label': 'data(label)',
        /** 沿边远离 target 端（屏内可见节点） */
        'target-text-offset': z.vpEdgeOff,
        'target-text-rotation': 'autorotate',
        'target-text-margin-y': -z.edgeMarginY,
        'font-size': z.px(z.edgeFont),
        'font-weight': '600',
        color: '#374151',
        'text-outline-width': z.edgeOutlineHighlight,
        'text-outline-color': '#ffffff',
        'text-outline-opacity': 1
      }
    },
    {
      // 无标签节点直接隐藏：确保它们不参与渲染（含 label / 框）
      selector: 'node[tagGroup = ""]',
      style: {
        display: 'none'
      }
    },
    {
      // 避免无标签节点“把边线留在画面上”
      selector: 'edge[edgeUntagged = "yes"]',
      style: {
        display: 'none'
      }
    },
    {
      selector: 'node.graph-layer-hidden',
      style: {
        display: 'none'
      }
    },
    {
      selector: 'node.frame-cluster-halo',
      style: {
        shape: 'ellipse',
        width: 'data(haloW)',
        height: 'data(haloH)',
        'background-color': 'data(haloFill)',
        'background-opacity': 1,
        'border-width': 1,
        'border-color': 'data(haloBorder)',
        'border-opacity': 1,
        label: '',
        color: '#ffffff',
        'text-opacity': 0,
        events: 'no',
        'z-index': -100,
        'z-index-compare': 'manual'
      }
    },
    {
      // frameCluster 簇标题：默认 text-events=no 时点在字上会穿透到下层面；设 yes 才用 label 包围盒拾取
      selector: 'node.frame-cluster-label',
      style: {
        width: 84,
        height: 24,
        shape: 'roundrectangle',
        'background-opacity': 0,
        'border-width': 0,
        opacity: 1,
        label: 'data(label)',
        color: '#6B7280',
        'font-size': '6px',
        'font-weight': '800',
        'text-valign': 'center',
        'text-halign': 'center',
        'text-margin-y': 0,
        'text-background-opacity': 0,
        'text-border-width': 0,
        'text-outline-width': 3,
        'text-outline-color': '#ffffff',
        'text-outline-opacity': 1,
        'text-events': 'yes',
        'z-index': 22000,
        'z-index-compare': 'manual'
      }
    },
    /** 簇标题选中：不显主题底/边（避免盖住通用 node:selected 的绿色描边） */
    {
      selector: 'node.frame-cluster-label:selected',
      style: {
        'border-width': 0,
        'border-opacity': 0,
        'background-opacity': 0,
        opacity: 1
      }
    },
    {
      selector: 'node.frame-cluster-label.graph-frame-peek-focus',
      style: {
        color: '#111827',
        opacity: 1,
        'text-outline-width': 4
      }
    },
    {
      selector: 'node.frame-cluster-label.graph-frame-peek-dim',
      style: {
        opacity: 0.34,
        'text-outline-width': 2.5
      }
    },
    {
      selector: 'node.frame-cluster-halo.graph-frame-peek-dim',
      style: {
        'background-opacity': 0.2,
        'border-opacity': 0.35
      }
    },
    {
      selector: 'node.graph-frame-peek-dim',
      style: {
        opacity: 0.32
      }
    },
    {
      selector: 'node.frame-cluster-halo.graph-frame-peek-dim, node.frame-cluster-label.graph-frame-peek-dim',
      style: {
        opacity: 1
      }
    },
    {
      selector: 'edge.graph-frame-peek-dim',
      style: {
        opacity: 0.3
      }
    },
    {
      selector: 'edge.graph-frame-peek-dim.focus-edge-hover, edge.graph-frame-peek-dim.focus-edge-selected',
      style: {
        opacity: 0.95
      }
    },
    /** 有选中对象时（GraphView 会给未高亮元素挂 graph-dim 类）：在“原透明度基础上再 *0.5” */
    {
      selector: 'node.graph-dim',
      style: {
        opacity: 0.5
      }
    },
    {
      selector: 'node[graphLinked = "no"].graph-dim',
      style: {
        opacity: 0.21
      }
    },
    {
      selector: 'node.graph-frame-peek-dim.graph-dim',
      style: {
        opacity: 0.16
      }
    },
    {
      selector: 'edge.graph-dim',
      style: {
        opacity: 0.2
      }
    },
    {
      selector: 'edge.graph-frame-peek-dim.graph-dim',
      style: {
        opacity: 0.15
      }
    },
    {
      selector: 'edge.graph-layer-hidden',
      style: {
        display: 'none'
      }
    }
  ];
}

/** 导出页悬停/预览用（与 NotePreviewCard 数据源一致） */
export interface GraphNotePreview {
  emoji: string;
  previewTitle: string;
  previewDetailMd: string;
  images: string[];
  sketch?: string;
  startYear?: number;
  endYear?: number;
}

function buildNotePreviewsFromNotes(notes: Note[]): Record<string, GraphNotePreview> {
  const m: Record<string, GraphNotePreview> = {};
  for (const n of notes) {
    const { title, detail } = parseNoteContent(n.text || '');
    m[n.id] = {
      emoji: n.emoji || '',
      previewTitle: (title || 'Untitled Note').replace(/,\s/, '\n'),
      previewDetailMd: detail || '',
      images: [...(n.images || [])],
      sketch: n.sketch,
      startYear: n.startYear ?? undefined,
      endYear: n.endYear ?? undefined
    };
  }
  return m;
}

export interface GraphExportPayload {
  version: 1;
  app: 'mapp-graph-export';
  projectName: string;
  themeColor: string;
  exportedAt: number;
  /** cytoscape.json().elements */
  elements:
    | { nodes?: ElementDefinition[]; edges?: ElementDefinition[] }
    | ElementDefinition[];
  /** 独立网页内嵌样式（与主应用一致） */
  stylesheet: Stylesheet;
  /** 独立页环形/标签网格布局与图层权重一致 */
  graphLayers?: import('../../types').GraphLayerState;
  /** 独立页圆环/时间轴的分组标准：标签或帧（frame） */
  graphLayerGroupStandard?: 'tag' | 'frame';
  /** 独立页时间线纵轴与图层权重的参考强度（0～1） */
  graphTimeAxisWeightBias?: number;
  /** 独立页悬停预览卡片（Markdown / 图片） */
  notePreviews?: Record<string, GraphNotePreview>;
}

export function buildGraphExportPayload(project: Project, themeColor: string, cy: Core): GraphExportPayload {
  const standard = project.graphLayerStandard ?? 'tag';
  const activeGraphLayers =
    standard === 'frame'
      ? mergeGraphLayerState(project.notes || [], project.graphFrameLayers ?? null, 'frame')
      : mergeGraphLayerState(project.notes || [], project.graphLayers ?? null, 'tag');

  return {
    version: 1,
    app: 'mapp-graph-export',
    projectName: project.name || '项目',
    themeColor,
    exportedAt: Date.now(),
    elements: cy.json().elements,
    stylesheet: getGraphStylesheet(themeColor, {
      nodeSize: project.graphNodeSize,
      labelFontPx: project.graphLabelFontPx,
      edgeWeight: project.graphEdgeWeight
    }),
    graphLayers: activeGraphLayers,
    graphLayerGroupStandard: standard,
    graphTimeAxisWeightBias: project.graphTimeAxisWeightBias,
    notePreviews: buildNotePreviewsFromNotes(project.notes || [])
  };
}

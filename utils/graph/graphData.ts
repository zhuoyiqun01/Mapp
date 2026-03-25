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
  edgeWeightBase?: number
): ElementDefinition[] {
  const noteById = new Map<string, Note>();
  notes.forEach((n) => noteById.set(n.id, n));
  const noteIds = new Set(noteById.keys());

  // edgeWeight 本质上用于连线粗细映射；你的需求需要让“收藏端点数”对每条边生效，
  // 因此这里为每条边计算出独立的 line width 数据字段（供样式表 data(...) 引用）。
  const baseEdgeWeight = edgeWeightBase ?? DEFAULT_GRAPH_STYLESHEET_SIZING.edgeWeight;
  const edgeWeightToLines = (edgeWeight: number) => {
    const ewNorm = (Math.max(0.1, edgeWeight) - 0.1) / 0.9;
    const edgeLine = Math.max(
      0.4,
      Math.min(4.6, Math.round((0.4 + ewNorm * 2.8) * 100) / 100)
    );
    const edgeLineFocus = Math.max(
      0.8,
      Math.min(6.6, Math.round(edgeLine * 1.35 * 100) / 100)
    );
    const edgeLineHi = Math.max(
      0.8,
      Math.min(9.2, Math.round(edgeLine * 1.85 * 100) / 100)
    );
    return { edgeLine, edgeLineFocus, edgeLineHi };
  };

  const linkedIds = new Set<string>();
  for (const c of connections) {
    if (!noteIds.has(c.fromNoteId) || !noteIds.has(c.toNoteId)) continue;
    linkedIds.add(c.fromNoteId);
    linkedIds.add(c.toNoteId);
  }

  const nodes: ElementDefinition[] = notes.map((note) => {
      const rawTag = note.tags?.[0]?.label?.trim() ?? '';
      const tagGroup = rawTag !== '' ? rawTag : GRAPH_UNTAGGED_TAG_GROUP;
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
          favorite: note.isFavorite ? 'yes' : 'no',
          graphLinked: linkedIds.has(note.id) ? 'yes' : 'no'
        }
      };
    });

  const edges: ElementDefinition[] = [];
  for (const c of connections) {
    if (!noteIds.has(c.fromNoteId) || !noteIds.has(c.toNoteId)) continue;
    const direction = connectionToGraphDirection(c);

    const edgeUntagged = 'no';

    const fromFav = Boolean(noteById.get(c.fromNoteId)?.isFavorite);
    const toFav = Boolean(noteById.get(c.toNoteId)?.isFavorite);
    const favEndpointCount = (fromFav ? 1 : 0) + (toFav ? 1 : 0);
    const edgeWeight = baseEdgeWeight + favEndpointCount * 0.5;
    const { edgeLine, edgeLineFocus, edgeLineHi } = edgeWeightToLines(edgeWeight);

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
        edgeLineHiWidth: edgeLineHi
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
    o.nodeSize = Math.min(36, Math.max(4, partial.nodeSize));
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
  const edgeFont = Math.max(6, Math.min(32, Math.round((6 + ewNorm * 10) * 10) / 10));
  const edgeMarginY = Math.max(5, Math.round(edgeFont * 0.72));
  const edgeOutline = Math.max(0.6, Math.min(1.4, Math.round((0.6 + ewNorm * 0.8) * 100) / 100));
  // 高亮态 label 描边不受面板 edgeWeight 影响：固定为当前最大值(1.4)的 4 倍。
  const edgeOutlineHighlight = 5.6;
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
    edgeFont,
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
        cursor: 'pointer',
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
        'line-color': '#d1d5db',
        width: 'data(edgeLineWidth)',
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        'target-arrow-color': '#d1d5db',
        'source-arrow-shape': 'none',
        'font-size': z.px(z.edgeFont),
        'text-rotation': 'autorotate',
        'text-margin-y': -z.edgeMarginY,
        color: '#9ca3af',
        'z-index': 0,
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
        'line-color': z.themeColor,
        'target-arrow-color': z.themeColor,
        'source-arrow-color': z.themeColor,
        'z-index': 15000
      }
    },
    {
      selector: 'edge.focus-e',
      style: {
        'line-color': z.themeColor,
        'target-arrow-color': z.themeColor,
        'source-arrow-color': z.themeColor,
        width: 'data(edgeLineFocusWidth)',
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
        'line-color': z.themeColor,
        'target-arrow-color': z.themeColor,
        'source-arrow-color': z.themeColor,
        width: 'data(edgeLineHiWidth)',
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
        'line-color': z.themeColor,
        'target-arrow-color': z.themeColor,
        'source-arrow-color': z.themeColor,
        width: 'data(edgeLineHiWidth)',
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
      // frameCluster 的簇中心标签：只用于展示，不参与交互/选中。
      selector: 'node.frame-cluster-label',
      style: {
        width: '1px',
        height: '1px',
        'background-opacity': 0,
        'border-width': 0,
        opacity: 1,
        label: 'data(label)',
        color: '#6B7280',
        'font-size': '12px',
        'font-weight': '800',
        'text-valign': 'center',
        'text-margin-y': 0,
        'text-background-opacity': 0,
        'text-border-width': 0,
        'z-index': 22000,
        events: 'no'
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

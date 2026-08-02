import type { Core, NodeSingular } from 'cytoscape';
import {
  GRAPH_HIGHLIGHT_LABEL_SCREEN_PX,
  GRAPH_HIGHLIGHT_RELATED_LABEL_SCREEN_PX
} from './graphData';
import {
  MAP_CHROME_SURFACE_SHELL_CLASS,
  mapChromeSurfaceStyle
} from '../map/mapChromeStyle';

const REF_NODE_SIZE = 28;
const HI_FONT_SEL_PX = GRAPH_HIGHLIGHT_LABEL_SCREEN_PX;
const HI_FONT_REL_PX = GRAPH_HIGHLIGHT_RELATED_LABEL_SCREEN_PX;
export const GRAPH_HIGHLIGHT_CHROME_LABEL_MAX_WIDTH_CSS = 'min(280px, 70vw)';

export type GraphHighlightChromePainted = {
  id: string;
  title: string;
  year: string;
  lines: string[];
  left: number;
  top: number;
  fontPx: number;
  color: string;
  fontWeight: number;
  padPx: number;
  z: number;
  maxContentPx: number;
  multiLine: boolean;
  /** idle：无玻璃衬底，叠在所有节点圆之上；highlight：选中/关联玻璃 label */
  chrome: boolean;
  /** 空闲 label 随画布 zoom 视觉缩放；高亮固定为 1 */
  zoomScale: number;
};

function highlightTier(n: NodeSingular): number {
  if (n.hasClass('focus-hover')) return 4;
  if (n.hasClass('focus-core')) return 3;
  if (n.hasClass('focus-edge-endpoint')) return 2;
  if (n.hasClass('focus-nh')) return 1;
  return 0;
}

function highlightFontPx(n: NodeSingular): number {
  if (n.hasClass('focus-hover') || n.hasClass('focus-core')) return HI_FONT_SEL_PX;
  return HI_FONT_REL_PX;
}

function splitTitleAndYear(n: NodeSingular): { title: string; year: string } {
  const year = String(n.data('year') ?? '').trim();
  const raw = String(n.data('label') ?? '').trim();
  if (!raw) return { title: '', year };
  if (!year) return { title: raw, year: '' };
  const sep = '\u2003\u2003';
  if (raw.includes(sep)) {
    return { title: raw.split(sep)[0]?.trim() ?? raw, year };
  }
  if (raw.endsWith(year)) {
    return {
      title: raw.slice(0, -year.length).replace(/\u2003+$/g, '').trim(),
      year
    };
  }
  return { title: raw, year };
}

function charsOf(s: string): string[] {
  return Array.from(s);
}

function tokenizeForWrap(text: string): string[] {
  return text.match(/[0-9]+|[A-Za-z]+|\s+|./gu) ?? [];
}

function greedyWrap(
  text: string,
  maxPx: number,
  measure: (s: string) => number
): string[] {
  if (!text) return [];
  const tokens = tokenizeForWrap(text);
  const lines: string[] = [];
  let cur = '';

  const flush = () => {
    if (!cur) return;
    lines.push(cur);
    cur = '';
  };

  for (const tok of tokens) {
    const isSpace = /^\s+$/.test(tok);
    const next = cur + tok;
    if (!cur || measure(next) <= maxPx) {
      cur = next;
      continue;
    }
    flush();
    if (isSpace) continue;
    cur = tok;
    if (measure(cur) > maxPx) {
      flush();
    }
  }
  flush();
  return lines;
}

function wrapTitleLines(
  title: string,
  maxContentPx: number,
  year: string,
  yearGapPx: number,
  measure: (s: string) => number
): string[] {
  if (!title) return [];
  const yearW = year ? measure(year) : 0;
  const lastAvail = year
    ? Math.max(24, maxContentPx - yearW - yearGapPx)
    : maxContentPx;

  let lines = greedyWrap(title, maxContentPx, measure);
  if (year && lines.length > 0) {
    const last = lines.pop()!;
    if (measure(last) <= lastAvail) {
      lines.push(last);
    } else {
      lines.push(...greedyWrap(last, lastAvail, measure));
    }
  }

  while (lines.length >= 2 && charsOf(lines[lines.length - 1]!).length === 1) {
    const orphan = lines.pop()!;
    const prev = lines.pop()!;
    const merged = prev + orphan;
    if (year && measure(merged) > lastAvail) {
      lines.push(merged);
      lines.push('');
      break;
    }
    lines.push(merged);
  }

  while (
    lines.length >= 2 &&
    lines[lines.length - 1] !== '' &&
    charsOf(lines[lines.length - 1]!).length === 1
  ) {
    const orphan = lines.pop()!;
    lines[lines.length - 1] = lines[lines.length - 1]! + orphan;
  }

  return lines;
}

function resolveMaxContentPx(padPx: number): number {
  const hostW =
    typeof window !== 'undefined' ? Math.min(280, window.innerWidth * 0.7) : 280;
  return Math.max(48, hostW - padPx * 2);
}

export function collectGraphHighlightChromeLabels(
  cy: Core,
  nodeSize: number,
  themeColor: string,
  idleLabelFontPx: number = 10
): GraphHighlightChromePainted[] {
  const out: GraphHighlightChromePainted[] = [];
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const ctx = canvas?.getContext('2d') ?? null;
  const idleFont = Math.min(16, Math.max(4, Math.round(idleLabelFontPx)));
  const zoom = Math.max(1e-6, cy.zoom());

  /**
   * HTML label 层叠在整张 cytoscape canvas 之上。
   * 一旦有高亮，就只画高亮节点字，避免未高亮 idle 字盖住高亮边/节点圆。
   */
  let hasHighlight = false;
  cy.nodes().forEach((n) => {
    if (n.hasClass('frame-cluster-label') || n.hasClass('frame-cluster-halo')) return;
    if (highlightTier(n) > 0) hasHighlight = true;
  });

  cy.nodes().forEach((n) => {
    if (n.hasClass('frame-cluster-label') || n.hasClass('frame-cluster-halo')) return;
    if (n.style('display') === 'none') return;
    const tier = highlightTier(n);
    if (hasHighlight && tier === 0) return;
    const { title, year } = splitTitleAndYear(n);
    if (!title && !year) return;

    const fav = n.data('favorite') === 'yes';
    const baseNsRaw = Number(n.data('nodeSize'));
    const baseNs =
      Number.isFinite(baseNsRaw) && baseNsRaw > 0 ? baseNsRaw : nodeSize;
    // 位置按 hover 半径算，不因子点（focus-core）视觉放大而下移
    const ns = baseNs * (fav ? 1.5 : 1);
    const isHighlight = tier > 0;
    const fontPx = isHighlight ? highlightFontPx(n) : idleFont;
    const baseGap = Math.max(4, Math.round(fontPx * 0.8));
    const marginY = Math.max(2, Math.round((baseNs / REF_NODE_SIZE) * baseGap));
    const padPx = isHighlight ? Math.max(1, Math.round(fontPx * 0.2)) : 0;
    const gap = Math.max(2, Math.round(marginY * (fav ? 1.5 : 1)));
    const fontWeight = fav ? 700 : isHighlight ? 500 : 600;
    const maxContentPx = resolveMaxContentPx(Math.max(1, padPx || Math.round(fontPx * 0.2)));

    if (ctx) {
      ctx.font = `${fontWeight} ${fontPx}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    }
    const measure = (s: string) => (ctx ? ctx.measureText(s).width : s.length * fontPx * 0.9);
    const yearGapPx = 10;

    const lines = wrapTitleLines(title, maxContentPx, year, yearGapPx, measure);
    const multiLine =
      lines.length > 1 ||
      (year !== '' &&
        lines.length >= 1 &&
        measure(`${lines[0] ?? ''}`) + (year ? yearGapPx + measure(year) : 0) > maxContentPx);

    const rp = n.renderedPosition();
    const half = (ns * zoom) / 2;
    out.push({
      id: n.id(),
      title,
      year,
      lines: lines.length ? lines : title ? [title] : [''],
      left: rp.x,
      top: rp.y + half + gap,
      fontPx,
      color: isHighlight ? (fav ? themeColor : '#000000') : '#9ca3af',
      fontWeight,
      padPx,
      z: isHighlight ? 10 + tier : 1,
      maxContentPx,
      multiLine,
      chrome: isHighlight,
      // 空闲：仅视觉随 zoom 缩放，换行仍按未缩放字号
      zoomScale: isHighlight ? 1 : zoom
    });
  });

  return out;
}

export function graphHighlightChromePaintKey(items: GraphHighlightChromePainted[]): string {
  return items
    .map(
      (it) =>
        `${it.id}:${Math.round(it.left)}:${Math.round(it.top)}:${it.fontPx}:${it.zoomScale.toFixed(3)}:${it.lines.join('/')}:${it.year}:${it.multiLine ? 1 : 0}:${it.chrome ? 1 : 0}:${it.color}`
    )
    .join('|');
}

export function buildGraphHighlightChromeLabelContent(
  it: GraphHighlightChromePainted
): HTMLElement {
  const root = document.createElement('div');
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.gap = '2px';
  root.style.width = '100%';
  root.style.maxWidth = `${it.maxContentPx}px`;
  root.style.fontFamily =
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

  const lines = it.lines;
  const year = it.year;
  const hasYear = year !== '';

  const appendYearRow = (titlePart: string) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'baseline';
    row.style.gap = '10px';
    row.style.width = '100%';
    row.style.textAlign = 'left';

    const left = document.createElement('span');
    left.textContent = titlePart;
    left.style.textAlign = 'left';
    left.style.minWidth = '0';
    left.style.flex = '1 1 auto';
    left.style.whiteSpace = 'nowrap';
    row.appendChild(left);

    if (hasYear) {
      const right = document.createElement('span');
      right.textContent = year;
      right.style.flexShrink = '0';
      right.style.textAlign = 'right';
      right.style.whiteSpace = 'nowrap';
      row.appendChild(right);
    }
    root.appendChild(row);
  };

  if (!it.multiLine && !hasYear) {
    root.style.textAlign = 'center';
    root.textContent = lines[0] ?? it.title;
    return root;
  }

  if (!it.multiLine && hasYear) {
    appendYearRow(lines[0] ?? it.title);
    return root;
  }

  const body = lines.slice(0, -1);
  const lastTitle = lines[lines.length - 1] ?? '';

  for (const line of body) {
    const row = document.createElement('div');
    row.style.textAlign = 'left';
    row.style.width = '100%';
    row.style.whiteSpace = 'nowrap';
    row.textContent = line;
    root.appendChild(row);
  }

  appendYearRow(lastTitle);
  return root;
}

export function paintGraphHighlightChromeLabels(
  layer: HTMLElement,
  items: GraphHighlightChromePainted[],
  chromeOpacity: number,
  chromeBlurPx: number
): void {
  const chromeStyle = mapChromeSurfaceStyle(chromeOpacity, chromeBlurPx);
  const frag = document.createDocumentFragment();
  // idle 先画、highlight 后画，保证高亮字在上层
  const ordered = [...items].sort((a, b) => a.z - b.z);
  for (const it of ordered) {
    const el = document.createElement('div');
    el.className = it.chrome
      ? `${MAP_CHROME_SURFACE_SHELL_CLASS} absolute leading-snug`
      : 'absolute leading-snug';
    el.appendChild(buildGraphHighlightChromeLabelContent(it));
    const style: Record<string, string> = {
      left: `${it.left}px`,
      top: `${it.top}px`,
      transform: `translateX(-50%) scale(${it.zoomScale})`,
      transformOrigin: '50% 0',
      padding: `${it.padPx}px`,
      fontSize: `${it.fontPx}px`,
      fontWeight: String(it.fontWeight),
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      color: it.color,
      zIndex: String(it.z),
      maxWidth: GRAPH_HIGHLIGHT_CHROME_LABEL_MAX_WIDTH_CSS,
      pointerEvents: 'none',
      position: 'absolute'
    };
    if (it.chrome) {
      style.backgroundColor = String(chromeStyle.backgroundColor ?? '');
      style.backdropFilter = String(chromeStyle.backdropFilter ?? '');
      style.WebkitBackdropFilter = String(
        (chromeStyle as { WebkitBackdropFilter?: string }).WebkitBackdropFilter ?? ''
      );
    }
    Object.assign(el.style, style);
    frag.appendChild(el);
  }
  layer.replaceChildren(frag);
}

/**
 * 独立 HTML：绑定高亮玻璃 label 层（与 App GraphHighlightChromeLabels 一致）。
 * 返回强制刷新函数（高亮集合变化时调用）。
 */
export function wireStandaloneHighlightChromeLabels(
  cy: Core,
  layer: HTMLElement,
  opts: {
    themeColor: string;
    nodeSize: number;
    chromeOpacity: number;
    chromeBlurPx: number;
    host?: HTMLElement | null;
    labelFontPx?: number;
  }
): () => void {
  let raf: number | null = null;
  let lastKey = '';

  const sync = () => {
    raf = null;
    if (!cy || cy.destroyed?.()) {
      if (lastKey !== '') {
        lastKey = '';
        layer.replaceChildren();
      }
      return;
    }
    const items = collectGraphHighlightChromeLabels(
      cy,
      opts.nodeSize,
      opts.themeColor,
      opts.labelFontPx ?? 10
    );
    const key = graphHighlightChromePaintKey(items);
    if (key === lastKey) return;
    lastKey = key;
    paintGraphHighlightChromeLabels(layer, items, opts.chromeOpacity, opts.chromeBlurPx);
  };

  const schedule = () => {
    if (raf != null) return;
    raf = requestAnimationFrame(sync);
  };

  const forceRefresh = () => {
    lastKey = '';
    schedule();
  };

  sync();
  cy.on('viewport', schedule);
  cy.on('drag', 'node', schedule);
  cy.on('free', 'node', schedule);
  cy.on('layoutstop', schedule);

  const host = opts.host ?? layer.parentElement;
  const ro =
    host && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
  if (host && ro) ro.observe(host);

  return forceRefresh;
}

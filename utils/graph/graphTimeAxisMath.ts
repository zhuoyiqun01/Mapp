import type { Core } from 'cytoscape';

export type TimeAxisTick = { key: string; leftPct: number; label: string };

function linearMap(
  x: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number
): number {
  if (Math.abs(x1 - x0) < 1e-9) return y0;
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

/**
 * 从当前图中带 timeSort 的节点建立「模型 x ↔ 年份」线性关系（与时间线 preset 布局一致）。
 */
export function getTimeAxisDomain(cy: Core): {
  xMin: number;
  xMax: number;
  tMin: number;
  tMax: number;
} | null {
  const nodes = cy.nodes().filter((n) => n.data('timeSort') != null);
  if (nodes.length === 0) return null;
  let xMin = Infinity;
  let xMax = -Infinity;
  let tMin = Infinity;
  let tMax = -Infinity;
  nodes.forEach((n) => {
    const p = n.position();
    const t = Number(n.data('timeSort'));
    if (!Number.isFinite(t)) return;
    xMin = Math.min(xMin, p.x);
    xMax = Math.max(xMax, p.x);
    tMin = Math.min(tMin, t);
    tMax = Math.max(tMax, t);
  });
  if (!Number.isFinite(xMin) || !Number.isFinite(tMin)) return null;
  if (Math.abs(xMax - xMin) < 1e-9) {
    xMax = xMin + 1;
  }
  if (Math.abs(tMax - tMin) < 1e-9) {
    tMax = tMin + 1;
  }
  return { xMin, xMax, tMin, tMax };
}

/**
 * 底部固定比例尺：沿屏宽等分取点，将各点像素 x 换为模型 x 再换为年份。
 * 仅用于展示，不修改图中元素；平移缩放只改变刻度数字。
 */
export function computeTimeAxisTicks(
  cy: Core,
  containerWidthPx: number
): TimeAxisTick[] {
  const domain = getTimeAxisDomain(cy);
  if (!domain || containerWidthPx <= 0) return [];

  const zoom = cy.zoom();
  const pan = cy.pan();
  const { xMin, xMax, tMin, tMax } = domain;

  const nDiv = Math.min(8, Math.max(4, Math.floor(containerWidthPx / 72)));
  const ticks: TimeAxisTick[] = [];
  for (let i = 0; i <= nDiv; i++) {
    const sx = (containerWidthPx * i) / nDiv;
    const modelX = (sx - pan.x) / zoom;
    const t = linearMap(modelX, xMin, xMax, tMin, tMax);
    ticks.push({
      key: `d-${i}`,
      leftPct: (i / nDiv) * 100,
      label: Number.isFinite(t) ? String(Math.round(t)) : '—'
    });
  }
  return ticks;
}

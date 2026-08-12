import type { NormPoint } from '../../types';

/** 点到线段距离（归一化坐标空间） */
function perpendicularDistance(
  point: NormPoint,
  lineStart: NormPoint,
  lineEnd: NormPoint
): number {
  const [x, y] = point;
  const [x1, y1] = lineStart;
  const [x2, y2] = lineEnd;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    return Math.hypot(x - x1, y - y1);
  }
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(x - projX, y - projY);
}

/**
 * Ramer–Douglas–Peucker：压缩套索原始点。
 * epsilon 相对 0～1 坐标；默认约 0.002～0.004 可把数千点压到百级。
 */
export function simplifyPathRdp(points: NormPoint[], epsilon = 0.003): NormPoint[] {
  if (points.length < 3) return points.slice();

  let maxDist = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > maxDist) {
      index = i;
      maxDist = d;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyPathRdp(points.slice(0, index + 1), epsilon);
    const right = simplifyPathRdp(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[end]];
}

/** 简单滑动平均平滑（在 RDP 之后可选） */
export function smoothPathMovingAverage(points: NormPoint[], window = 3): NormPoint[] {
  if (points.length < 3 || window < 3) return points.slice();
  const half = Math.floor(window / 2);
  const out: NormPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    if (i === 0 || i === points.length - 1) {
      out.push(points[i]);
      continue;
    }
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let j = i - half; j <= i + half; j++) {
      if (j < 0 || j >= points.length) continue;
      sx += points[j][0];
      sy += points[j][1];
      n++;
    }
    out.push([sx / n, sy / n]);
  }
  return out;
}

/** 套索录入后的推荐处理流水线 */
export function prepareLassoPath(raw: NormPoint[], opts?: { epsilon?: number; smooth?: boolean }): NormPoint[] {
  let pts = simplifyPathRdp(raw, opts?.epsilon ?? 0.003);
  if (opts?.smooth !== false) {
    pts = smoothPathMovingAverage(pts, 3);
  }
  // 保证闭合感：若首尾距离较大，不强制插入；渲染时 clip 会自动闭合
  return pts;
}

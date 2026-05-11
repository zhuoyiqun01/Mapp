import L from 'leaflet';

/**
 * 在给定地图经度范围 [west, east] 内，返回所有整数 k，使 (baseLng + 360*k) 落在可见条带内（含 pad）。
 * west/east 可为 Leaflet 连续平移后的非 ±180 经度。
 */
export function lngWrapOffsetsForBounds(
  baseLng: number,
  west: number,
  east: number,
  padDeg = 4
): number[] {
  const w = west - padDeg;
  const e = east + padDeg;
  if (!Number.isFinite(w) || !Number.isFinite(e) || !Number.isFinite(baseLng)) {
    return [0];
  }

  if (w <= e) {
    const kMin = Math.ceil((w - baseLng) / 360);
    const kMax = Math.floor((e - baseLng) / 360);
    if (kMin > kMax) return [];
    const out: number[] = [];
    for (let k = kMin; k <= kMax; k++) out.push(k);
    return out;
  }

  const left = lngWrapOffsetsForBounds(baseLng, w, 180, 0);
  const right = lngWrapOffsetsForBounds(baseLng, -180, e, 0);
  const merged = new Set([...left, ...right]);
  return merged.size ? [...merged].sort((a, b) => a - b) : [];
}

/** 聚类距离：把经度拉到与 centerLng 同一连续段，避免跨 360° 误判分离 */
export function unwrapLngNearCenter(lng: number, centerLng: number): number {
  let L = lng;
  while (L - centerLng > 180) L -= 360;
  while (L - centerLng < -180) L += 360;
  return L;
}

/** 与地图中心同一条带最接近的 k（用于仅让一个副本可拖拽） */
export function primaryWrapOffsetForCenter(
  baseLng: number,
  centerLng: number,
  offsets: number[]
): number {
  if (offsets.length === 0) return 0;
  let best = offsets[0]!;
  let bestAbs = Math.abs(baseLng + 360 * best - centerLng);
  for (const k of offsets) {
    const a = Math.abs(baseLng + 360 * k - centerLng);
    if (a < bestAbs) {
      bestAbs = a;
      best = k;
    }
  }
  return best;
}

/** 屏幕连线：调整终点经度，使与起点在同一连续 360° 段且弦最短 */
export function pairLatLngsForShortMapChord(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): { from: L.LatLng; to: L.LatLng } {
  let l2 = lng2;
  while (l2 - lng1 > 180) l2 -= 360;
  while (l2 - lng1 < -180) l2 += 360;
  return { from: L.latLng(lat1, lng1), to: L.latLng(lat2, l2) };
}

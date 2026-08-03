/**
 * 用系统/浏览器打开外部地图导航（Apple Maps / Google Maps 等）。
 * 有 GPS 的点位可一键「Go」。
 */

export function hasNavigableGpsCoords(coords: { lat: number; lng: number } | null | undefined): boolean {
  if (!coords) return false;
  const { lat, lng } = coords;
  if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
    return false;
  }
  // 与 noteHasRenderableMapPosition 一致：排除占位 0,0
  if (lat === 0 && lng === 0) return false;
  return true;
}

function isLikelyIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 桌面 UA
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1;
}

/**
 * 打开到目标坐标的导航。优先唤起本机地图 App，桌面则打开网页版。
 */
export function openExternalNavigation(
  lat: number,
  lng: number,
  opts?: { label?: string }
): void {
  if (!hasNavigableGpsCoords({ lat, lng })) return;

  const dest = `${lat},${lng}`;
  const label = (opts?.label || '').trim();

  let url: string;
  if (isLikelyIOS()) {
    // Apple Maps：有 App 则打开，否则网页
    url = `https://maps.apple.com/?daddr=${encodeURIComponent(dest)}&dirflg=d`;
    if (label) url += `&q=${encodeURIComponent(label)}`;
  } else {
    // Android / 桌面：始终用坐标，保证导航到精确点位
    url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
  }

  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    // 弹窗被拦时退化为同页跳转
    window.location.assign(url);
  }
}

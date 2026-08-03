/**
 * 外部地图导航：优先用 geo: / 原生 App scheme 唤起系统「用何应用打开」，
 * 避免 window.open(https://…) 直接进网页。
 *
 * 应用内坐标为 WGS-84；Apple / 高德等国内图源按需转 GCJ-02。
 */

import { wgs84ToGcj02 } from './chinaCoords';

export function hasNavigableGpsCoords(coords: { lat: number; lng: number } | null | undefined): boolean {
  if (!coords) return false;
  const { lat, lng } = coords;
  if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
    return false;
  }
  if (lat === 0 && lng === 0) return false;
  return true;
}

export function isLikelyIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1;
}

export function isLikelyAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent || '');
}

function isLikelyMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (isLikelyIOS() || isLikelyAndroid()) return true;
  return /Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
}

/** 同页跳转 scheme（不要用 window.open，否则常进浏览器标签页） */
function assignUrl(url: string): void {
  window.location.assign(url);
}

export type ExternalMapAppId = 'system' | 'apple' | 'amap' | 'baidu' | 'google';

export type ExternalMapAppChoice = {
  id: ExternalMapAppId;
  label: string;
  hint?: string;
};

/**
 * 可选地图应用列表（按平台略有不同）。
 * 「系统地图」走 geo:，Android 上通常会弹出系统应用选择器。
 */
export function listExternalMapApps(): ExternalMapAppChoice[] {
  const apps: ExternalMapAppChoice[] = [
    {
      id: 'system',
      label: '系统地图',
      hint: isLikelyAndroid() ? '由系统询问用哪个应用打开' : '尝试唤起已安装的地图应用'
    }
  ];
  if (isLikelyIOS()) {
    apps.push({ id: 'apple', label: 'Apple 地图' });
  }
  apps.push(
    { id: 'amap', label: '高德地图' },
    { id: 'baidu', label: '百度地图' },
    { id: 'google', label: 'Google 地图' }
  );
  return apps;
}

function geoUri(lat: number, lng: number, label: string): string {
  // geo: 为通用意图；多数地图 App 会自行处理 WGS-84
  const q = label ? `${lat},${lng}(${label})` : `${lat},${lng}`;
  return `geo:${lat},${lng}?q=${encodeURIComponent(q)}`;
}

function appleMapsAppUri(lat: number, lng: number, label: string): string {
  const gcj = wgs84ToGcj02(lat, lng);
  let url = `maps://?daddr=${gcj.lat},${gcj.lng}&dirflg=d`;
  if (label) url += `&q=${encodeURIComponent(label)}`;
  return url;
}

function amapUri(lat: number, lng: number, label: string): string {
  // dev=1：传入 WGS-84，由高德转换
  const name = encodeURIComponent(label || '目的地');
  if (isLikelyIOS()) {
    return `iosamap://path?sourceApplication=Mapp&dlat=${lat}&dlon=${lng}&dname=${name}&dev=1&t=0`;
  }
  return `androidamap://route?sourceApplication=Mapp&dlat=${lat}&dlon=${lng}&dname=${name}&dev=1&t=0`;
}

function baiduUri(lat: number, lng: number, label: string): string {
  // coord_type=wgs84；百度会转到 BD-09
  const name = encodeURIComponent(label || '目的地');
  const dest = `name:${name}|latlng:${lat},${lng}`;
  return `baidumap://map/direction?destination=${encodeURIComponent(dest)}&coord_type=wgs84&mode=driving`;
}

function googleMapsUri(lat: number, lng: number, label: string, preferApp: boolean): string {
  const dest = `${lat},${lng}`;
  if (preferApp && isLikelyIOS()) {
    let url = `comgooglemaps://?daddr=${encodeURIComponent(dest)}&directionsmode=driving`;
    if (label) url += `&q=${encodeURIComponent(label)}`;
    return url;
  }
  if (preferApp && isLikelyAndroid()) {
    return `google.navigation:q=${encodeURIComponent(dest)}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}

/** 打开指定地图应用 / 系统选择器 */
export function openExternalMapApp(
  appId: ExternalMapAppId,
  lat: number,
  lng: number,
  opts?: { label?: string }
): void {
  if (!hasNavigableGpsCoords({ lat, lng })) return;
  const label = (opts?.label || '').trim();

  switch (appId) {
    case 'system':
      assignUrl(geoUri(lat, lng, label));
      return;
    case 'apple':
      assignUrl(appleMapsAppUri(lat, lng, label));
      return;
    case 'amap':
      assignUrl(amapUri(lat, lng, label));
      return;
    case 'baidu':
      assignUrl(baiduUri(lat, lng, label));
      return;
    case 'google':
      assignUrl(googleMapsUri(lat, lng, label, isLikelyMobile()));
      return;
    default:
      assignUrl(geoUri(lat, lng, label));
  }
}

/**
 * 一键导航：移动端优先 geo:（系统询问用何应用）；
 * iOS 无多应用选择器时退到 Apple 地图 App（maps://，非网页）；
 * 桌面打开 Google 网页版。
 *
 * 若需要用户自选高德/百度等，请用 ExternalNavigationSheet + openExternalMapApp。
 */
export function openExternalNavigation(
  lat: number,
  lng: number,
  opts?: { label?: string }
): void {
  if (!hasNavigableGpsCoords({ lat, lng })) return;
  const label = (opts?.label || '').trim();

  if (isLikelyAndroid()) {
    // Android：geo: 会弹出系统「用哪个应用打开」
    assignUrl(geoUri(lat, lng, label));
    return;
  }

  if (isLikelyIOS()) {
    // iOS WebView/Safari 没有多地图系统选择器；maps:// 进 App，避免 https 网页
    assignUrl(appleMapsAppUri(lat, lng, label));
    return;
  }

  if (isLikelyMobile()) {
    assignUrl(geoUri(lat, lng, label));
    return;
  }

  // 桌面：无原生地图意图时用网页
  window.open(googleMapsUri(lat, lng, label, false), '_blank', 'noopener,noreferrer');
}

/** @deprecated 保留兼容；中国境内判断见 chinaCoords */
export { isCoordInChina } from './chinaCoords';

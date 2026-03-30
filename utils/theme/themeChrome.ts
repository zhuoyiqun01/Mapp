/**
 * 主题色表面上的前景色（图标/文字）：由 CIE Lab L* 与阈值决定，并写入 --theme-chrome-fg。
 */

/** Lab L* 高于此阈值（0–100）时使用深色前景，否则浅色前景（提高后仅在更亮的主题色上才用黑字） */
export const THEME_CHROME_LAB_L_THRESHOLD = 80;

/** D65 参考白 Yn = 1（相对 XYZ） */
const D65_YN = 1;
const LAB_EPS = 216 / 24389;
const LAB_KAPPA = 24389 / 27;

function srgbChannelToLinear(c255: number): number {
  const c = c255 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** 解析 #RGB / #RRGGBB */
export function parseHexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.trim();
  const m6 = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);
  if (m6) {
    return {
      r: parseInt(m6[1], 16),
      g: parseInt(m6[2], 16),
      b: parseInt(m6[3], 16)
    };
  }
  const m3 = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(h);
  if (m3) {
    return {
      r: parseInt(m3[1] + m3[1], 16),
      g: parseInt(m3[2] + m3[2], 16),
      b: parseInt(m3[3] + m3[3], 16)
    };
  }
  return null;
}

/**
 * CIE Lab L*（0–100，D65），仅由相对亮度 Y 决定。
 */
export function cielabLFromRgb(r: number, g: number, b: number): number {
  const rl = srgbChannelToLinear(r);
  const gl = srgbChannelToLinear(g);
  const bl = srgbChannelToLinear(b);

  const y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175;
  const yr = y / D65_YN;
  const fy = yr > LAB_EPS ? Math.cbrt(yr) : (LAB_KAPPA * yr + 16) / 116;
  return 116 * fy - 16;
}

export function cielabLFromHex(hex: string): number | null {
  const rgb = parseHexToRgb(hex);
  if (!rgb) return null;
  return cielabLFromRgb(rgb.r, rgb.g, rgb.b);
}

export function getThemeChromeForegroundHex(themeColor: string): '#ffffff' | '#000000' {
  const L = cielabLFromHex(themeColor);
  if (L == null) return '#ffffff';
  return L > THEME_CHROME_LAB_L_THRESHOLD ? '#000000' : '#ffffff';
}

/** 将主题色对应的前景色与 Lab L* 写入根节点 CSS 变量 */
export function applyThemeChromeCssVars(root: HTMLElement, themeColor: string): void {
  const fg = getThemeChromeForegroundHex(themeColor);
  root.style.setProperty('--theme-chrome-fg', fg);
  const L = cielabLFromHex(themeColor);
  if (L != null) {
    root.style.setProperty('--theme-chrome-lab-l', L.toFixed(2));
  } else {
    root.style.removeProperty('--theme-chrome-lab-l');
  }

  // 主题色底上的滚动条：拇指与 chrome 前景同色（实色），悬停略加深/变浅
  if (fg === '#000000') {
    root.style.setProperty('--theme-scrollbar-thumb', '#000000');
    root.style.setProperty('--theme-scrollbar-thumb-hover', '#404040');
  } else {
    root.style.setProperty('--theme-scrollbar-thumb', '#ffffff');
    root.style.setProperty('--theme-scrollbar-thumb-hover', '#e8e8e8');
  }
}

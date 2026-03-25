import type { CSSProperties } from 'react';

/** 全屏模态遮罩（便签编辑器等）：轻半透明 + 背景模糊，避免过重黑层 */
export const MODAL_BACKDROP_MASK_STYLE: CSSProperties = {
  backgroundColor: 'rgba(0, 0, 0, 0.15)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)'
};

export const DEFAULT_MAP_UI_CHROME_OPACITY = 0.9;
export const DEFAULT_MAP_UI_CHROME_BLUR_PX = 8;

export function mapChromeSurfaceStyle(opacity: number, blurPx: number): CSSProperties {
  const o = Math.min(1, Math.max(0, opacity));
  const b = Math.min(48, Math.max(0, blurPx));
  const style: CSSProperties = {
    backgroundColor: `rgba(255, 255, 255, ${o})`
  };
  if (b > 0) {
    const f = `blur(${b}px)`;
    style.backdropFilter = f;
    style.WebkitBackdropFilter = f;
  }
  return style;
}

/** 图谱 frameCluster 圆形底衬：填充与 mapChromeSurfaceStyle 一致，描边随不透明度略提亮 */
export function mapChromeHaloFillAndBorder(opacity: number, blurPx: number): { fill: string; border: string } {
  const surface = mapChromeSurfaceStyle(opacity, blurPx);
  const fill =
    typeof surface.backgroundColor === 'string'
      ? surface.backgroundColor
      : `rgba(255, 255, 255, ${DEFAULT_MAP_UI_CHROME_OPACITY})`;
  const o = Math.min(1, Math.max(0, opacity));
  const border = `rgba(255, 255, 255, ${Math.min(1, o + 0.1)})`;
  return { fill, border };
}

export function mapChromeHoverBackground(opacity: number): string {
  const o = Math.min(1, Math.max(0, opacity) + 0.1);
  return `rgba(255, 255, 255, ${o})`;
}

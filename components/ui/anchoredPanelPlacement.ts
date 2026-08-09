export type AnchoredPanelAlign = 'start' | 'end' | 'center';

export type AnchoredPanelPlacement = {
  top: number;
  left: number;
};

export type AnchoredPanelPlacementOptions = {
  panelWidth: number;
  panelHeight: number;
  /** 锚点与面板间距，默认 8 */
  gap?: number;
  /** 视口内边距，默认 8 */
  padding?: number;
  /**
   * start：面板左缘对齐锚点左缘
   * end：面板右缘对齐锚点右缘
   * center：面板水平居中于锚点
   */
  align?: AnchoredPanelAlign;
};

/**
 * NoteEditor 浮层统一规则：默认在锚点下方；下方不够则翻到上方；
 * 水平/垂直均钳制在视口内，避免超出界面。
 */
export function computeAnchoredPanelPlacement(
  rect: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'right' | 'width' | 'height'>,
  options: AnchoredPanelPlacementOptions
): AnchoredPanelPlacement {
  const {
    panelWidth,
    panelHeight,
    gap = 8,
    padding = 8,
    align = 'start'
  } = options;

  const vw = typeof window !== 'undefined' ? window.innerWidth : panelWidth + padding * 2;
  const vh = typeof window !== 'undefined' ? window.innerHeight : panelHeight + padding * 2;

  const effectiveWidth = Math.min(panelWidth, Math.max(0, vw - padding * 2));
  const effectiveHeight = Math.min(panelHeight, Math.max(0, vh - padding * 2));

  const spaceBelow = vh - rect.bottom;
  const spaceAbove = rect.top;
  const preferAbove =
    spaceBelow < effectiveHeight + gap && spaceAbove >= spaceBelow;

  let top = preferAbove ? rect.top - effectiveHeight - gap : rect.bottom + gap;
  top = Math.max(padding, Math.min(top, vh - effectiveHeight - padding));

  let left =
    align === 'end'
      ? rect.right - effectiveWidth
      : align === 'center'
        ? rect.left + rect.width / 2 - effectiveWidth / 2
        : rect.left;
  left = Math.max(padding, Math.min(left, vw - effectiveWidth - padding));

  return { top, left };
}

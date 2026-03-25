import { RefObject, useLayoutEffect, useState } from 'react';

export type FixedAnchorPosition = { left: number; top: number };

/**
 * 将面板锚定到 `anchorRef` 右上角上方（与 Board 多选筛选 portal 行为一致）。
 * `layoutRevision` 应在锚点可能因滚动、缩放、拖拽而移动时变化，以触发重算。
 */
export function useFixedAnchorPosition(
  enabled: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  options: {
    panelWidth: number;
    horizontalPadding?: number;
    gapAbove?: number;
  },
  layoutRevision: unknown
): FixedAnchorPosition | null {
  const { panelWidth, horizontalPadding = 8, gapAbove = 8 } = options;
  const [pos, setPos] = useState<FixedAnchorPosition | null>(null);

  useLayoutEffect(() => {
    if (!enabled) {
      setPos(null);
      return;
    }
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      let left = r.right - panelWidth;
      left = Math.max(
        horizontalPadding,
        Math.min(left, window.innerWidth - panelWidth - horizontalPadding)
      );
      const top = r.top - gapAbove;
      setPos({ left, top });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [enabled, panelWidth, horizontalPadding, gapAbove, layoutRevision]);

  return pos;
}

/** 与重构方案中的命名对齐（语义同 {@link useFixedAnchorPosition}） */
export { useFixedAnchorPosition as useFixedAnchorPortal };

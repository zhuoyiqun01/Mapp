import React, { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { FixedAnchorPosition } from './useFixedAnchorPosition';

export type AnchorFloatingPortalProps = {
  open: boolean;
  position: FixedAnchorPosition | null;
  children: ReactNode;
  /** 默认 10050，与画板 browse 筛选一致 */
  zIndex?: number;
  className?: string;
  /** 与面板玻璃样式合并（如 panelChromeStyle） */
  style?: CSSProperties;
  /** 默认 translateY(-100%)：面板在锚点上方 */
  transform?: string;
  /** 与 BoardView 原 portal 上 data-* 一致，便于测试 / 选择器 */
  browseDataAttr?: 'tag-filter' | 'time-filter';
};

/**
 * `position` 为 fixed 左上角；配合 `transform: translateY(-100%)` 实现「锚在按钮上方」。
 */
export const AnchorFloatingPortal: React.FC<AnchorFloatingPortalProps> = ({
  open,
  position,
  children,
  zIndex = 10050,
  className,
  style,
  transform = 'translateY(-100%)',
  browseDataAttr
}) => {
  if (!open || position == null || typeof document === 'undefined') {
    return null;
  }

  const dataProps =
    browseDataAttr === 'tag-filter'
      ? ({ 'data-browse-tag-filter-panel': true } as React.HTMLAttributes<HTMLDivElement>)
      : browseDataAttr === 'time-filter'
        ? ({ 'data-browse-time-filter-panel': true } as React.HTMLAttributes<HTMLDivElement>)
        : {};

  return createPortal(
    <div
      {...dataProps}
      className={className}
      style={{
        position: 'fixed',
        left: position.left,
        top: position.top,
        transform,
        zIndex,
        ...style
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
};

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Tag as TagIcon } from 'lucide-react';
import { TAG_COLORS } from '../../constants';

export interface TagAddPanelProps {
  themeColor: string;
  panelChromeStyle?: React.CSSProperties;
  /** 标题说明（如「为 3 个便签添加标签」或「添加标签」） */
  title: string;
  label: string;
  onLabelChange: (v: string) => void;
  selectedColor: string;
  onColorChange: (color: string) => void;
  onApply: () => void;
  /** 点击面板外：与「应用」一致（通常即保存/提交；空标签则取消），并收起面板 */
  onDismissOutside?: () => void;
  /**
   * 若点击目标在该选择器匹配的元素内，不触发 onDismissOutside（如画板批量工具栏整列含按钮，避免与标签按钮 toggle 冲突）
   */
  dismissIgnoreClosestSelector?: string;
  /**
   * 传入时通过 portal 渲染到 document.body，fixed 定位于视口（便签编辑器内与 Emoji 浮层同级）
   */
  portalPlacement?: { top: number; left: number } | null;
  /** portal 内容层 z-index，默认与 EmojiPicker 内容一致 */
  portalZIndex?: number;
  placeholder?: string;
  applyLabel?: string;
  autoFocus?: boolean;
  className?: string;
  onInputKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  closeOnInteractOutside?: boolean;
}

const PORTAL_Z = 10000;

/**
 * 画板批量加标签与便签编辑器共用：标签图标 + 名称 + 全色盘 + 应用
 */
export const TagAddPanel: React.FC<TagAddPanelProps> = ({
  themeColor,
  panelChromeStyle,
  title,
  label,
  onLabelChange,
  selectedColor,
  onColorChange,
  onApply,
  onDismissOutside,
  dismissIgnoreClosestSelector,
  portalPlacement,
  portalZIndex = PORTAL_Z,
  placeholder,
  applyLabel = '应用',
  autoFocus,
  className = '',
  onInputKeyDown,
  closeOnInteractOutside = true,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const outsideRef = useRef(onDismissOutside ?? onApply);
  outsideRef.current = onDismissOutside ?? onApply;
  const ignoreSelRef = useRef(dismissIgnoreClosestSelector);
  ignoreSelRef.current = dismissIgnoreClosestSelector;

  useEffect(() => {
    if (!closeOnInteractOutside) return;
    const onDocPointerDown = (e: PointerEvent) => {
      const root = rootRef.current;
      const t = e.target as Node;
      if (!root || root.contains(t)) return;
      const sel = ignoreSelRef.current;
      if (sel && t instanceof Element && t.closest(sel)) return;
      outsideRef.current();
    };
    document.addEventListener('pointerdown', onDocPointerDown, true);
    return () => document.removeEventListener('pointerdown', onDocPointerDown, true);
  }, [closeOnInteractOutside]);

  const shellClass = `rounded-xl border border-gray-200/90 p-2.5 shadow-lg ring-1 ring-black/[0.04] ${panelChromeStyle ? '' : 'bg-white'} ${className}`;

  const body = (
    <>
      <div className="flex items-start gap-2 mb-1.5">
        <TagIcon size={16} className="text-gray-500 shrink-0 mt-0.5" aria-hidden />
        <div className="text-xs text-gray-500 min-w-0 flex-1 leading-snug">{title}</div>
      </div>
      <input
        type="text"
        value={label}
        onChange={(e) => onLabelChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-offset-0 mb-2"
        style={{ ['--tw-ring-color' as string]: themeColor }}
        onKeyDown={onInputKeyDown}
      />
      <div className="flex flex-wrap gap-1.5 mb-2">
        {TAG_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onColorChange(c)}
            className="w-6 h-6 rounded-full shrink-0 cursor-pointer p-0 border-0 transition-transform"
            style={{
              backgroundColor: c,
              transform: selectedColor === c ? 'scale(1.15)' : undefined,
            }}
            title={c}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onApply();
        }}
        className="w-full py-1.5 text-sm rounded-lg text-theme-chrome-fg border-0 cursor-pointer"
        style={{ backgroundColor: themeColor }}
      >
        {applyLabel}
      </button>
    </>
  );

  if (portalPlacement != null) {
    return createPortal(
      <div
        ref={rootRef}
        className={`w-[min(100vw-16px,260px)] max-w-[min(100vw-16px,260px)] ${shellClass}`}
        style={{
          ...(panelChromeStyle || {}),
          position: 'fixed',
          top: portalPlacement.top,
          left: portalPlacement.left,
          zIndex: portalZIndex,
          pointerEvents: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {body}
      </div>,
      document.body
    );
  }

  return (
    <div
      ref={rootRef}
      className={`w-full max-w-[min(100vw-24px,260px)] ${shellClass}`}
      style={panelChromeStyle}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {body}
    </div>
  );
};

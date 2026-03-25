import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const GAP_PX = 6;
const VIEW_PAD_PX = 10;
/** 高于 SettingsPanel 卡片 z-[5001] */
export const PORTAL_TOOLTIP_Z = 6000;

export type PortalTooltipTone = 'neutral' | 'warning';

const TONE_TOOLTIP_CLASS: Record<PortalTooltipTone, string> = {
  neutral:
    'rounded-md bg-gray-900/92 px-2.5 py-2 text-left text-xs leading-snug text-gray-100 shadow-md break-words',
  warning:
    'rounded-md border border-amber-600/40 bg-amber-950/93 px-2.5 py-2 text-left text-xs leading-snug text-amber-50 shadow-md break-words'
};

type PortalTooltipProps = {
  content: React.ReactNode;
  tone?: PortalTooltipTone;
  /** 单个可聚焦元素（如 button），悬停与键盘聚焦时显示 content */
  children: React.ReactElement;
};

/**
 * 挂到 document.body + fixed 定位，与 HelpHint 一致；子元素需合并 onFocus/onBlur 时用 cloneElement。
 */
export const PortalTooltip: React.FC<PortalTooltipProps> = ({
  content,
  tone = 'neutral',
  children
}) => {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [tipStyle, setTipStyle] = useState<React.CSSProperties>({
    position: 'fixed',
    zIndex: PORTAL_TOOLTIP_Z,
    visibility: 'hidden',
    opacity: 0,
    pointerEvents: 'none'
  });

  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => setOpen(false), []);

  const reposition = useCallback(() => {
    const wrap = wrapRef.current;
    const tip = tipRef.current;
    if (!wrap || !tip) return;

    const wr = wrap.getBoundingClientRect();
    const maxW = Math.min(17 * 16, window.innerWidth - VIEW_PAD_PX * 2);
    let left = Math.max(VIEW_PAD_PX, Math.min(wr.left, window.innerWidth - maxW - VIEW_PAD_PX));
    let top = wr.bottom + GAP_PX;

    const tr = tip.getBoundingClientRect();
    const h = tr.height > 0 ? tr.height : 80;
    if (top + h > window.innerHeight - VIEW_PAD_PX) {
      top = wr.top - h - GAP_PX;
    }
    top = Math.max(VIEW_PAD_PX, top);

    setTipStyle({
      position: 'fixed',
      top,
      left,
      width: maxW,
      maxWidth: maxW,
      zIndex: PORTAL_TOOLTIP_Z,
      visibility: 'visible',
      opacity: 1,
      pointerEvents: 'none',
      transition: 'opacity 150ms ease-out'
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setTipStyle((s) => ({
        ...s,
        visibility: 'hidden',
        opacity: 0
      }));
      return;
    }
    reposition();
  }, [open, content, reposition]);

  useEffect(() => {
    if (!open) return;
    const onReposition = () => reposition();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, reposition]);

  const childProps = children.props as {
    onFocus?: React.FocusEventHandler;
    onBlur?: React.FocusEventHandler;
  };

  const trigger = React.cloneElement(children, {
    onFocus: (e: React.FocusEvent) => {
      show();
      childProps.onFocus?.(e);
    },
    onBlur: (e: React.FocusEvent) => {
      if (!wrapRef.current?.contains(e.relatedTarget as Node | null)) hide();
      childProps.onBlur?.(e);
    }
  });

  const portal =
    open &&
    typeof document !== 'undefined' &&
    createPortal(
      <span
        ref={tipRef}
        role="tooltip"
        className={TONE_TOOLTIP_CLASS[tone]}
        style={tipStyle}
      >
        {content}
      </span>,
      document.body
    );

  return (
    <>
      <span
        ref={wrapRef}
        className="inline-flex shrink-0 items-center align-middle"
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        {trigger}
      </span>
      {portal}
    </>
  );
};

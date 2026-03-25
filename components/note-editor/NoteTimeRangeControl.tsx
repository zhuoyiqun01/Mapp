import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';

export interface NoteTimeRangeChange {
  startYear?: number;
  endYear?: number;
}

interface NoteTimeRangeControlProps {
  startYear?: number;
  endYear?: number;
  onChange: (next: NoteTimeRangeChange) => void;
  themeColor?: string;
  panelChromeStyle?: React.CSSProperties;
  /** 为 false 时收起浮动面板（例如父级编辑器关闭） */
  active?: boolean;
  /** 父级在「关闭其它浮层」时调用，用于收起时间面板 */
  onProvideDismiss?: (dismiss: () => void) => void;
}

const TIME_PANEL_EST_W = 268;

/**
 * 便签起止年编辑：与 NoteEditor 中相同的胶囊按钮 + 固定定位浮动面板。
 */
export const NoteTimeRangeControl: React.FC<NoteTimeRangeControlProps> = ({
  startYear,
  endYear,
  onChange,
  themeColor = '#6366f1',
  panelChromeStyle,
  active = true,
  onProvideDismiss
}) => {
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [editingStartYear, setEditingStartYear] = useState('');
  const [editingEndYear, setEditingEndYear] = useState('');

  const timeAnchorRef = useRef<HTMLDivElement | null>(null);
  const timePanelPortalRef = useRef<HTMLDivElement | null>(null);
  const [timePanelPlacement, setTimePanelPlacement] = useState<{ top: number; left: number } | null>(null);

  const closeTimeEdit = useCallback(() => {
    setIsEditingTime(false);
    setTimePanelPlacement(null);
  }, []);

  const updateTimePanelPlacement = useCallback(() => {
    const el = timeAnchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 8;
    let left = r.left + r.width / 2 - TIME_PANEL_EST_W / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - TIME_PANEL_EST_W - 8));
    setTimePanelPlacement({ top: r.bottom + gap, left });
  }, []);

  useLayoutEffect(() => {
    if (!active || !isEditingTime) {
      setTimePanelPlacement(null);
      return;
    }
    updateTimePanelPlacement();
  }, [active, isEditingTime, updateTimePanelPlacement]);

  useEffect(() => {
    if (!active) {
      closeTimeEdit();
    }
  }, [active, closeTimeEdit]);

  useEffect(() => {
    if (!active || !isEditingTime) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (timeAnchorRef.current?.contains(t)) return;
      if (timePanelPortalRef.current?.contains(t)) return;
      closeTimeEdit();
    };
    const onReposition = () => updateTimePanelPlacement();
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [active, isEditingTime, closeTimeEdit, updateTimePanelPlacement]);

  useEffect(() => {
    if (!onProvideDismiss) return;
    onProvideDismiss(() => closeTimeEdit());
  }, [onProvideDismiss, closeTimeEdit]);

  const timeDisplay = useMemo(() => {
    if (startYear == null) return '-';
    if (endYear != null && endYear !== startYear) return `${startYear}–${endYear}`;
    return String(startYear);
  }, [startYear, endYear]);

  const editingTimePreview = useMemo(() => {
    const s = editingStartYear.trim();
    const e = editingEndYear.trim();
    if (!s) return '-';
    const ps = parseInt(s, 10);
    if (Number.isNaN(ps)) return s;
    if (!e) return String(ps);
    const pe = parseInt(e, 10);
    if (Number.isNaN(pe)) return `${ps}–${e}`;
    if (pe !== ps) return `${ps}–${pe}`;
    return String(ps);
  }, [editingStartYear, editingEndYear]);

  const openTimeEdit = () => {
    setEditingStartYear(startYear != null ? String(startYear) : '');
    setEditingEndYear(endYear != null ? String(endYear) : '');
    setIsEditingTime(true);
  };

  const saveTimeEdit = () => {
    const startStr = editingStartYear.trim();
    const endStr = editingEndYear.trim();

    const parsedStart = startStr ? parseInt(startStr, 10) : undefined;
    const parsedEnd = endStr ? parseInt(endStr, 10) : undefined;

    const nextStartYear =
      parsedStart != null && !Number.isNaN(parsedStart) ? parsedStart : undefined;
    const nextEndYear =
      nextStartYear != null && parsedEnd != null && !Number.isNaN(parsedEnd) && parsedEnd !== nextStartYear
        ? parsedEnd
        : undefined;

    onChange({ startYear: nextStartYear, endYear: nextEndYear });
    closeTimeEdit();
  };

  return (
    <>
      <div ref={timeAnchorRef} className="inline-flex justify-center max-w-full min-w-0">
        {!isEditingTime ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openTimeEdit();
            }}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors max-w-full truncate ${
              startYear == null
                ? 'border-transparent text-gray-400 hover:bg-gray-50'
                : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
            }`}
            title="点击修改起止时间"
          >
            {timeDisplay}
          </button>
        ) : (
          <span
            className="text-xs px-3 py-1.5 rounded-full border border-gray-200 bg-gray-50 text-gray-700 max-w-full truncate whitespace-nowrap select-none cursor-default"
            aria-live="polite"
            title="正在修改起止时间"
          >
            {editingTimePreview}
          </span>
        )}
      </div>

      {isEditingTime &&
        timePanelPlacement &&
        createPortal(
          <div
            ref={timePanelPortalRef}
            className={`flex flex-nowrap items-center gap-1.5 rounded-xl border border-gray-200/90 p-2 shadow-lg ring-1 ring-black/[0.04] whitespace-nowrap ${panelChromeStyle ? '' : 'bg-white'}`}
            style={{
              ...(panelChromeStyle || {}),
              position: 'fixed',
              top: timePanelPlacement.top,
              left: timePanelPlacement.left,
              zIndex: 10003
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <input
              type="number"
              min={1}
              max={9999}
              value={editingStartYear}
              onChange={(e) => setEditingStartYear(e.target.value)}
              className="w-14 shrink-0 px-1.5 py-1 text-xs border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-offset-0"
              style={{ ['--tw-ring-color' as string]: themeColor }}
              autoFocus
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Escape') closeTimeEdit();
                if (e.key === 'Enter') saveTimeEdit();
              }}
            />
            <span className="text-gray-400 text-xs shrink-0">–</span>
            <input
              type="number"
              min={1}
              max={9999}
              value={editingEndYear}
              onChange={(e) => setEditingEndYear(e.target.value)}
              className="w-14 shrink-0 px-1.5 py-1 text-xs border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-offset-0"
              style={{ ['--tw-ring-color' as string]: themeColor }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Escape') closeTimeEdit();
                if (e.key === 'Enter') saveTimeEdit();
              }}
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                saveTimeEdit();
              }}
              className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors shrink-0 border-0 cursor-pointer"
              title="保存起止时间"
            >
              <Check size={16} className="text-green-600" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeTimeEdit();
              }}
              className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors shrink-0 border-0 cursor-pointer"
              title="取消"
            >
              <X size={16} />
            </button>
          </div>,
          document.body
        )}
    </>
  );
};

import React, { useRef, useCallback } from 'react';

type Props = {
  minBound: number;
  maxBound: number;
  rangeMin: number;
  rangeMax: number;
  onChange: (min: number, max: number) => void;
  themeColor: string;
};

/** 画板多选：按年起止区间拖动筛选（双柄） */
export const BoardYearRangeSlider: React.FC<Props> = ({
  minBound,
  maxBound,
  rangeMin,
  rangeMax,
  onChange,
  themeColor,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<'low' | 'high' | null>(null);

  const valueFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return minBound;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return minBound;
      const t = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(minBound + t * (maxBound - minBound));
    },
    [minBound, maxBound]
  );

  const applyLow = (v: number) => {
    const c = Math.max(minBound, Math.min(maxBound, Math.round(v)));
    onChange(Math.min(c, rangeMax), rangeMax);
  };

  const applyHigh = (v: number) => {
    const c = Math.max(minBound, Math.min(maxBound, Math.round(v)));
    onChange(rangeMin, Math.max(c, rangeMin));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const v = valueFromClientX(e.clientX);
    const distL = Math.abs(v - rangeMin);
    const distH = Math.abs(v - rangeMax);
    draggingRef.current = distL <= distH ? 'low' : 'high';
    if (draggingRef.current === 'low') applyLow(v);
    else applyHigh(v);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    e.stopPropagation();
    const v = valueFromClientX(e.clientX);
    if (draggingRef.current === 'low') applyLow(v);
    else applyHigh(v);
  };

  const endDrag = (e: React.PointerEvent) => {
    if (draggingRef.current) {
      draggingRef.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    }
  };

  const span = Math.max(1, maxBound - minBound);
  const pLow = ((rangeMin - minBound) / span) * 100;
  const pHigh = ((rangeMax - minBound) / span) * 100;

  return (
    <div
      ref={trackRef}
      className="relative h-9 w-full cursor-pointer select-none touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-gray-200" />
      <div
        className="pointer-events-none absolute top-1/2 h-1 -translate-y-1/2 rounded-full"
        style={{
          left: `${pLow}%`,
          width: `${Math.max(0, pHigh - pLow)}%`,
          backgroundColor: themeColor,
        }}
      />
      <div
        className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white shadow"
        style={{ left: `${pLow}%`, borderColor: themeColor }}
      />
      <div
        className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white shadow"
        style={{ left: `${pHigh}%`, borderColor: themeColor }}
      />
    </div>
  );
};

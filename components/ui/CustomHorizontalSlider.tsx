import React, { useState, useRef, useEffect, useCallback } from 'react';
import type L from 'leaflet';

export type CustomHorizontalSliderWidth = number | 'stretch';

interface CustomHorizontalSliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** 拖动/点击轨道结束后触发一次（抬起时）；不传则仅 onChange */
  onCommit?: (value: number) => void;
  themeColor: string;
  /** 固定像素宽度，或 `stretch` 占满父级（用于设置面板等自适应布局） */
  width: CustomHorizontalSliderWidth;
  formatValue: (value: number) => string;
  mapInstance: L.Map | null;
}

export const CustomHorizontalSlider: React.FC<CustomHorizontalSliderProps> = ({
  value,
  min,
  max,
  step,
  onChange,
  onCommit,
  themeColor,
  width,
  formatValue,
  mapInstance
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const lastValueRef = useRef(value);
  const draggingRef = useRef(false);

  useEffect(() => {
    lastValueRef.current = value;
  }, [value]);

  const finishPointerInteraction = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsDragging(false);
    onCommit?.(lastValueRef.current);
  }, [onCommit]);

  useEffect(() => {
    if (!isDragging) return;
    const onUp = () => finishPointerInteraction();
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    if (mapInstance) {
      mapInstance.dragging.disable();
    }
    return () => {
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      if (mapInstance) {
        mapInstance.dragging.enable();
      }
    };
  }, [isDragging, mapInstance, finishPointerInteraction]);

  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    draggingRef.current = true;
    setIsDragging(true);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    updateValueFromPointer(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    e.stopPropagation();
    updateValueFromPointer(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    finishPointerInteraction();
  };

  const updateValueFromPointer = (clientX: number) => {
    if (!trackRef.current) return;

    const rect = trackRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    let percent = relativeX / rect.width;
    percent = Math.max(0, Math.min(1, percent));

    const rawValue = min + percent * (max - min);
    const steppedValue = Math.round(rawValue / step) * step;
    const v = Math.max(min, Math.min(max, steppedValue));
    lastValueRef.current = v;
    onChange(v);
  };

  const stretch = width === 'stretch';

  return (
    <div
      className={`flex min-w-0 items-center gap-2 custom-horizontal-slider ${stretch ? 'w-full' : ''}`}
    >
      <div
        ref={trackRef}
        className={`relative h-1 cursor-pointer select-none touch-none ${
          stretch ? 'min-w-0 flex-1' : 'flex'
        }`}
        style={stretch ? undefined : { width: `${width}px` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="absolute top-0 left-0 right-0 h-1 bg-gray-200 rounded-full pointer-events-none" />
        <div
          className="absolute top-0 left-0 h-1 rounded-full pointer-events-none transition-all duration-75"
          style={{
            backgroundColor: themeColor,
            width: `${percentage}%`
          }}
        />
        <div
          className="absolute top-1/2 w-4 h-4 bg-white border-2 rounded-full shadow-md pointer-events-none transition-all duration-75 -translate-y-1/2"
          style={{
            borderColor: themeColor,
            left: `calc(${percentage}% - 8px)`
          }}
        />
      </div>
      <span className="text-xs text-gray-500 whitespace-nowrap min-w-[2rem]">
        {formatValue(value)}
      </span>
    </div>
  );
};

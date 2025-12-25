
import React, { useRef, useEffect, useState } from 'react';
import { DEFAULT_THEME_COLOR } from '../constants';

interface ZoomSliderProps {
  value: number;
  min: number;
  max: number;
  onChange: (val: number) => void;
  onDragChange?: (isDragging: boolean) => void;
  themeColor?: string;
}

export const ZoomSlider: React.FC<ZoomSliderProps> = ({ value, min, max, onChange, onDragChange, themeColor = DEFAULT_THEME_COLOR }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // 通知父组件拖动状态变化
  useEffect(() => {
    onDragChange?.(isDragging);
  }, [isDragging, onDragChange]);

  // Calculate percentage for rendering
  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(true);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    updateValueFromPointer(e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    e.stopPropagation();
    e.preventDefault();
    updateValueFromPointer(e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      e.stopPropagation();
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    }
  };

  const updateValueFromPointer = (clientY: number) => {
    if (!trackRef.current) return;
    
    const rect = trackRef.current.getBoundingClientRect();
    // Calculate relative Y from bottom (since slider goes up)
    // clientY is from top.
    // bottom of rect is rect.top + rect.height
    // value = (rect.bottom - clientY) / rect.height
    
    let percent = (rect.bottom - clientY) / rect.height;
    percent = Math.max(0, Math.min(1, percent));
    
    const rawValue = min + (percent * (max - min));
    
    // For continuous scaling, round to reasonable precision (2 decimal places)
    const continuousValue = Math.round(rawValue * 100) / 100;
    onChange(Math.max(min, Math.min(max, continuousValue)));
  };

  return (
    <div 
        className="bg-white/90 backdrop-blur rounded-full shadow-lg border border-gray-100 h-32 w-8 flex flex-col items-center justify-center py-2 select-none touch-none z-[500]"
        onPointerDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
    >
        <div 
            ref={trackRef}
            className="relative h-28 w-6 flex justify-center cursor-pointer"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
        >
            {/* Track Line */}
            <div className="absolute top-0 bottom-0 w-1 bg-gray-200 rounded-full pointer-events-none" />

            {/* Filled Track */}
            <div 
                className="absolute bottom-0 w-1 rounded-full pointer-events-none transition-all duration-75"
                style={{ backgroundColor: themeColor, height: `${percentage}%` }}
            />

            {/* Circular Thumb */}
            <div 
                className="absolute w-5 h-5 bg-white border-2 rounded-full shadow-md pointer-events-none transition-all duration-75"
                style={{ borderColor: themeColor, bottom: `calc(${percentage}% - 10px)` }}
            />
        </div>
    </div>
  );
};

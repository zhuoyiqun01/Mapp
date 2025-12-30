import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';

interface CustomHorizontalSliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  themeColor: string;
  width: number;
  formatValue: (value: number) => string;
  mapInstance: L.Map | null;
}

export const CustomHorizontalSlider: React.FC<CustomHorizontalSliderProps> = ({
  value,
  min,
  max,
  step,
  onChange,
  themeColor,
  width,
  formatValue,
  mapInstance
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Handle slider drag state to prevent unwanted map interactions
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mouseup', handleGlobalMouseUp);
      // Disable map dragging while slider is being dragged
      if (mapInstance) {
        mapInstance.dragging.disable();
      }
      return () => {
        document.removeEventListener('mouseup', handleGlobalMouseUp);
        // Re-enable map dragging
        if (mapInstance) {
          mapInstance.dragging.enable();
        }
      };
    }
  }, [isDragging, mapInstance]);

  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
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
    if (isDragging) {
      setIsDragging(false);
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    }
  };

  const updateValueFromPointer = (clientX: number) => {
    if (!trackRef.current) return;

    const rect = trackRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    let percent = relativeX / rect.width;
    percent = Math.max(0, Math.min(1, percent));

    const rawValue = min + (percent * (max - min));
    const steppedValue = Math.round(rawValue / step) * step;
    onChange(Math.max(min, Math.min(max, steppedValue)));
  };

  return (
    <div className="flex items-center gap-2 custom-horizontal-slider">
      <div
        ref={trackRef}
        className="relative h-1 flex cursor-pointer select-none touch-none"
        style={{ width: `${width}px` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Track Line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gray-200 rounded-full pointer-events-none" />

        {/* Filled Track */}
        <div
          className="absolute top-0 left-0 h-1 rounded-full pointer-events-none transition-all duration-75"
          style={{
            backgroundColor: themeColor,
            width: `${percentage}%`
          }}
        />

        {/* Circular Thumb */}
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

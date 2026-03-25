import React from 'react';

export interface ChromeLabeledSliderProps {
  label: string;
  chromeSurfaceStyle?: React.CSSProperties;
  className?: string;
  children: React.ReactNode;
}

/**
 * 地图顶栏第二行：带标题的滑块外框（与 MapView 中 Pin Size / Label Size 等一致）。
 */
export const ChromeLabeledSlider: React.FC<ChromeLabeledSliderProps> = ({
  label,
  chromeSurfaceStyle,
  className = '',
  children
}) => (
  <div
    className={`rounded-lg shadow-lg border border-gray-100/80 p-2 flex flex-col items-center gap-1 ${className}`.trim()}
    style={chromeSurfaceStyle}
  >
    <span className="text-xs font-medium text-gray-600 whitespace-nowrap">{label}</span>
    {children}
  </div>
);

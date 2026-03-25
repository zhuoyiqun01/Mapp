import React from 'react';
import { CustomHorizontalSlider, type CustomHorizontalSliderWidth } from './CustomHorizontalSlider';

/** 与图谱编辑工具条内固定宽度滑块一致（px），设置面板内默认用 `stretch` */
export const SETTINGS_COMPACT_SLIDER_TRACK_PX = 90;

type SettingsCompactSliderProps = {
  label: string;
  hint?: React.ReactNode;
  /** 标签行内、hint 右侧的附加控件（如与说明并列的警告图标） */
  labelExtra?: React.ReactNode;
  themeColor: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  formatValue: (v: number) => string;
  minCaption?: string;
  maxCaption?: string;
  /** 默认 `stretch`：在网格列内铺满宽度；传数字则与工具条固定宽一致 */
  trackWidth?: CustomHorizontalSliderWidth;
  className?: string;
};

/**
 * 设置面板用紧凑滑块：标签 `text-xs`，轨道样式与编辑模式一致；默认可在父级网格中横向拉满。
 */
export const SettingsCompactSlider: React.FC<SettingsCompactSliderProps> = ({
  label,
  hint,
  labelExtra,
  themeColor,
  value,
  min,
  max,
  step,
  onChange,
  formatValue,
  minCaption,
  maxCaption,
  trackWidth = 'stretch',
  className = ''
}) => {
  const showCaptions = minCaption != null || maxCaption != null;
  return (
    <div className={`min-w-0 space-y-1 ${className}`.trim()}>
      <div className="flex min-h-[1.125rem] items-center gap-1">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        {hint}
        {labelExtra}
      </div>
      <div className="flex w-full min-w-0 flex-col gap-0.5">
        <CustomHorizontalSlider
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={onChange}
          themeColor={themeColor}
          width={trackWidth}
          formatValue={formatValue}
          mapInstance={null}
        />
        {showCaptions ? (
          <div className="flex w-full min-w-0 justify-between text-[11px] leading-tight text-gray-400">
            <span>{minCaption ?? ''}</span>
            <span>{maxCaption ?? ''}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
};

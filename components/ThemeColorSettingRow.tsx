import React from 'react';
import { Palette } from 'lucide-react';
import { HelpHint } from './ui/HelpHint';

interface ThemeColorSettingRowProps {
  themeColor: string;
  onRequestEdit: () => void;
}

/** 与地图设置面板「界面外观 → 主题色」同一套交互：点击色块打开取色器 */
export const ThemeColorSettingRow: React.FC<ThemeColorSettingRowProps> = ({
  themeColor,
  onRequestEdit
}) => (
  <div>
    <div className="mb-1.5 flex items-center gap-1">
      <Palette size={14} className="shrink-0 text-gray-500" />
      <span className="text-xs font-medium text-gray-600">主题色</span>
      <HelpHint>
        用于地图图钉、收藏标记、主要按钮与边框等强调色；部分导出与预览也会沿用当前主题色。
      </HelpHint>
    </div>
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        className="h-9 w-9 shrink-0 cursor-pointer rounded-lg shadow-sm transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2"
        style={{ backgroundColor: themeColor }}
        onClick={onRequestEdit}
        aria-label="打开主题色选择"
      />
      <div className="min-w-0 flex-1 self-center">
        <div className="truncate font-mono text-[11px] text-gray-500">{themeColor}</div>
      </div>
    </div>
  </div>
);

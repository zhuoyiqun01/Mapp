import React from 'react';
import { SlidersHorizontal, AlertTriangle } from 'lucide-react';
import { ThemeColorSettingRow } from './ThemeColorSettingRow';
import { HelpHint } from './ui/HelpHint';
import { PortalTooltip } from './ui/PortalTooltip';
import { SettingsCompactSlider } from './ui/SettingsCompactSlider';

/** 低于该不透明度时提示可能影响界面可读性（40%） */
const PANEL_OPACITY_READABILITY_WARN_BELOW = 0.4;

export interface AppearanceSettingsBlockProps {
  themeColor: string;
  onRequestThemeEdit: () => void;
  mapUiChromeOpacity: number;
  onMapUiChromeOpacityChange: (opacity: number) => void;
  mapUiChromeBlurPx: number;
  onMapUiChromeBlurPxChange: (blurPx: number) => void;
  /** 为 false 时不渲染顶部「界面外观」标题行（由外层折叠区块展示标题） */
  showSectionHeading?: boolean;
}

/** 设置中与主页「设置」共用的「界面外观」表单（主题色、面板透明度、模糊） */
export const AppearanceSettingsBlock: React.FC<AppearanceSettingsBlockProps> = ({
  themeColor,
  onRequestThemeEdit,
  mapUiChromeOpacity,
  onMapUiChromeOpacityChange,
  mapUiChromeBlurPx,
  onMapUiChromeBlurPxChange,
  showSectionHeading = true
}) => (
  <div>
    {showSectionHeading ? (
      <div className="mb-2 flex items-center gap-1.5">
        <SlidersHorizontal size={16} className="shrink-0 text-gray-600" />
        <h3 className="text-sm font-bold text-gray-800">界面外观</h3>
        <HelpHint>
          统一调整应用中的主题强调色，以及地图与相关面板的玻璃效果（白底区域透明度与背景模糊）。进入项目后地图浮层会立即套用。
        </HelpHint>
      </div>
    ) : null}

    <div className="space-y-3 pl-0.5">
      <ThemeColorSettingRow themeColor={themeColor} onRequestEdit={onRequestThemeEdit} />

      <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2">
        <div className="min-w-0">
          <SettingsCompactSlider
            label="面板背景透明度"
            hint={
              <HelpHint>
                控制工具栏、滑块、搜索等「白底/浅色」浮层的不透明度；越低越能透出背后地图，但文字可读性会下降。
              </HelpHint>
            }
            labelExtra={
              mapUiChromeOpacity < PANEL_OPACITY_READABILITY_WARN_BELOW ? (
                <PortalTooltip
                  tone="warning"
                  content={
                    <p>
                      当前透明度低于 40%，浮层上的文字与按钮可能
                      <strong className="font-semibold">难以辨认</strong>
                      。若看不清界面，请向右调高滑块。
                    </p>
                  }
                >
                  <button
                    type="button"
                    tabIndex={0}
                    className="inline-flex h-5 w-5 cursor-default items-center justify-center rounded-full text-amber-600 outline-none hover:text-amber-800 focus-visible:text-amber-900 focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:ring-offset-1"
                    aria-label="可读性提示：透明度偏低"
                  >
                    <AlertTriangle size={14} strokeWidth={2} />
                  </button>
                </PortalTooltip>
              ) : null
            }
            themeColor={themeColor}
            value={mapUiChromeOpacity}
            min={0.15}
            max={1}
            step={0.05}
            onChange={onMapUiChromeOpacityChange}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            minCaption="更透"
            maxCaption="更不透明"
          />
        </div>

        <div className="min-w-0">
          <SettingsCompactSlider
            label="背景模糊半径"
            hint={
              <HelpHint>
                对浮层背后内容做毛玻璃模糊（对应 CSS{' '}
                <code className="rounded bg-white/15 px-1 font-mono text-[11px] text-gray-100">backdrop-filter: blur()</code>
                ）。设为 0 可关闭模糊以省电或避免旧设备卡顿。
              </HelpHint>
            }
            themeColor={themeColor}
            value={mapUiChromeBlurPx}
            min={0}
            max={24}
            step={1}
            onChange={onMapUiChromeBlurPxChange}
            formatValue={(v) => `${v}px`}
            minCaption="0"
            maxCaption="24px"
          />
        </div>
      </div>
    </div>
  </div>
);

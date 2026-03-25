import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Settings, Map, SlidersHorizontal, LayoutGrid, Network, Table2 } from 'lucide-react';
import { set } from 'idb-keyval';
import { MAP_STYLE_OPTIONS } from '../constants';
import type { Project } from '../types';
import { GraphStyleSettingsBlock } from './GraphStyleSettingsBlock';
import { ThemeColorPicker } from './ThemeColorPicker';
import { AppearanceSettingsBlock } from './AppearanceSettingsBlock';
import { HelpHint } from './ui/HelpHint';
import { SettingsCollapsibleSection } from './ui/SettingsCollapsibleSection';
import { SettingsCompactSlider } from './ui/SettingsCompactSlider';
import { mapChromeSurfaceStyle, MODAL_BACKDROP_MASK_STYLE } from '../utils/map/mapChromeStyle';

/** 由打开设置时所在的视图决定默认展开哪一块，其余折叠 */
export type SettingsContextView = 'map' | 'board' | 'graph' | 'table';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** 当前一级视图：决定各折叠区块初始展开状态 */
  settingsContextView: SettingsContextView;
  themeColor: string;
  onThemeColorChange?: (color: string) => void | Promise<void>;
  mapUiChromeOpacity: number;
  onMapUiChromeOpacityChange: (opacity: number) => void;
  mapUiChromeBlurPx: number;
  onMapUiChromeBlurPxChange: (blurPx: number) => void;
  currentMapStyle: string;
  onMapStyleChange: (styleId: string) => void;
  pinSize?: number;
  onPinSizeChange?: (size: number) => void;
  clusterThreshold?: number;
  onClusterThresholdChange?: (threshold: number) => void;
  labelSize?: number;
  onLabelSizeChange?: (size: number) => void;
  /** 有则展示 Graph Style，并写入项目 */
  graphProject?: Project;
  onGraphProjectPatch?: (patch: Partial<Project>) => void | Promise<void>;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen,
  onClose,
  settingsContextView,
  themeColor,
  onThemeColorChange,
  mapUiChromeOpacity,
  onMapUiChromeOpacityChange,
  mapUiChromeBlurPx,
  onMapUiChromeBlurPxChange,
  currentMapStyle,
  onMapStyleChange,
  pinSize,
  onPinSizeChange,
  clusterThreshold,
  onClusterThresholdChange,
  labelSize,
  onLabelSizeChange,
  graphProject,
  onGraphProjectPatch
}) => {
  const [showThemeColorPicker, setShowThemeColorPicker] = useState(false);

  if (!isOpen) return null;

  if (typeof document === 'undefined') return null;

  const handleMapStyleSelect = (styleId: string) => {
    onMapStyleChange(styleId);
    set('mapp-map-style', styleId);
  };

  const openMapping = settingsContextView === 'map';
  const openBoard = settingsContextView === 'board';
  const openGraph = settingsContextView === 'graph';
  const openTable = settingsContextView === 'table';

  const settingsCardChrome = mapChromeSurfaceStyle(mapUiChromeOpacity, mapUiChromeBlurPx);

  return createPortal(
    <>
      {/* 挂到 body，避免被地图父级 stacking/overflow 裁切导致底部未遮罩（黑块） */}
      <div
        className="fixed inset-0 z-[5000] min-h-[100dvh] min-h-screen w-full"
        style={MODAL_BACKDROP_MASK_STYLE}
        onClick={onClose}
        onPointerDown={(e) => e.stopPropagation()}
        aria-hidden
      />

      {/* Settings Card */}
      <div
        data-allow-context-menu
        className="fixed top-1/2 left-3 right-3 z-[5001] mx-auto w-full max-w-md sm:max-w-lg sm:left-4 sm:right-4 -translate-y-1/2 transform"
      >
        <div
          className="rounded-xl shadow-2xl flex flex-col max-h-[min(85dvh,85vh)] overflow-hidden border border-gray-200/80"
          style={settingsCardChrome}
        >
        {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
              <Settings size={20} className="text-gray-700" />
              <h2 className="text-xl font-semibold text-gray-900">Settings</h2>
          </div>
          <button
            onClick={onClose}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
              <X size={20} className="text-gray-600" />
          </button>
        </div>

        {/* Content */}
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-4 theme-surface-scrollbar">
          <SettingsCollapsibleSection
            title="界面外观"
            icon={<SlidersHorizontal size={18} />}
            defaultOpen={false}
            themeColor={themeColor}
            hint={
              <HelpHint>
                统一调整应用中的主题强调色，以及地图与相关面板的玻璃效果（白底区域透明度与背景模糊）。进入项目后地图浮层会立即套用。
              </HelpHint>
            }
          >
            <AppearanceSettingsBlock
              themeColor={themeColor}
              onRequestThemeEdit={() => setShowThemeColorPicker(true)}
              mapUiChromeOpacity={mapUiChromeOpacity}
              onMapUiChromeOpacityChange={onMapUiChromeOpacityChange}
              mapUiChromeBlurPx={mapUiChromeBlurPx}
              onMapUiChromeBlurPxChange={onMapUiChromeBlurPxChange}
              showSectionHeading={false}
            />
          </SettingsCollapsibleSection>

          <SettingsCollapsibleSection
            title="Mapping Style"
            icon={<Map size={18} />}
            defaultOpen={openMapping}
            themeColor={themeColor}
            hint={
              <HelpHint>
                底图瓦片风格、地图上的图钉与文字标签大小，以及标记聚合距离。切换底图后会重新加载瓦片；图钉与聚合仅影响地图视图显示，不改变便签数据。
              </HelpHint>
            }
          >
            <div className="flex flex-col gap-4">
              <div className="flex flex-col overflow-hidden rounded-lg border border-gray-200/50 divide-y divide-gray-200/40">
                {MAP_STYLE_OPTIONS.map((style) => (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => handleMapStyleSelect(style.id)}
                    className={`w-full border-0 px-2.5 py-1.5 text-left text-xs transition-colors ${
                      currentMapStyle === style.id
                        ? 'font-medium text-gray-900'
                        : 'text-gray-600 hover:bg-black/[0.03]'
                    }`}
                    style={
                      currentMapStyle === style.id
                        ? { boxShadow: `inset 3px 0 0 0 ${themeColor}` }
                        : undefined
                    }
                  >
                    {style.name}
                  </button>
                ))}
              </div>

              {pinSize !== undefined &&
              onPinSizeChange &&
              clusterThreshold !== undefined &&
              onClusterThresholdChange ? (
                <>
                  <div className="border-t border-gray-200/60 pt-3 text-xs font-medium text-gray-500">地图控件</div>
                  <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2">
                    <div className="min-w-0">
                      <SettingsCompactSlider
                        label="Pin Size"
                        hint={
                          <HelpHint>缩放地图上每个便签定位图钉（水滴标）的显示大小，便于在密集区域点选。</HelpHint>
                        }
                        themeColor={themeColor}
                        value={pinSize}
                        min={0.5}
                        max={2}
                        step={0.1}
                        onChange={onPinSizeChange}
                        formatValue={(v) => `${v.toFixed(1)}x`}
                        minCaption="0.5x"
                        maxCaption="2.0x"
                      />
                    </div>

                    {labelSize !== undefined && onLabelSizeChange ? (
                      <div className="min-w-0">
                        <SettingsCompactSlider
                          label="Label Size"
                          hint={
                            <HelpHint>缩放地图上便签标题等文字标签的整体字号与占用范围；与图钉大小相互独立。</HelpHint>
                          }
                          themeColor={themeColor}
                          value={labelSize}
                          min={0.5}
                          max={2}
                          step={0.1}
                          onChange={onLabelSizeChange}
                          formatValue={(v) => `${v.toFixed(1)}x`}
                          minCaption="0.5x"
                          maxCaption="2.0x"
                        />
                      </div>
                    ) : null}

                    <div className="min-w-0">
                      <SettingsCompactSlider
                        label="Cluster Threshold"
                        hint={
                          <HelpHint>
                            两个便签在屏幕上的距离小于该像素阈值时，会合并显示为带数字的聚合标记；数值越大越容易聚成一团，地图缩放后也会重新计算。
                          </HelpHint>
                        }
                        themeColor={themeColor}
                        value={clusterThreshold}
                        min={1}
                        max={100}
                        step={5}
                        onChange={onClusterThresholdChange}
                        formatValue={(v) => `${v}px`}
                        minCaption="1px"
                        maxCaption="100px"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <p className="border-t border-gray-200/60 pt-3 text-xs leading-relaxed text-gray-500">
                  图钉、标签与聚合滑块仅在<strong>地图视图</strong>中可用；在此仍可切换底图，切换地图后即时生效。
                </p>
              )}
            </div>
          </SettingsCollapsibleSection>

          <SettingsCollapsibleSection
            title="Board Style"
            icon={<LayoutGrid size={18} />}
            defaultOpen={openBoard}
            themeColor={themeColor}
          >
            <p className="py-2 text-xs leading-relaxed text-gray-500">看板视图相关样式将放在此处，敬请期待。</p>
          </SettingsCollapsibleSection>

          <SettingsCollapsibleSection
            title="Graph Style"
            icon={<Network size={18} />}
            defaultOpen={openGraph}
            themeColor={themeColor}
          >
            {graphProject && onGraphProjectPatch ? (
              <GraphStyleSettingsBlock
                themeColor={themeColor}
                project={graphProject}
                onPatch={(patch) => void onGraphProjectPatch(patch)}
              />
            ) : (
              <p className="py-2 text-xs leading-relaxed text-gray-500">
                当前无法写入图谱样式（未打开项目或缺少保存接口）。
              </p>
            )}
          </SettingsCollapsibleSection>

          <SettingsCollapsibleSection
            title="Table Style"
            icon={<Table2 size={18} />}
            defaultOpen={openTable}
            themeColor={themeColor}
          >
            <p className="py-2 text-xs leading-relaxed text-gray-500">表格视图相关样式将放在此处，敬请期待。</p>
          </SettingsCollapsibleSection>
          </div>
        </div>
      </div>

      {/* Theme Color Picker Modal */}
      {showThemeColorPicker && (
        <ThemeColorPicker
          isOpen={showThemeColorPicker}
          onClose={() => setShowThemeColorPicker(false)}
          currentColor={themeColor}
          panelChromeStyle={settingsCardChrome}
          onColorChange={(c) => {
            onThemeColorChange?.(c);
          }}
        />
      )}
    </>,
    document.body
  );
};

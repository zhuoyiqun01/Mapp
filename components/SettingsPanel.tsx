import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Settings, Map, ChevronDown, Grid, GitBranch, Table2 } from 'lucide-react';
import { set } from 'idb-keyval';
import { MAP_STYLE_OPTIONS } from '../constants';
import type { Project } from '../types';
import { GraphStyleSettingsBlock } from './GraphStyleSettingsBlock';
import { ThemeColorPicker } from './ThemeColorPicker';
import { HelpHint } from './ui/HelpHint';
import { SettingsCollapsibleSection } from './ui/SettingsCollapsibleSection';
import { SettingsCompactSlider } from './ui/SettingsCompactSlider';
import { mapChromeSurfaceStyle, MODAL_BACKDROP_MASK_STYLE } from '../utils/map/mapChromeStyle';
import { PORTAL_TOOLTIP_Z } from './ui/PortalTooltip';

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
  boardVariantToggles?: {
    primary: boolean;
    image: boolean;
    onChange: (next: { primary: boolean; image: boolean }) => void;
  };
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
  onGraphProjectPatch,
  boardVariantToggles
}) => {
  const [showThemeColorPicker, setShowThemeColorPicker] = useState(false);
  const [mapBgMenuOpen, setMapBgMenuOpen] = useState(false);
  const mapBgTriggerRef = useRef<HTMLButtonElement>(null);
  const mapBgMenuRef = useRef<HTMLDivElement>(null);
  const [mapBgMenuRect, setMapBgMenuRect] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) setMapBgMenuOpen(false);
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!mapBgMenuOpen || !mapBgTriggerRef.current) {
      setMapBgMenuRect(null);
      return;
    }
    const update = () => {
      const el = mapBgTriggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const gap = 6;
      const pad = 10;
      const belowTop = r.bottom + gap;
      const maxHeight = Math.max(120, window.innerHeight - belowTop - pad);
      setMapBgMenuRect({
        top: belowTop,
        left: r.left,
        width: r.width,
        maxHeight
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [mapBgMenuOpen]);

  useEffect(() => {
    if (!mapBgMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (mapBgTriggerRef.current?.contains(t)) return;
      if (mapBgMenuRef.current?.contains(t)) return;
      setMapBgMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMapBgMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [mapBgMenuOpen]);

  if (!isOpen) return null;

  if (typeof document === 'undefined') return null;

  const handleMapStyleSelect = (styleId: string) => {
    onMapStyleChange(styleId);
    set('mapp-map-style', styleId);
    setMapBgMenuOpen(false);
  };

  const currentMapStyleLabel =
    MAP_STYLE_OPTIONS.find((s) => s.id === currentMapStyle)?.name ?? currentMapStyle;

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

        {/* 底图：独立条带 + 下拉（portal 叠在卡片之上，选完收起） */}
        <div className="shrink-0 border-b border-gray-200/60 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs font-medium text-gray-600">底图背景</span>
            <button
              ref={mapBgTriggerRef}
              type="button"
              aria-expanded={mapBgMenuOpen}
              aria-haspopup="listbox"
              onClick={() => setMapBgMenuOpen((o) => !o)}
              className="min-w-0 flex flex-1 items-center justify-between gap-2 rounded-lg border border-gray-200/70 bg-white/60 px-2.5 py-1.5 text-left text-xs text-gray-900 shadow-sm transition-colors hover:bg-white/90"
            >
              <span className="truncate">{currentMapStyleLabel}</span>
              <ChevronDown
                size={16}
                className={`shrink-0 text-gray-500 transition-transform ${mapBgMenuOpen ? 'rotate-180' : ''}`}
              />
            </button>
          </div>
        </div>

        {/* Content */}
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-4 theme-surface-scrollbar">
          <SettingsCollapsibleSection
            title="Mapping Style"
            icon={<Map size={18} />}
            defaultOpen={openMapping}
            themeColor={themeColor}
            hint={
              <HelpHint>
                底图请在上方「底图背景」中选择；此处为地图上的图钉与文字标签大小，以及标记聚合距离。切换底图后会重新加载瓦片；图钉与聚合仅影响地图视图显示，不改变便签数据。
              </HelpHint>
            }
          >
            <div className="flex flex-col gap-4">
              {pinSize !== undefined &&
              onPinSizeChange &&
              clusterThreshold !== undefined &&
              onClusterThresholdChange ? (
                <>
                  <div className="text-xs font-medium text-gray-500">地图控件</div>
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
                <p className="text-xs leading-relaxed text-gray-500">
                  图钉、标签与聚合滑块仅在<strong>地图视图</strong>中可用；底图可在上方随时切换，进入地图后即时生效。
                </p>
              )}
            </div>
          </SettingsCollapsibleSection>

          <SettingsCollapsibleSection
            title="Board Style"
            icon={<Grid size={18} />}
            defaultOpen={openBoard}
            themeColor={themeColor}
          >
            {boardVariantToggles ? (
              <>
                <p className="py-1 text-xs leading-relaxed text-gray-500">
                  显示类型（便签 / 图片）
                </p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={boardVariantToggles.primary}
                      onChange={(e) =>
                        boardVariantToggles.onChange({
                          primary: e.target.checked,
                          image: boardVariantToggles.image
                        })
                      }
                      className="h-4 w-4 rounded border-gray-200"
                      style={{ accentColor: 'var(--theme-color)' }}
                    />
                    <span>便签</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={boardVariantToggles.image}
                      onChange={(e) =>
                        boardVariantToggles.onChange({
                          primary: boardVariantToggles.primary,
                          image: e.target.checked
                        })
                      }
                      className="h-4 w-4 rounded border-gray-200"
                      style={{ accentColor: 'var(--theme-color)' }}
                    />
                    <span>图片</span>
                  </label>
                </div>
              </>
            ) : (
              <p className="py-2 text-xs leading-relaxed text-gray-500">
                看板视图相关样式将放在此处，敬请期待。
              </p>
            )}
          </SettingsCollapsibleSection>

          <SettingsCollapsibleSection
            title="Graph Style"
            icon={<GitBranch size={18} />}
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

      {mapBgMenuOpen && mapBgMenuRect &&
        createPortal(
          <div
            ref={mapBgMenuRef}
            role="listbox"
            className="fixed overflow-hidden rounded-lg border border-gray-200/80 bg-white/95 py-1 shadow-xl backdrop-blur-sm theme-surface-scrollbar"
            style={{
              zIndex: PORTAL_TOOLTIP_Z,
              top: mapBgMenuRect.top,
              left: mapBgMenuRect.left,
              width: mapBgMenuRect.width,
              maxHeight: mapBgMenuRect.maxHeight,
              overflowY: 'auto'
            }}
          >
            {MAP_STYLE_OPTIONS.map((style) => (
              <button
                key={style.id}
                type="button"
                role="option"
                aria-selected={currentMapStyle === style.id}
                onClick={() => handleMapStyleSelect(style.id)}
                className={`flex w-full border-0 px-2.5 py-1.5 text-left text-xs transition-colors ${
                  currentMapStyle === style.id
                    ? 'font-medium text-gray-900'
                    : 'text-gray-600 hover:bg-black/[0.04]'
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
          </div>,
          document.body
        )}
    </>,
    document.body
  );
};

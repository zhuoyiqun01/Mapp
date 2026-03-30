import React from 'react';
import { Edit3, Save } from 'lucide-react';
import type { Frame } from '../../../types';
import type { GraphLayerGroupStandard } from '../../../utils/graph/graphRuntimeCore';
import { ChromeIconButton } from '../../ui/ChromeIconButton';
import { LayerToolbarIcon } from '../../ui/LayerToolbarIcon';

interface MapLayerControlProps {
  showPanel: boolean;
  onTogglePanel: () => void;
  themeColor: string;
  chromeSurfaceStyle?: React.CSSProperties;
  chromeHoverBackground?: string;
  frames: Frame[] | undefined;
  frameLayerVisibility: Record<string, boolean>;
  setFrameLayerVisibility: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  showAllFrames: boolean;
  setShowAllFrames: (v: boolean) => void;
  activeFrame?: Frame | null;
  editingFrameDescription?: string | null;
  setEditingFrameDescription?: (v: string | null) => void;
  onSaveFrameDescription?: () => void;
  frameLayerRef: React.RefObject<HTMLDivElement | null>;
  /** 统一节点图层（tag/frame），排在帧描述/帧列表左侧 */
  unifiedNotesLayerSlot?: React.ReactNode;
  /** 展开面板相对图层按钮：`start`=左边缘对齐（主地图顶栏），`end`=右边缘对齐（右上角工具条等） */
  dropdownAlign?: 'start' | 'end';
  /** 工具栏按钮图标：与图层面板当前 tag/frame 一致 */
  layerGroupStandard?: GraphLayerGroupStandard;
}

export const MapLayerControl: React.FC<MapLayerControlProps> = ({
  showPanel,
  onTogglePanel,
  themeColor,
  chromeSurfaceStyle,
  chromeHoverBackground,
  frames,
  frameLayerVisibility,
  setFrameLayerVisibility,
  showAllFrames,
  setShowAllFrames,
  activeFrame = null,
  editingFrameDescription = null,
  setEditingFrameDescription = () => {},
  onSaveFrameDescription = () => {},
  frameLayerRef,
  unifiedNotesLayerSlot,
  dropdownAlign = 'end',
  layerGroupStandard = 'tag'
}) => {
  const ch = chromeSurfaceStyle;
  const panelAnchorCls = dropdownAlign === 'start' ? 'left-0' : 'right-0';
  return (
  <div className="relative" ref={frameLayerRef}>
    <ChromeIconButton
      themeColor={themeColor}
      chromeSurfaceStyle={ch}
      chromeHoverBackground={chromeHoverBackground}
      active={showPanel}
      pressThemeFlash
      nonChromeIdleHover="imperative-gray100"
      onClick={() => onTogglePanel()}
      title={
        layerGroupStandard === 'tag'
          ? '图层（标签组顺序、显隐、半径权重）'
          : '图层（帧组顺序、显隐、半径权重）'
      }
    >
      <LayerToolbarIcon layerGroupStandard={layerGroupStandard} />
    </ChromeIconButton>

    {showPanel && (
      <div className={`absolute ${panelAnchorCls} top-full flex gap-2 items-start pointer-events-none mt-2`}>
        {unifiedNotesLayerSlot ? (
          <div
            className="pointer-events-auto shrink-0"
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            {unifiedNotesLayerSlot}
          </div>
        ) : null}
        {activeFrame && (
          <div
            className={`w-72 sm:w-80 rounded-xl shadow-xl border border-gray-100 flex flex-col pointer-events-auto overflow-hidden animate-in fade-in slide-in-from-right-4 ${ch ? '' : 'bg-white'}`}
            style={{ maxHeight: '60vh', ...ch }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <div className="p-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
              <div className="flex items-center gap-2 overflow-hidden">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: activeFrame.color }} />
                <h3 className="font-bold text-gray-800 truncate text-xs">{activeFrame.title}</h3>
              </div>
              {editingFrameDescription === null ? (
                <button
                  onClick={() => setEditingFrameDescription(activeFrame.description || '')}
                  className="p-1 hover:bg-gray-200 rounded transition-colors text-gray-500"
                  title="Edit Description"
                >
                  <Edit3 size={12} />
                </button>
              ) : (
                <button
                  onClick={onSaveFrameDescription}
                  className="p-1 hover:bg-green-100 text-green-600 rounded transition-colors"
                  title="Save Description"
                >
                  <Save size={12} />
                </button>
              )}
            </div>

            <div
              className={`flex-1 overflow-y-auto p-3 custom-scrollbar ${ch ? '' : 'bg-white'}`}
              style={ch ? { backgroundColor: 'transparent' } : undefined}
            >
              {editingFrameDescription !== null ? (
                <textarea
                  autoFocus
                  value={editingFrameDescription}
                  onChange={(e) => setEditingFrameDescription(e.target.value)}
                  className="w-full h-full min-h-[100px] bg-transparent border-none focus:ring-0 p-0 text-xs text-gray-800 resize-none"
                />
              ) : (
                <div className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap break-words">
                  {activeFrame.description || (
                    <span className="text-gray-400 italic">No description added yet. Click edit icon.</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )}
  </div>
  );
};

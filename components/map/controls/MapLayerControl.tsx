import React from 'react';
import { Layers, Edit3, Save } from 'lucide-react';
import type { Frame } from '../../../types';
import { ChromeIconButton } from '../../ui/ChromeIconButton';

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
  activeFrame: Frame | null;
  editingFrameDescription: string | null;
  setEditingFrameDescription: (v: string | null) => void;
  onSaveFrameDescription: () => void;
  frameLayerRef: React.RefObject<HTMLDivElement | null>;
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
  activeFrame,
  editingFrameDescription,
  setEditingFrameDescription,
  onSaveFrameDescription,
  frameLayerRef
}) => {
  const ch = chromeSurfaceStyle;
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
      title="图层"
    >
      <Layers size={18} className="sm:w-5 sm:h-5" />
    </ChromeIconButton>

    {showPanel && (
      <div className="absolute right-0 top-full flex gap-2 items-start pointer-events-none mt-2">
        {activeFrame && (
          <div
            className={`w-72 sm:w-80 rounded-xl shadow-xl border border-gray-100 flex flex-col pointer-events-auto overflow-hidden animate-in fade-in slide-in-from-right-4 ${ch ? '' : 'bg-white'}`}
            style={{ maxHeight: '60vh', ...ch }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
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

        <div
          className={`w-56 rounded-xl shadow-xl border border-gray-100 py-2 pointer-events-auto shrink-0 ${ch ? '' : 'bg-white'}`}
          style={ch}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide">Frame Layers</div>
          <div className="h-px bg-gray-100 mb-1" />

          <div className="px-3 py-2 flex items-center justify-between hover:bg-gray-50">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700 font-medium">Show All</span>
            </div>
            <input
              type="checkbox"
              checked={showAllFrames}
              onChange={(e) => {
                e.stopPropagation();
                setShowAllFrames(!showAllFrames);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className={`w-4 h-4 rounded border-2 cursor-pointer appearance-none ${showAllFrames ? '' : 'bg-transparent'}`}
              style={{ backgroundColor: showAllFrames ? themeColor : 'transparent', borderColor: themeColor }}
            />
          </div>

          {!showAllFrames && (
            <>
              <div className="h-px bg-gray-100 my-1" />
              {frames?.map((frame) => (
                <div
                  key={frame.id}
                  className="px-3 py-2 flex items-center justify-between hover:bg-gray-50 cursor-pointer group"
                  onClick={(e) => {
                    e.stopPropagation();
                    const isMulti = e.ctrlKey || e.metaKey || e.shiftKey;
                    if (isMulti) {
                      setFrameLayerVisibility(prev => ({
                        ...prev,
                        [frame.id]: !prev[frame.id]
                      }));
                    } else {
                      const newVisibility: Record<string, boolean> = {};
                      frames?.forEach(f => {
                        newVisibility[f.id] = f.id === frame.id;
                      });
                      setFrameLayerVisibility(newVisibility);
                    }
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded border border-gray-300" style={{ backgroundColor: frame.color }} />
                    <span className="text-sm text-gray-700 truncate" title={frame.title}>{frame.title}</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={frameLayerVisibility[frame.id] ?? true}
                    readOnly
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    className={`w-4 h-4 rounded border-2 cursor-pointer appearance-none pointer-events-none ${
                      frameLayerVisibility[frame.id] ?? true ? '' : 'bg-transparent'
                    }`}
                    style={{
                      backgroundColor: (frameLayerVisibility[frame.id] ?? true) ? themeColor : 'transparent',
                      borderColor: themeColor
                    }}
                  />
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    )}
  </div>
  );
};

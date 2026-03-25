import React from 'react';
import { Code, Zap, Star, ArrowUp, Locate, Check } from 'lucide-react';
import { NoteIconButton } from './NoteIconButton';

interface NoteHeaderProps {
  themeColor: string;
  panelChromeStyle?: React.CSSProperties;
  isPreviewMode: boolean;
  onSetPreviewMode: (preview: boolean) => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;

  showUpgrade: boolean;
  onUpgrade?: () => void;

  showLocateBoard: boolean;
  onLocateBoard?: () => void;

  showLocateMap: boolean;
  onLocateMap?: () => void;

  onSave: () => void;

  /** 中间区域（如起止时间），与左右工具条同一行 */
  centerSlot: React.ReactNode;
}

export const NoteHeader: React.FC<NoteHeaderProps> = ({
  themeColor,
  panelChromeStyle,
  isPreviewMode,
  onSetPreviewMode,
  isFavorite,
  onToggleFavorite,
  showUpgrade,
  onUpgrade,
  showLocateBoard,
  onLocateBoard,
  showLocateMap,
  onLocateMap,
  onSave,
  centerSlot,
}) => {
  return (
    <div className="flex items-center gap-2 p-4 pb-2 flex-shrink-0 relative">
      <div className="flex items-center gap-0.5 bg-gray-100 rounded-xl p-1 shrink-0">
        <button
          type="button"
          onClick={() => onSetPreviewMode(true)}
          className={`p-2 rounded-lg transition-all ${
            isPreviewMode
              ? panelChromeStyle
                ? 'shadow-sm text-gray-900'
                : 'bg-white shadow-sm text-gray-900'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          style={isPreviewMode && panelChromeStyle ? panelChromeStyle : undefined}
          title="即时模式 (飞书感)"
        >
          <Zap size={18} strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => onSetPreviewMode(false)}
          className={`p-2 rounded-lg transition-all ${
            !isPreviewMode
              ? panelChromeStyle
                ? 'shadow-sm text-gray-900'
                : 'bg-white shadow-sm text-gray-900'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          style={!isPreviewMode && panelChromeStyle ? panelChromeStyle : undefined}
          title="源码模式 (Markdown)"
        >
          <Code size={18} strokeWidth={2} />
        </button>
      </div>

      <div
        className="flex-1 min-w-0 flex justify-center items-center px-2 pointer-events-auto min-h-9"
        onClick={(e) => e.stopPropagation()}
      >
        {centerSlot}
      </div>

      <div className="flex items-center gap-1.5 shrink-0 relative z-10">
        <button
          type="button"
          onClick={onToggleFavorite}
          title={isFavorite ? '取消收藏' : '收藏'}
          className={`rounded-full p-2 min-h-9 min-w-9 box-border inline-flex items-center justify-center transition-colors active:scale-95 ${
            isFavorite
              ? 'bg-black/[0.06] hover:bg-black/[0.1]'
              : 'text-gray-400 hover:text-gray-600 hover:bg-black/5'
          }`}
          style={isFavorite ? { color: themeColor } : undefined}
        >
          <Star size={22} strokeWidth={2} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>

        {showUpgrade && onUpgrade && (
          <NoteIconButton onClick={onUpgrade} variant="success" title="升级为标准便签">
            <ArrowUp size={22} strokeWidth={2} />
          </NoteIconButton>
        )}

        {showLocateBoard && onLocateBoard && (
          <NoteIconButton onClick={onLocateBoard} variant="neutral" title="定位到board视图">
            <Locate size={22} strokeWidth={2} className="text-gray-400 hover:text-gray-600" />
          </NoteIconButton>
        )}

        {showLocateMap && onLocateMap && (
          <NoteIconButton onClick={onLocateMap} variant="neutral" title="定位到地图视图">
            <Locate size={22} strokeWidth={2} className="text-gray-400 hover:text-gray-600" />
          </NoteIconButton>
        )}

        <NoteIconButton onClick={onSave} variant="neutral" title="保存">
          <Check size={22} strokeWidth={2.5} />
        </NoteIconButton>
      </div>
    </div>
  );
};


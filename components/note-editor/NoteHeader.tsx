import React from 'react';
import { Code, Zap, Star, Trash2, ArrowUp, Locate, Check } from 'lucide-react';

interface NoteHeaderProps {
  themeColor: string;
  isPreviewMode: boolean;
  onSetPreviewMode: (preview: boolean) => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;

  showDelete: boolean;
  onDelete?: () => void;

  showUpgrade: boolean;
  onUpgrade?: () => void;

  showLocateBoard: boolean;
  onLocateBoard?: () => void;

  showLocateMap: boolean;
  onLocateMap?: () => void;

  onSave: () => void;
}

export const NoteHeader: React.FC<NoteHeaderProps> = ({
  themeColor,
  isPreviewMode,
  onSetPreviewMode,
  isFavorite,
  onToggleFavorite,
  showDelete,
  onDelete,
  showUpgrade,
  onUpgrade,
  showLocateBoard,
  onLocateBoard,
  showLocateMap,
  onLocateMap,
  onSave
}) => {
  return (
    <div className="flex justify-between items-start p-4 pb-2 relative flex-shrink-0">
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => onSetPreviewMode(true)}
          className={`p-1.5 rounded-md transition-all ${
            isPreviewMode ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
          }`}
          title="即时模式 (飞书感)"
        >
          <Zap size={18} />
        </button>
        <button
          onClick={() => onSetPreviewMode(false)}
          className={`p-1.5 rounded-md transition-all ${
            !isPreviewMode ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
          }`}
          title="源码模式 (Markdown)"
        >
          <Code size={18} />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onToggleFavorite}
          className={`rounded-full p-1.5 transition-colors active:scale-90 ${
            isFavorite ? 'text-white' : 'text-gray-400 hover:text-gray-600 hover:bg-black/5'
          }`}
          style={isFavorite ? { backgroundColor: themeColor } : undefined}
          title={isFavorite ? '取消收藏' : '收藏'}
        >
          <Star size={24} fill={isFavorite ? themeColor : 'none'} />
        </button>

        {showDelete && onDelete && (
          <button
            onClick={onDelete}
            className="text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full p-1.5 transition-colors active:scale-90"
          >
            <Trash2 size={24} />
          </button>
        )}

        {showUpgrade && onUpgrade && (
          <button
            onClick={onUpgrade}
            className="text-green-400 hover:text-green-600 hover:bg-green-50 rounded-full p-1.5 transition-colors active:scale-90"
            title="升级为标准便签"
          >
            <ArrowUp size={24} />
          </button>
        )}

        {showLocateBoard && onLocateBoard && (
          <button
            onClick={onLocateBoard}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-full p-1.5 transition-colors active:scale-90"
            title="定位到board视图"
          >
            <Locate size={24} className="text-gray-400 hover:text-gray-600" />
          </button>
        )}

        {showLocateMap && onLocateMap && (
          <button
            onClick={onLocateMap}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-full p-1.5 transition-colors active:scale-90"
            title="定位到地图视图"
          >
            <Locate size={24} className="text-gray-400 hover:text-gray-600" />
          </button>
        )}

        <button
          onClick={onSave}
          className="text-gray-400 hover:text-gray-600 hover:bg-black/5 rounded-full p-1.5 transition-colors active:scale-90"
        >
          <Check size={28} />
        </button>
      </div>
    </div>
  );
};


import React from 'react';
import { Code, Zap, Star, Trash2, ArrowUp, Locate, Check } from 'lucide-react';
import { NoteIconButton } from './NoteIconButton';

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
  onSave,
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
        <NoteIconButton
          onClick={onToggleFavorite}
          variant="primary"
          themeColor={themeColor}
          active={isFavorite}
          title={isFavorite ? '取消收藏' : '收藏'}
        >
          <Star size={24} fill={isFavorite ? themeColor : 'none'} />
        </NoteIconButton>

        {showDelete && onDelete && (
          <NoteIconButton onClick={onDelete} variant="danger">
            <Trash2 size={24} />
          </NoteIconButton>
        )}

        {showUpgrade && onUpgrade && (
          <NoteIconButton onClick={onUpgrade} variant="success" title="升级为标准便签">
            <ArrowUp size={24} />
          </NoteIconButton>
        )}

        {showLocateBoard && onLocateBoard && (
          <NoteIconButton onClick={onLocateBoard} variant="neutral" title="定位到board视图">
            <Locate size={24} className="text-gray-400 hover:text-gray-600" />
          </NoteIconButton>
        )}

        {showLocateMap && onLocateMap && (
          <NoteIconButton onClick={onLocateMap} variant="neutral" title="定位到地图视图">
            <Locate size={24} className="text-gray-400 hover:text-gray-600" />
          </NoteIconButton>
        )}

        <NoteIconButton onClick={onSave} variant="neutral">
          <Check size={28} />
        </NoteIconButton>
      </div>
    </div>
  );
};


import React from 'react';
import { Camera, PenTool, X, Check } from 'lucide-react';
import type { Tag } from '../../types';
import { TAG_COLORS } from '../../constants';
import { EmojiPicker } from './EmojiPicker';

interface MediaGalleryProps {
  isCompactMode: boolean;

  emoji: string;
  setEmoji: (emoji: string) => void;
  showEmojiPicker: boolean;
  setShowEmojiPicker: (open: boolean) => void;
  emojiButtonRef: React.RefObject<HTMLDivElement | null>;
  emojiPickerPosition: { left: number; top: number } | null;
  setEmojiPickerPosition: (pos: { left: number; top: number } | null) => void;

  images: string[];
  onPreviewImage: (index: number) => void;
  onRemoveImage: (index: number) => void;
  onUploadImages: (e: React.ChangeEvent<HTMLInputElement>) => void;

  sketch?: string;
  onOpenSketch: () => void;
  onRemoveSketch: () => void;

  tags: Tag[];
  editingTagId: string | null;
  isAddingTag: boolean;
  newTagLabel: string;
  newTagColor: string;
  setNewTagLabel: (v: string) => void;
  setNewTagColor: (v: string) => void;
  onEditTag: (tag: Tag) => void;
  onRemoveTag: (id: string) => void;
  onSaveTag: () => void;
  onCancelTagEdit: () => void;
  onStartAddTag: () => void;
}

export const MediaGallery: React.FC<MediaGalleryProps> = ({
  isCompactMode,
  emoji,
  setEmoji,
  showEmojiPicker,
  setShowEmojiPicker,
  emojiButtonRef,
  emojiPickerPosition,
  setEmojiPickerPosition,
  images,
  onPreviewImage,
  onRemoveImage,
  onUploadImages,
  sketch,
  onOpenSketch,
  onRemoveSketch,
  tags,
  editingTagId,
  isAddingTag,
  newTagLabel,
  newTagColor,
  setNewTagLabel,
  setNewTagColor,
  onEditTag,
  onRemoveTag,
  onSaveTag,
  onCancelTagEdit,
  onStartAddTag
}) => {
  if (isCompactMode) return null;

  return (
    <div className="flex flex-col z-10 backdrop-blur-[2px] mt-auto flex-shrink-0">
      {/* Media Row */}
      <div
        className="px-3 pt-1 pb-2 flex gap-3 overflow-x-auto scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        <div className="relative group flex-shrink-0">
          <div
            ref={emojiButtonRef}
            onClick={() => {
              if (emojiButtonRef.current) {
                const rect = emojiButtonRef.current.getBoundingClientRect();
                const spaceBelow = window.innerHeight - rect.bottom;
                const spaceAbove = rect.top;
                if (spaceBelow < 400 && spaceAbove > spaceBelow) {
                  setEmojiPickerPosition({ left: rect.left, top: rect.top - 200 - 8 });
                } else {
                  setEmojiPickerPosition({ left: rect.left, top: rect.bottom + 8 });
                }
              }
              setShowEmojiPicker(!showEmojiPicker);
            }}
            className="w-20 h-20 bg-white/60 hover:bg-white shadow-sm rounded-2xl flex items-center justify-center transition-colors cursor-pointer"
            style={{ border: 'none' }}
          >
            <span className="text-3xl leading-none">{emoji || '📌'}</span>
          </div>
          {emoji && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEmoji('');
                setShowEmojiPicker(false);
              }}
              className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ border: 'none' }}
            >
              <X size={12} />
            </button>
          )}

          <EmojiPicker
            isOpen={showEmojiPicker}
            position={emojiPickerPosition}
            onClose={() => setShowEmojiPicker(false)}
            onSelectEmoji={(e) => setEmoji(e)}
          />
        </div>

        {images.map((image, index) => (
          <div key={index} className="relative group flex-shrink-0">
            <div
              className="w-20 h-20 bg-white/60 shadow-sm rounded-2xl overflow-hidden cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowEmojiPicker(false);
                onPreviewImage(index);
              }}
            >
              <img
                src={image}
                alt="便签图片"
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                }}
              />
              <div className="hidden absolute inset-0 bg-gray-200 flex items-center justify-center text-xs text-gray-500">
                <div className="text-center">
                  <div className="text-lg mb-1">📷</div>
                  <div>图片已损毁</div>
                </div>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowEmojiPicker(false);
                onRemoveImage(index);
              }}
              className="absolute -top-1 -right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
            >
              <X size={12} />
            </button>
          </div>
        ))}

        <label
          className="w-20 h-20 bg-white/60 hover:bg-white shadow-sm rounded-2xl flex items-center justify-center cursor-pointer transition-colors relative flex-shrink-0"
          style={{ border: 'none' }}
        >
          <Camera size={24} className="text-gray-500" />
          <input
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            className="hidden"
            onChange={(e) => {
              setShowEmojiPicker(false);
              onUploadImages(e);
            }}
          />
        </label>

        <button
          onClick={() => {
            setShowEmojiPicker(false);
            onOpenSketch();
          }}
          className="w-20 h-20 bg-white/60 hover:bg-white shadow-sm rounded-2xl flex items-center justify-center transition-colors relative overflow-hidden group flex-shrink-0"
          style={{ border: 'none' }}
        >
          {sketch && sketch !== '' ? (
            <div className="relative w-full h-full">
              <img
                src={sketch}
                alt="便签涂鸦"
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                }}
              />
              <div className="hidden absolute inset-0 bg-gray-200 flex items-center justify-center text-xs text-gray-500">
                <div className="text-center">
                  <div className="text-lg mb-1">🎨</div>
                  <div>涂鸦已损毁</div>
                </div>
              </div>
            </div>
          ) : (
            <PenTool size={24} className="text-gray-500" />
          )}
          {sketch && sketch !== '' && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                setShowEmojiPicker(false);
                onRemoveSketch();
              }}
              className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X size={12} />
            </div>
          )}
        </button>
      </div>

      {/* Tags Row */}
      <div className="px-3 pt-2 pb-2 flex-1 flex gap-2 overflow-x-auto scrollbar-hide items-center min-h-[50px]">
        {tags.map((tag) =>
          editingTagId === tag.id ? (
            <div
              key={tag.id}
              className="flex items-center gap-1 bg-white rounded-full shadow-sm p-1 pr-2 h-10 animate-in fade-in slide-in-from-left-2 flex-shrink-0"
              style={{ border: 'none' }}
            >
              <input
                autoFocus
                className="w-16 text-sm bg-transparent outline-none ml-2 text-gray-700 placeholder-gray-400"
                placeholder="Tag name..."
                value={newTagLabel}
                onChange={(e) => setNewTagLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSaveTag();
                  if (e.key === 'Escape') onCancelTagEdit();
                }}
              />
              <div className="flex gap-1 pl-2" style={{ borderLeft: 'none' }}>
                {TAG_COLORS.slice(0, 5).map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewTagColor(c)}
                    style={{ backgroundColor: c }}
                    className={`w-5 h-5 rounded-full transition-transform ${
                      newTagColor === c
                        ? 'scale-125 ring-2 ring-gray-300 ring-offset-1'
                        : 'hover:scale-110'
                    }`}
                  />
                ))}
              </div>
              <button
                onClick={onSaveTag}
                className="ml-1 text-green-500 hover:text-green-600 active:scale-90 transition-transform"
              >
                <Check size={18} />
              </button>
            </div>
          ) : (
            <span
              key={tag.id}
              onClick={() => {
                setShowEmojiPicker(false);
                onEditTag(tag);
              }}
              className="flex-shrink-0 h-6 px-2.5 rounded-full text-xs font-bold text-white shadow-sm flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
              style={{ backgroundColor: tag.color }}
            >
              {tag.label}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowEmojiPicker(false);
                  onRemoveTag(tag.id);
                }}
              >
                <X size={10} />
              </button>
            </span>
          )
        )}

        {isAddingTag && !editingTagId ? (
          <div
            className="flex items-center gap-1 bg-white rounded-full shadow-sm p-1 pr-2 h-10 animate-in fade-in slide-in-from-left-2"
            style={{ border: 'none' }}
          >
            <input
              autoFocus
              className="w-16 text-sm bg-transparent outline-none ml-2 text-gray-700 placeholder-gray-400"
              placeholder="Tag name..."
              value={newTagLabel}
              onChange={(e) => setNewTagLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveTag();
                if (e.key === 'Escape') onCancelTagEdit();
              }}
            />
            <div className="flex gap-1 pl-2" style={{ borderLeft: 'none' }}>
              {TAG_COLORS.slice(0, 5).map((c) => (
                <button
                  key={c}
                  onClick={() => setNewTagColor(c)}
                  style={{ backgroundColor: c }}
                  className={`w-5 h-5 rounded-full transition-transform ${
                    newTagColor === c
                      ? 'scale-125 ring-2 ring-gray-300 ring-offset-1'
                      : 'hover:scale-110'
                  }`}
                />
              ))}
            </div>
            <button
              onClick={onSaveTag}
              className="ml-1 text-green-500 hover:text-green-600 active:scale-90 transition-transform"
            >
              <Check size={18} />
            </button>
          </div>
        ) : !editingTagId ? (
          <button
            onClick={() => {
              setShowEmojiPicker(false);
              onStartAddTag();
            }}
            className="flex-shrink-0 h-10 px-4 bg-white/60 hover:bg-white rounded-full text-xs font-bold text-gray-500 shadow-sm flex items-center transition-all"
            style={{ border: 'none' }}
          >
            + Tag
          </button>
        ) : null}
      </div>

      <div className="h-px w-full mt-2 bg-black/5"></div>
    </div>
  );
};


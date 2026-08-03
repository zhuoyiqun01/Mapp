import React from 'react';
import { X } from 'lucide-react';

interface MediaSectionProps {
  images: string[];
  onPreviewImage: (index: number) => void;
  onRemoveImage: (index: number) => void;
  sketch?: string;
  onOpenSketch: () => void;
  onRemoveSketch: () => void;
  onDismissOverlays?: () => void;
  /** 添加图片/涂鸦等 */
  moreActionsSlot?: React.ReactNode;
}

/** Media：attachments（image + sketch）；与属性区分离 */
export const MediaSection: React.FC<MediaSectionProps> = ({
  images,
  onPreviewImage,
  onRemoveImage,
  sketch,
  onOpenSketch,
  onRemoveSketch,
  onDismissOverlays,
  moreActionsSlot
}) => {
  const dismiss = onDismissOverlays ?? (() => {});
  const hasMedia = images.length > 0 || !!(sketch && sketch !== '');

  return (
    <section className="flex flex-col shrink-0 border-t border-gray-100/80" aria-label="媒体">
      <div className="px-4 pt-2 pb-1 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">媒体</span>
        {moreActionsSlot}
      </div>
      {hasMedia ? (
        <div className="relative px-4 pt-1.5 pb-3">
          <div
            className="flex gap-3 overflow-x-auto scrollbar-hide py-2"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
          >
            {images.map((image, index) => (
              <div key={index} className="relative group flex-shrink-0">
                <div
                  className="w-20 h-20 bg-white/60 shadow-sm rounded-2xl overflow-hidden cursor-pointer"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dismiss();
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
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    dismiss();
                    onRemoveImage(index);
                  }}
                  className="absolute -top-1 -right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 border-0 cursor-pointer"
                  title="移除图片"
                >
                  <X size={12} />
                </button>
              </div>
            ))}

            {sketch && sketch !== '' ? (
              <div className="relative group flex-shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    dismiss();
                    onOpenSketch();
                  }}
                  className="w-20 h-20 bg-white/60 hover:bg-white shadow-sm rounded-2xl overflow-hidden relative block border-0 p-0 cursor-pointer"
                >
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
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    dismiss();
                    onRemoveSketch();
                  }}
                  className="absolute -top-1 -right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  title="移除涂鸦"
                >
                  <X size={12} />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="px-4 pb-3 pt-1 text-[11px] text-gray-400">暂无附件</div>
      )}
    </section>
  );
};

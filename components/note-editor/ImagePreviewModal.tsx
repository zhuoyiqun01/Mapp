import React from 'react';
import { ArrowLeft, ArrowRight, RotateCcw, X } from 'lucide-react';

interface ImagePreviewModalProps {
  images: string[];
  previewIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onChangeIndex: (index: number) => void;
  themeColor?: string;
  cropEnabled?: boolean;
  onCropEnabledChange?: (enabled: boolean) => void;
  onRedrawCrop?: () => void;
  cropBusy?: boolean;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  images,
  previewIndex,
  isOpen,
  onClose,
  onChangeIndex,
  themeColor = '#111827',
  cropEnabled = false,
  onCropEnabledChange,
  onRedrawCrop,
  cropBusy = false
}) => {
  if (!isOpen || images.length === 0) return null;

  const previewImage = images[previewIndex];
  const canShow =
    !!previewImage &&
    (previewImage.startsWith('data:image/') ||
      previewImage.startsWith('blob:') ||
      previewImage.startsWith('http://') ||
      previewImage.startsWith('https://'));
  if (!previewImage) return null;

  const showCropControls = typeof onCropEnabledChange === 'function';

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/80 flex flex-col items-center justify-center p-4"
      onClick={onClose}
    >
      {showCropControls ? (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-[1002] flex items-center gap-3 rounded-2xl bg-black/50 backdrop-blur-md px-3 py-2 text-white"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-xs font-medium text-white/90">套索裁剪</span>
          <button
            type="button"
            role="switch"
            aria-checked={cropEnabled}
            aria-label="套索裁剪"
            disabled={cropBusy}
            onClick={() => onCropEnabledChange?.(!cropEnabled)}
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors border-0 cursor-pointer disabled:opacity-40 ${
              cropEnabled ? '' : 'bg-white/25'
            }`}
            style={cropEnabled ? { backgroundColor: themeColor } : undefined}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                cropEnabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
          {cropEnabled && onRedrawCrop ? (
            <button
              type="button"
              disabled={cropBusy}
              onClick={() => onRedrawCrop()}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-white/90 bg-white/10 hover:bg-white/15 border-0 cursor-pointer disabled:opacity-40"
            >
              <RotateCcw size={12} />
              重画
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="relative max-w-full max-h-full flex items-center gap-4">
        {images.length > 1 && previewIndex > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onChangeIndex(previewIndex - 1);
            }}
            className="text-white hover:text-gray-300 transition-colors p-2"
            style={{ zIndex: 1001 }}
          >
            <ArrowLeft size={32} />
          </button>
        )}
        {images.length > 1 && previewIndex === 0 && <div className="w-[40px]" />}

        <div className="relative max-w-full max-h-full flex flex-col items-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors z-10"
          >
            <X size={32} />
          </button>
          {canShow ? (
            <img
              src={previewImage}
              alt="Preview"
              className="max-w-full max-h-[90vh] object-contain drop-shadow-[0_12px_28px_rgba(0,0,0,0.45)]"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div
              className="px-8 py-12 text-white/70 text-sm"
              onClick={(e) => e.stopPropagation()}
            >
              图片加载中…
            </div>
          )}
          {images.length > 1 && (
            <div className="mt-4 text-white text-sm">
              {previewIndex + 1} / {images.length}
            </div>
          )}
        </div>

        {images.length > 1 && previewIndex < images.length - 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onChangeIndex(previewIndex + 1);
            }}
            className="text-white hover:text-gray-300 transition-colors p-2"
            style={{ zIndex: 1001 }}
          >
            <ArrowRight size={32} />
          </button>
        )}
        {images.length > 1 && previewIndex === images.length - 1 && <div className="w-[40px]" />}
      </div>
    </div>
  );
};

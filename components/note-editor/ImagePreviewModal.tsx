import React from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';

interface ImagePreviewModalProps {
  images: string[];
  previewIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onChangeIndex: (index: number) => void;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  images,
  previewIndex,
  isOpen,
  onClose,
  onChangeIndex
}) => {
  if (!isOpen || images.length === 0) return null;

  const previewImage = images[previewIndex];
  if (!previewImage) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="relative max-w-full max-h-full flex items-center gap-4">
        {/* Previous Button */}
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
          <img
            src={previewImage}
            alt="Preview"
            className="max-w-full max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {images.length > 1 && (
            <div className="mt-4 text-white text-sm">
              {previewIndex + 1} / {images.length}
            </div>
          )}
        </div>

        {/* Next Button */}
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


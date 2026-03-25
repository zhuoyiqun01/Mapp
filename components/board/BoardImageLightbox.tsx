import React from 'react';
import { X } from 'lucide-react';

export type BoardImageLightboxProps = {
  src: string | null;
  onClose: () => void;
};

export const BoardImageLightbox: React.FC<BoardImageLightboxProps> = ({ src, onClose }) => {
  if (!src) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80"
      onClick={() => onClose()}
    >
      <div className="pointer-events-none relative max-h-[90vh] max-w-[90vw] p-4">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="pointer-events-auto absolute -right-2 -top-2 z-10 rounded-full bg-white p-2 shadow-lg transition-colors hover:bg-gray-100"
        >
          <X size={20} />
        </button>
        <img
          src={src}
          alt="Preview"
          className="pointer-events-auto max-h-[90vh] max-w-full rounded-lg object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
};

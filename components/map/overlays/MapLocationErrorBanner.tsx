import React from 'react';
import { Loader2, X } from 'lucide-react';

type Props = {
  locationError: string | null;
  isLocating: boolean;
  onRetry: () => void;
  onClose: () => void;
};

export const MapLocationErrorBanner: React.FC<Props> = ({
  locationError,
  isLocating,
  onRetry,
  onClose
}) => {
  if (!locationError) return null;

  return (
    <div className="fixed top-20 left-4 right-4 z-[1000] bg-red-50 border border-red-200 rounded-lg p-3 shadow-lg animate-in slide-in-from-top-2 fade-in duration-300">
      <div className="flex items-start gap-2">
        <div className="text-red-500 mt-0.5">📍</div>
        <div className="flex-1">
          <p className="text-sm text-red-800 font-medium">位置服务不可用</p>
          <p className="text-xs text-red-600 mt-1 whitespace-pre-line">{locationError}</p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => onRetry()}
              disabled={isLocating}
              className="px-3 py-1 bg-red-100 hover:bg-red-200 disabled:bg-gray-100 disabled:cursor-not-allowed text-red-700 text-xs rounded transition-colors flex items-center gap-1"
            >
              {isLocating ? <Loader2 size={12} className="animate-spin" /> : null}
              重试
            </button>
            <button
              onClick={() => onClose()}
              className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded transition-colors"
            >
              关闭
            </button>
          </div>
        </div>
        <button
          onClick={() => onClose()}
          className="text-red-500 hover:text-red-700 p-1 hover:bg-red-100 rounded-full transition-colors"
          aria-label="关闭位置错误提示"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};


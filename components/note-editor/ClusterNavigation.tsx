import React from 'react';

interface ClusterNavigationProps {
  themeColor: string;
  currentIndex: number;
  total: number;
  onPrev?: () => void;
  onNext?: () => void;
  onBeforeNavigate?: () => void;
}

export const ClusterNavigation: React.FC<ClusterNavigationProps> = ({
  themeColor,
  currentIndex,
  total,
  onPrev,
  onNext,
  onBeforeNavigate
}) => {
  if (total <= 1) return null;

  return (
    <div className="mt-4 flex items-center gap-2 pointer-events-auto">
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (onPrev && currentIndex > 0) {
            onBeforeNavigate?.();
            onPrev();
          }
        }}
        disabled={currentIndex === 0}
        className={`p-2 rounded-full transition-all ${
          currentIndex === 0 ? 'text-gray-400 cursor-not-allowed' : 'text-white'
        }`}
        style={currentIndex !== 0 ? { color: 'white' } : undefined}
        onMouseEnter={(e) => currentIndex !== 0 && (e.currentTarget.style.color = themeColor)}
        onMouseLeave={(e) => currentIndex !== 0 && (e.currentTarget.style.color = 'white')}
        title="Previous note"
      >
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 18 L9 12 L15 6" />
        </svg>
      </button>

      <div className="px-3 py-1 text-base font-bold text-white">
        {currentIndex + 1} / {total}
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          if (onNext && currentIndex < total - 1) {
            onBeforeNavigate?.();
            onNext();
          }
        }}
        disabled={currentIndex === total - 1}
        className={`p-2 rounded-full transition-all ${
          currentIndex === total - 1 ? 'text-gray-400 cursor-not-allowed' : 'text-white'
        }`}
        style={currentIndex !== total - 1 ? { color: 'white' } : undefined}
        onMouseEnter={(e) => currentIndex !== total - 1 && (e.currentTarget.style.color = themeColor)}
        onMouseLeave={(e) => currentIndex !== total - 1 && (e.currentTarget.style.color = 'white')}
        title="Next note"
      >
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 18 L15 12 L9 6" />
        </svg>
      </button>
    </div>
  );
};


import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { EMOJI_CATEGORIES, THEME_COLOR } from '../../constants';

interface EmojiPickerProps {
  isOpen: boolean;
  position: { left: number; top: number } | null;
  onClose: () => void;
  onSelectEmoji: (emoji: string) => void;
}

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ isOpen, position, onClose, onSelectEmoji }) => {
  const [selectedCategory, setSelectedCategory] =
    useState<keyof typeof EMOJI_CATEGORIES>('Recent');
  const categoryTabsRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScrollPosition = () => {
    if (!categoryTabsRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = categoryTabsRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
  };

  const scrollCategoryTabs = (direction: 'left' | 'right') => {
    if (!categoryTabsRef.current) return;
    const scrollAmount = 200;
    const currentScroll = categoryTabsRef.current.scrollLeft;
    const newScroll =
      direction === 'left'
        ? Math.max(0, currentScroll - scrollAmount)
        : Math.min(
            categoryTabsRef.current.scrollWidth - categoryTabsRef.current.clientWidth,
            currentScroll + scrollAmount
          );
    categoryTabsRef.current.scrollTo({ left: newScroll, behavior: 'smooth' });
    setTimeout(checkScrollPosition, 300);
  };

  useEffect(() => {
    if (isOpen && categoryTabsRef.current) {
      checkScrollPosition();
      const container = categoryTabsRef.current;
      container.addEventListener('scroll', checkScrollPosition);
      window.addEventListener('resize', checkScrollPosition);
      return () => {
        container.removeEventListener('scroll', checkScrollPosition);
        window.removeEventListener('resize', checkScrollPosition);
      };
    }
  }, [isOpen, selectedCategory]);

  const emojis = useMemo(() => {
    return (EMOJI_CATEGORIES[selectedCategory] || EMOJI_CATEGORIES['Recent']) as string[];
  }, [selectedCategory]);

  if (!isOpen || !position) return null;

  return createPortal(
    <>
      <div className="fixed inset-0" style={{ zIndex: 9999 }} onClick={onClose} />
      <div
        className="fixed bg-white rounded-xl shadow-2xl overflow-hidden"
        style={{
          border: 'none',
          width: '320px',
          maxHeight: '400px',
          display: 'flex',
          flexDirection: 'column',
          left: `${position.left}px`,
          top: `${position.top}px`,
          zIndex: 10000,
          position: 'fixed',
          pointerEvents: 'auto'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Category Tabs */}
        <div className="relative border-b border-gray-100">
          {canScrollLeft && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                scrollCategoryTabs('left');
              }}
              className="absolute left-0 top-0 bottom-0 z-10 px-2 bg-white/80 hover:bg-white flex items-center transition-colors"
              style={{ backdropFilter: 'blur(4px)' }}
            >
              <ArrowLeft size={16} className="text-gray-600" />
            </button>
          )}
          {canScrollRight && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                scrollCategoryTabs('right');
              }}
              className="absolute right-0 top-0 bottom-0 z-10 px-2 bg-white/80 hover:bg-white flex items-center transition-colors"
              style={{ backdropFilter: 'blur(4px)' }}
            >
              <ArrowRight size={16} className="text-gray-600" />
            </button>
          )}
          <div
            ref={categoryTabsRef}
            className="flex gap-1 p-1.5 overflow-x-auto scrollbar-hide"
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch',
              touchAction: 'pan-x'
            }}
          >
            {Object.keys(EMOJI_CATEGORIES).map((category) => (
              <button
                key={category}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedCategory(category as keyof typeof EMOJI_CATEGORIES);
                }}
                className={`px-2 py-1 text-xs font-medium rounded-lg whitespace-nowrap transition-colors flex-shrink-0 ${
                  selectedCategory === category
                    ? 'text-gray-900'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* Emoji Grid */}
        <div className="p-3 overflow-y-auto" style={{ maxHeight: '320px' }}>
          <div className="grid grid-cols-8 gap-1" key={selectedCategory}>
            {emojis.map((e, index) => (
              <button
                key={`${selectedCategory}-${index}-${e}`}
                onClick={() => {
                  onSelectEmoji(e);
                  onClose();
                  if (selectedCategory !== 'Recent') {
                    const recent = EMOJI_CATEGORIES['Recent'];
                    if (!recent.includes(e)) {
                      EMOJI_CATEGORIES['Recent'] = [e, ...recent.slice(0, 19)];
                    }
                  }
                }}
                className="text-2xl p-2 rounded-lg transition-colors flex items-center justify-center"
                style={{ backgroundColor: 'transparent' }}
                onMouseEnter={(ev) => (ev.currentTarget.style.backgroundColor = `${THEME_COLOR}1A`)}
                onMouseLeave={(ev) => (ev.currentTarget.style.backgroundColor = 'transparent')}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
};


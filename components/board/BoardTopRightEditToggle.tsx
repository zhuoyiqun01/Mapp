import React from 'react';
import { Check, Pencil } from 'lucide-react';
import { ChromeIconButton } from '../ui/ChromeIconButton';

type Props = {
  isUIVisible: boolean;
  isEditMode: boolean;
  themeColor: string;
  chromeSurfaceStyle?: React.CSSProperties;
  chromeHoverBackground?: string;
  onEnterEditMode: () => void;
  onExitEditMode: () => void;
};

function darkenHex(hex: string, factor = 0.9): string {
  const darkR = Math.max(0, Math.floor(parseInt(hex.slice(1, 3), 16) * factor));
  const darkG = Math.max(0, Math.floor(parseInt(hex.slice(3, 5), 16) * factor));
  const darkB = Math.max(0, Math.floor(parseInt(hex.slice(5, 7), 16) * factor));
  return (
    '#' +
    [darkR, darkG, darkB]
      .map((x) => {
        const h = x.toString(16);
        return h.length === 1 ? '0' + h : h;
      })
      .join('')
      .toUpperCase()
  );
}

export const BoardTopRightEditToggle: React.FC<Props> = ({
  isUIVisible,
  isEditMode,
  themeColor,
  chromeSurfaceStyle,
  chromeHoverBackground,
  onEnterEditMode,
  onExitEditMode
}) => {
  if (!isUIVisible) return null;

  return (
    <div
      data-allow-context-menu
      className="fixed top-2 sm:top-4 right-2 sm:right-4 z-[500] flex h-10 sm:h-12 gap-3 pointer-events-auto items-center"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {!isEditMode ? (
        <ChromeIconButton
          chromeSurfaceStyle={chromeSurfaceStyle}
          chromeHoverBackground={chromeHoverBackground}
          nonChromeIdleHover="imperative-gray100"
          onClick={() => onEnterEditMode()}
          title="进入编辑模式"
        >
          <Pencil size={18} className="sm:w-5 sm:h-5" />
        </ChromeIconButton>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onExitEditMode();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex h-10 sm:h-12 items-center gap-1 sm:gap-2 px-2 sm:px-3 text-theme-chrome-fg rounded-xl shadow-lg font-bold"
          style={{ backgroundColor: themeColor }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = darkenHex(themeColor);
          }}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = themeColor)}
        >
          <Check size={18} className="sm:w-5 sm:h-5" />
          <span className="hidden sm:inline">Done</span>
        </button>
      )}
    </div>
  );
};


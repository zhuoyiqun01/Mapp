import React from 'react';
import { Check, Pencil } from 'lucide-react';
import { ChromeDownloadMenu } from '../ui/ChromeDownloadMenu';
import { ChromeIconButton } from '../ui/ChromeIconButton';

type DownloadItem = { id: string; label: string; onSelect: () => void };

type Props = {
  isUIVisible: boolean;
  themeColor: string;
  chromeSurfaceStyle?: React.CSSProperties;
  chromeHoverBackground?: string;
  graphDownloadItems: DownloadItem[];
  isGraphToolbarEditMode: boolean;
  setIsGraphToolbarEditMode: React.Dispatch<React.SetStateAction<boolean>>;
};

export const GraphTopRightToolbar: React.FC<Props> = ({
  isUIVisible,
  themeColor,
  chromeSurfaceStyle,
  chromeHoverBackground,
  graphDownloadItems,
  isGraphToolbarEditMode,
  setIsGraphToolbarEditMode
}) => {
  if (isUIVisible) {
    return (
      <div
        data-allow-context-menu
        className="fixed top-2 sm:top-4 right-2 sm:right-4 z-[500] flex flex-col gap-2 items-end pointer-events-none"
      >
        <div
          className="flex h-10 sm:h-12 items-center gap-1.5 sm:gap-2 pointer-events-auto"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <ChromeDownloadMenu
            chromeSurfaceStyle={chromeSurfaceStyle}
            chromeHoverBackground={chromeHoverBackground}
            title="导出"
            items={graphDownloadItems}
          />
          {!isGraphToolbarEditMode ? (
            <ChromeIconButton
              chromeSurfaceStyle={chromeSurfaceStyle}
              chromeHoverBackground={chromeHoverBackground}
              nonChromeIdleHover="imperative-gray100"
              onClick={() => setIsGraphToolbarEditMode(true)}
              title="编辑模式"
            >
              <Pencil size={18} className="sm:w-5 sm:h-5" />
            </ChromeIconButton>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsGraphToolbarEditMode(false);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex h-10 sm:h-12 items-center gap-1 sm:gap-2 px-2 sm:px-3 text-sm text-theme-chrome-fg rounded-xl shadow-lg font-bold"
              style={{ backgroundColor: themeColor }}
              title="完成编辑"
            >
              <Check size={18} className="sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">Done</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      data-allow-context-menu
      className="fixed top-2 sm:top-4 right-2 sm:right-4 z-[500] pointer-events-auto flex h-10 sm:h-12 items-center"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ChromeDownloadMenu
        chromeSurfaceStyle={chromeSurfaceStyle}
        chromeHoverBackground={chromeHoverBackground}
        title="导出"
        items={graphDownloadItems}
      />
    </div>
  );
};


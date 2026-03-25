import React from 'react';
import { Image as ImageIcon, StickyNote } from 'lucide-react';
import { ChromeIconButton } from '../ui/ChromeIconButton';

type Props = {
  isEditMode: boolean;
  isSelectingNotePosition: boolean;
  isDrawingFrame: boolean;
  isBoxSelecting: boolean;
  chromeSurfaceStyle?: React.CSSProperties;
  chromeHoverBackground?: string;
  themeColor: string;
  onToggleSelectNotePosition: () => void;
  onAddImage: () => void;
  onEnableDrawFrame: () => void;
  onToggleBoxSelect: () => void;
  onClearSelectingNotePosition: () => void;
};

export const BoardTopCenterEditToolbar: React.FC<Props> = ({
  isEditMode,
  isSelectingNotePosition,
  isDrawingFrame,
  isBoxSelecting,
  chromeSurfaceStyle,
  chromeHoverBackground,
  themeColor,
  onToggleSelectNotePosition,
  onAddImage,
  onEnableDrawFrame,
  onToggleBoxSelect,
  onClearSelectingNotePosition
}) => {
  if (!isEditMode) return null;

  return (
    <div
      data-allow-context-menu
      className="fixed top-2 sm:top-4 left-1/2 z-[500] -translate-x-1/2 pointer-events-auto animate-in fade-in flex items-center gap-1.5 sm:gap-2"
      style={{ height: 40, alignItems: 'center' }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onClearSelectingNotePosition();
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClearSelectingNotePosition();
      }}
    >
      <div
        className="flex gap-1.5 sm:gap-2 items-center p-0.5 sm:p-1"
        style={{ height: '40px' }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <ChromeIconButton
          chromeSurfaceStyle={chromeSurfaceStyle}
          chromeHoverBackground={chromeHoverBackground}
          themeColor={themeColor}
          active={isSelectingNotePosition}
          activeVariant="theme"
          nonChromeIdleHover="imperative-gray100"
          onClick={onToggleSelectNotePosition}
          title={
            isSelectingNotePosition
              ? 'Click on board to place note (click again to cancel)'
              : 'Add Sticky Note'
          }
        >
          <StickyNote size={18} className="sm:w-5 sm:h-5" />
        </ChromeIconButton>
        <ChromeIconButton
          chromeSurfaceStyle={chromeSurfaceStyle}
          chromeHoverBackground={chromeHoverBackground}
          nonChromeIdleHover="imperative-gray100"
          onClick={onAddImage}
          title="Add Image"
        >
          <ImageIcon size={18} className="sm:w-5 sm:h-5" />
        </ChromeIconButton>
        <ChromeIconButton
          chromeSurfaceStyle={chromeSurfaceStyle}
          chromeHoverBackground={chromeHoverBackground}
          themeColor={themeColor}
          active={isDrawingFrame}
          activeVariant="theme"
          nonChromeIdleHover="imperative-gray100"
          onClick={onEnableDrawFrame}
          title="Add Frame"
        >
          <svg
            width="18"
            height="18"
            className="sm:w-5 sm:h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="5" y1="2" x2="5" y2="22" />
            <line x1="19" y1="2" x2="19" y2="22" />
            <line x1="3" y1="5" x2="21" y2="5" />
            <line x1="3" y1="19" x2="21" y2="19" />
          </svg>
        </ChromeIconButton>
        <ChromeIconButton
          chromeSurfaceStyle={chromeSurfaceStyle}
          chromeHoverBackground={chromeHoverBackground}
          themeColor={themeColor}
          active={isBoxSelecting}
          activeVariant="theme"
          nonChromeIdleHover="imperative-gray100"
          onClick={onToggleBoxSelect}
          title="Box Select (Click to toggle, then drag to select)"
        >
          <svg
            width="18"
            height="18"
            className="sm:w-5 sm:h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="5 5"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          </svg>
        </ChromeIconButton>
      </div>
    </div>
  );
};


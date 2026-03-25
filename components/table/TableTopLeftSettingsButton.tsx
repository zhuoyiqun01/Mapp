import React from 'react';
import { Settings } from 'lucide-react';
import { ChromeIconButton } from '../ui/ChromeIconButton';

type Props = {
  isUIVisible: boolean;
  chromeSurfaceStyle?: React.CSSProperties;
  chromeHoverBackground?: string;
  onOpenSettings: () => void;
};

export const TableTopLeftSettingsButton: React.FC<Props> = ({
  isUIVisible,
  chromeSurfaceStyle,
  chromeHoverBackground,
  onOpenSettings
}) => {
  if (!isUIVisible) return null;
  return (
    <div
      data-allow-context-menu
      className="fixed top-2 sm:top-4 left-2 sm:left-4 z-[500] pointer-events-auto flex h-10 sm:h-12 items-center"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ChromeIconButton
        chromeSurfaceStyle={chromeSurfaceStyle}
        chromeHoverBackground={chromeHoverBackground}
        nonChromeIdleHover="imperative-gray100"
        onClick={(e) => {
          e.stopPropagation();
          onOpenSettings();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        title="设置"
      >
        <Settings size={18} className="sm:w-5 sm:h-5" />
      </ChromeIconButton>
    </div>
  );
};


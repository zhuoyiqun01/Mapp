import React from 'react';
import { Link2 } from 'lucide-react';
import { ChromeIconButton } from '../ui/ChromeIconButton';

type Props = {
  visible: boolean;
  chromeSurfaceStyle?: React.CSSProperties;
  chromeHoverBackground?: string;
  showConnectionPanel: boolean;
  onToggleConnectionPanel: () => void;
};

export const GraphTopCenterConnectionButton: React.FC<Props> = ({
  visible,
  chromeSurfaceStyle,
  chromeHoverBackground,
  showConnectionPanel,
  onToggleConnectionPanel
}) => {
  if (!visible) return null;

  return (
    <div
      data-allow-context-menu
      className="fixed top-2 sm:top-4 left-1/2 -translate-x-1/2 z-[500] pointer-events-auto flex h-10 sm:h-12 items-center justify-center"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ChromeIconButton
        chromeSurfaceStyle={chromeSurfaceStyle}
        chromeHoverBackground={chromeHoverBackground}
        nonChromeIdleHover="imperative-gray100"
        active={showConnectionPanel}
        activeVariant="muted"
        onClick={() => onToggleConnectionPanel()}
        title="关联"
      >
        <Link2 size={18} className="sm:w-5 sm:h-5" />
      </ChromeIconButton>
    </div>
  );
};


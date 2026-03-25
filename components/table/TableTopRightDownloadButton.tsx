import React from 'react';
import { Download } from 'lucide-react';
import { ChromeIconButton } from '../ui/ChromeIconButton';

type Props = {
  isUIVisible: boolean;
  chromeSurfaceStyle?: React.CSSProperties;
  chromeHoverBackground?: string;
  onDownload: () => void;
  subView: 'points' | 'edges';
};

export const TableTopRightDownloadButton: React.FC<Props> = ({
  isUIVisible,
  chromeSurfaceStyle,
  chromeHoverBackground,
  onDownload,
  subView
}) => {
  if (!isUIVisible) return null;
  return (
    <div
      data-allow-context-menu
      className="fixed top-2 sm:top-4 right-2 sm:right-4 z-[500] pointer-events-auto flex h-10 sm:h-12 items-center"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ChromeIconButton
        chromeSurfaceStyle={chromeSurfaceStyle}
        chromeHoverBackground={chromeHoverBackground}
        nonChromeIdleHover="imperative-gray100"
        onClick={(e) => {
          e.stopPropagation();
          onDownload();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        title={subView === 'points' ? '下载节点表 (CSV)' : '下载关联表 (CSV)'}
      >
        <Download size={18} className="sm:w-5 sm:h-5" />
      </ChromeIconButton>
    </div>
  );
};


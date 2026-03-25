import React from 'react';
import { Download } from 'lucide-react';
import { Frame } from '../../../types';
import { MapSearchPanel } from '../controls/MapSearchPanel';
import { MapLayerControl } from '../controls/MapLayerControl';
import { ChromeIconButton } from '../../ui/ChromeIconButton';

interface MapPreviewTopRightToolbarProps {
  showBorderPanel: boolean;
  onToggleBorderPanel: () => void;
  themeColor: string;
  chromeSurfaceStyle: React.CSSProperties;
  chromeHoverBackground: string;
  borderSearch: unknown;
  borderGeoJSON: unknown;
  onClearBorder: () => void;
  onCloseBorderPanel: () => void;
  showFrameLayerPanel: boolean;
  onToggleFrameLayerPanel: () => void;
  frames: Frame[];
  frameLayerVisibility: Record<string, boolean>;
  setFrameLayerVisibility: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  showAllFrames: boolean;
  setShowAllFrames: React.Dispatch<React.SetStateAction<boolean>>;
  frameLayerRef: React.RefObject<HTMLDivElement | null>;
  onExportStandaloneTab: () => void;
}

export function MapPreviewTopRightToolbar({
  showBorderPanel,
  onToggleBorderPanel,
  themeColor,
  chromeSurfaceStyle,
  chromeHoverBackground,
  borderSearch,
  borderGeoJSON,
  onClearBorder,
  onCloseBorderPanel,
  showFrameLayerPanel,
  onToggleFrameLayerPanel,
  frames,
  frameLayerVisibility,
  setFrameLayerVisibility,
  showAllFrames,
  setShowAllFrames,
  frameLayerRef,
  onExportStandaloneTab
}: MapPreviewTopRightToolbarProps) {
  return (
    <div
      data-allow-context-menu
      className="fixed top-2 sm:top-4 right-2 sm:right-4 z-[500] pointer-events-auto flex h-10 sm:h-12 items-center gap-1.5 sm:gap-2"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <MapSearchPanel
        isOpen={showBorderPanel}
        onToggle={onToggleBorderPanel}
        themeColor={themeColor}
        chromeSurfaceStyle={chromeSurfaceStyle}
        chromeHoverBackground={chromeHoverBackground}
        borderSearch={borderSearch}
        borderGeoJSON={borderGeoJSON}
        onClearBorder={onClearBorder}
        onClose={onCloseBorderPanel}
      />
      <MapLayerControl
        showPanel={showFrameLayerPanel}
        onTogglePanel={onToggleFrameLayerPanel}
        themeColor={themeColor}
        chromeSurfaceStyle={chromeSurfaceStyle}
        chromeHoverBackground={chromeHoverBackground}
        frames={frames}
        frameLayerVisibility={frameLayerVisibility}
        setFrameLayerVisibility={setFrameLayerVisibility}
        showAllFrames={showAllFrames}
        setShowAllFrames={setShowAllFrames}
        frameLayerRef={frameLayerRef}
      />
      <ChromeIconButton
        title="导出 Tab 预览独立网页"
        chromeSurfaceStyle={chromeSurfaceStyle}
        chromeHoverBackground={chromeHoverBackground}
        onClick={onExportStandaloneTab}
      >
        <Download size={18} className="sm:w-5 sm:h-5" />
      </ChromeIconButton>
    </div>
  );
}

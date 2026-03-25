import React from 'react';
import { Settings } from 'lucide-react';
import { ChromeIconButton } from '../ui/ChromeIconButton';
import { GraphLayerPanel } from './GraphLayerPanel';
import { LayerToolbarIcon } from '../ui/LayerToolbarIcon';
import { GraphToolbarSliders } from './GraphToolbarSliders';
import type { GraphLayerState, Note } from '../../types';

type Props = {
  isUIVisible: boolean;
  themeColor: string;
  chromeSurfaceStyle?: React.CSSProperties;
  chromeHoverBackground?: string;
  setShowSettingsPanel: React.Dispatch<React.SetStateAction<boolean>>;
  showLayerPanel: boolean;
  setShowLayerPanel: React.Dispatch<React.SetStateAction<boolean>>;
  canShowLayer: boolean;
  panelChromeStyle?: React.CSSProperties;
  mergedGraphLayers: GraphLayerState;
  onGraphLayersChange: (next: GraphLayerState) => void;
  isGraphToolbarEditMode: boolean;
  notes: Note[];
  onUpdateNote: (note: Note) => void;
  chainLength: number;
  onChainLengthChange: (value: number) => void;
  quickStyleValues?: {
    nodeSize: number;
    labelSize: number;
    edgeWeight: number;
  };
  onQuickStyleChange?: (patch: { nodeSize?: number; labelSize?: number; edgeWeight?: number }) => void;
};

export const GraphTopLeftToolbar: React.FC<Props> = ({
  isUIVisible,
  themeColor,
  chromeSurfaceStyle,
  chromeHoverBackground,
  setShowSettingsPanel,
  showLayerPanel,
  setShowLayerPanel,
  canShowLayer,
  panelChromeStyle,
  mergedGraphLayers,
  onGraphLayersChange,
  isGraphToolbarEditMode,
  notes,
  onUpdateNote,
  chainLength,
  onChainLengthChange,
  quickStyleValues,
  onQuickStyleChange
}) => {
  if (!isUIVisible) return null;

  return (
    <div
      data-allow-context-menu
      className="fixed top-2 sm:top-4 left-2 sm:left-4 z-[500] pointer-events-none flex flex-col gap-2"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="pointer-events-auto flex h-10 sm:h-12 items-center gap-1.5 sm:gap-2">
        <ChromeIconButton
          chromeSurfaceStyle={chromeSurfaceStyle}
          chromeHoverBackground={chromeHoverBackground}
          nonChromeIdleHover="imperative-gray100"
          onClick={(e) => {
            e.stopPropagation();
            setShowSettingsPanel(true);
            setShowLayerPanel(false);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          title="设置"
        >
          <Settings size={18} className="sm:w-5 sm:h-5" />
        </ChromeIconButton>
        {canShowLayer ? (
          <div className="relative">
            <ChromeIconButton
              themeColor={themeColor}
              chromeSurfaceStyle={chromeSurfaceStyle}
              chromeHoverBackground={chromeHoverBackground}
              active={showLayerPanel}
              pressThemeFlash
              nonChromeIdleHover="imperative-gray100"
              onClick={(e) => {
                e.stopPropagation();
                setShowLayerPanel((v) => !v);
                setShowSettingsPanel(false);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              title="图层（标签组顺序、显隐、半径权重）"
            >
              <LayerToolbarIcon />
            </ChromeIconButton>
            {showLayerPanel ? (
              <GraphLayerPanel
                themeColor={themeColor}
                panelChromeStyle={panelChromeStyle}
                merged={mergedGraphLayers}
                onStateChange={onGraphLayersChange}
                notes={notes}
                onUpdateNote={onUpdateNote}
              />
            ) : null}
          </div>
        ) : null}
      </div>
      {isGraphToolbarEditMode && quickStyleValues && onQuickStyleChange ? (
        <GraphToolbarSliders
          nodeSize={quickStyleValues.nodeSize}
          setNodeSize={(v) => onQuickStyleChange({ nodeSize: v })}
          labelSize={quickStyleValues.labelSize}
          setLabelSize={(v) => onQuickStyleChange({ labelSize: v })}
          edgeWeight={quickStyleValues.edgeWeight}
          setEdgeWeight={(v) => onQuickStyleChange({ edgeWeight: v })}
          chainLength={chainLength}
          setChainLength={onChainLengthChange}
          themeColor={themeColor}
          chromeSurfaceStyle={chromeSurfaceStyle}
        />
      ) : null}
    </div>
  );
};


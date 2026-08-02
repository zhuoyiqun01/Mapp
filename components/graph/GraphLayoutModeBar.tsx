import React from 'react';
import { Clock, Network } from 'lucide-react';
import type { GraphLayoutMode } from '../../utils/graph/graphRuntimeCore';
import { PortalTooltip } from '../ui/PortalTooltip';

type Props = {
  panelChromeStyle?: React.CSSProperties;
  themeColor: string;
  activeGraphLayout: GraphLayoutMode;
  onApplyTimeLayout: () => void;
  onApplyCoseLayout: () => void;
};

export const GraphLayoutModeBar: React.FC<Props> = ({
  panelChromeStyle,
  themeColor,
  activeGraphLayout,
  onApplyTimeLayout,
  onApplyCoseLayout
}) => {
  const graphLayoutBtnClass = (mode: GraphLayoutMode) =>
    `flex items-center justify-center px-3 py-2 rounded-xl transition-all font-bold text-sm ${
      activeGraphLayout === mode ? 'text-theme-chrome-fg shadow-md scale-105' : 'text-gray-500 hover:bg-gray-100'
    }`;

  const items: Array<{
    mode: GraphLayoutMode;
    label: string;
    onClick: () => void;
    icon: React.ReactNode;
  }> = [
    { mode: 'time', label: '时间线', onClick: onApplyTimeLayout, icon: <Clock size={20} /> },
    { mode: 'cose', label: '力导', onClick: onApplyCoseLayout, icon: <Network size={20} /> }
  ];

  return (
    <div
      data-allow-context-menu
      className={`fixed bottom-20 ui-workspace-center-x -translate-x-1/2 z-[45] max-w-[min(100vw-1rem,28rem)] p-1.5 rounded-2xl shadow-xl border flex flex-wrap justify-center gap-1 pointer-events-auto ${
        panelChromeStyle ? 'border-gray-100/80' : 'border-white/50 map-chrome-surface-fallback'
      }`}
      style={panelChromeStyle}
    >
      {items.map((item) => (
        <PortalTooltip key={item.mode} content={item.label} compact>
          <button
            type="button"
            aria-label={item.label}
            onClick={item.onClick}
            className={graphLayoutBtnClass(item.mode)}
            style={activeGraphLayout === item.mode ? { backgroundColor: themeColor } : undefined}
          >
            {item.icon}
          </button>
        </PortalTooltip>
      ))}
    </div>
  );
};

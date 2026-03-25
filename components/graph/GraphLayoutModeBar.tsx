import React from 'react';
import { Circle, Clock, Network, Tags } from 'lucide-react';
import type { GraphLayoutMode } from '../../utils/graph/graphRuntimeCore';

type Props = {
  panelChromeStyle?: React.CSSProperties;
  themeColor: string;
  activeGraphLayout: GraphLayoutMode;
  onApplyTagGridLayout: () => void;
  onApplyCircleLayout: () => void;
  onApplyTimeLayout: () => void;
  onApplyCoseLayout: () => void;
};

export const GraphLayoutModeBar: React.FC<Props> = ({
  panelChromeStyle,
  themeColor,
  activeGraphLayout,
  onApplyTagGridLayout,
  onApplyCircleLayout,
  onApplyTimeLayout,
  onApplyCoseLayout
}) => {
  const graphLayoutBtnClass = (mode: GraphLayoutMode) =>
    `flex items-center justify-center px-3 py-2 rounded-xl transition-all font-bold text-sm ${
      activeGraphLayout === mode ? 'text-theme-chrome-fg shadow-md scale-105' : 'text-gray-500 hover:bg-gray-100'
    }`;

  return (
    <div
      data-allow-context-menu
      className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-[45] max-w-[min(100vw-1rem,28rem)] p-1.5 rounded-2xl shadow-xl border flex flex-wrap justify-center gap-1 pointer-events-auto ${
        panelChromeStyle ? 'border-gray-200/80 ring-1 ring-black/[0.04]' : 'border-white/50 map-chrome-surface-fallback'
      }`}
      style={panelChromeStyle}
    >
      <button
        type="button"
        title="按标签分组网格（组内按标题排序）"
        onClick={onApplyTagGridLayout}
        className={graphLayoutBtnClass('tagGrid')}
        style={activeGraphLayout === 'tagGrid' ? { backgroundColor: themeColor } : undefined}
      >
        <Tags size={20} />
      </button>
      <button
        type="button"
        title="环形布局"
        onClick={onApplyCircleLayout}
        className={graphLayoutBtnClass('circle')}
        style={activeGraphLayout === 'circle' ? { backgroundColor: themeColor } : undefined}
      >
        <Circle size={20} />
      </button>
      <button
        type="button"
        title="时间线（需便签有开始年份）"
        onClick={onApplyTimeLayout}
        className={graphLayoutBtnClass('time')}
        style={activeGraphLayout === 'time' ? { backgroundColor: themeColor } : undefined}
      >
        <Clock size={20} />
      </button>
      <button
        type="button"
        title="力传导布局"
        onClick={onApplyCoseLayout}
        className={graphLayoutBtnClass('cose')}
        style={activeGraphLayout === 'cose' ? { backgroundColor: themeColor } : undefined}
      >
        <Network size={20} />
      </button>
    </div>
  );
};


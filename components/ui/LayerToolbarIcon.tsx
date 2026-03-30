import React from 'react';
import { Frame as FrameIcon, Tag as TagIcon } from 'lucide-react';
import type { GraphLayerGroupStandard } from '../../utils/graph/graphRuntimeCore';

/** 各视图「图层」工具栏按钮：按当前分组标准显示标签 / 帧图标（不随视图变化） */
export function LayerToolbarIcon({
  layerGroupStandard
}: {
  layerGroupStandard: GraphLayerGroupStandard;
}) {
  if (layerGroupStandard === 'frame') {
    return <FrameIcon size={18} className="sm:w-5 sm:h-5" aria-hidden />;
  }
  return <TagIcon size={18} className="sm:w-5 sm:h-5" aria-hidden />;
}

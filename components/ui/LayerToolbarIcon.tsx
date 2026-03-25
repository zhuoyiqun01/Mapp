import React from 'react';
import { Tag } from 'lucide-react';

/** 各视图「图层」工具栏按钮共用的 lucide「标签」图标尺寸与类名 */
export function LayerToolbarIcon() {
  return <Tag size={18} className="sm:w-5 sm:h-5" aria-hidden />;
}

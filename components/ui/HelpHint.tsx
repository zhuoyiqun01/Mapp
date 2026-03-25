import React from 'react';
import { HelpCircle } from 'lucide-react';
import { PortalTooltip } from './PortalTooltip';

interface HelpHintProps {
  children: React.ReactNode;
}

/** 小号问号，悬停或键盘聚焦时显示说明 */
export const HelpHint: React.FC<HelpHintProps> = ({ children }) => (
  <PortalTooltip
    tone="neutral"
    content={children}
  >
    <button
      type="button"
      tabIndex={0}
      className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full text-gray-400 outline-none hover:text-gray-600 focus-visible:text-gray-800 focus-visible:ring-2 focus-visible:ring-gray-400/50 focus-visible:ring-offset-1"
      aria-label="查看说明"
    >
      <HelpCircle size={14} strokeWidth={2} />
    </button>
  </PortalTooltip>
);

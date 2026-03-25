import React, { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export type SettingsCollapsibleSectionProps = {
  title: string;
  icon?: React.ReactNode;
  /** 首次展开状态；面板关闭再打开会重置（未做持久化） */
  defaultOpen?: boolean;
  /** 标题右侧提示，点击不触发展开（需内联 stopPropagation 的控件） */
  hint?: React.ReactNode;
  themeColor?: string;
  children: React.ReactNode;
  className?: string;
};

/**
 * 设置面板用大区块折叠：标题行可点展开/收起，可选图标与 HelpHint。
 */
export const SettingsCollapsibleSection: React.FC<SettingsCollapsibleSectionProps> = ({
  title,
  icon,
  defaultOpen = true,
  hint,
  themeColor,
  children,
  className = ''
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const uid = useId();
  const panelId = `${uid}-panel`;
  const headerId = `${uid}-header`;

  const toggle = () => setOpen((v) => !v);

  return (
    <section className={`border-b border-gray-200/70 pb-3 mb-3 last:mb-0 last:border-0 last:pb-0 ${className}`}>
      {/* 不用外层 button：HelpHint 内含 button，嵌套非法；右侧为收起/展开指示 */}
      <div
        role="button"
        tabIndex={0}
        id={headerId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('[data-settings-section-hint]')) return;
          toggle();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
        className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg py-2 pl-1 pr-1 text-left transition-colors hover:bg-gray-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
        style={
          themeColor
            ? ({ ['--tw-ring-color' as string]: themeColor } as React.CSSProperties)
            : undefined
        }
      >
        {icon ? <span className="shrink-0 text-gray-600 [&_svg]:block">{icon}</span> : null}
        <span className="min-w-0 flex-1 text-base font-bold text-gray-800">{title}</span>
        {hint ? (
          <div
            data-settings-section-hint
            className="shrink-0"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {hint}
          </div>
        ) : null}
        <ChevronDown
          size={18}
          className={`shrink-0 text-gray-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          strokeWidth={2.25}
          aria-hidden
        />
      </div>
      {open ? (
        <div id={panelId} role="region" aria-labelledby={headerId} className="mt-1 pl-0.5">
          {children}
        </div>
      ) : null}
    </section>
  );
};

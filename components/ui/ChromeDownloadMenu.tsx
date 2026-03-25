import React, { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { ChromeIconButton } from './ChromeIconButton';

export interface ChromeDownloadMenuItem {
  id: string;
  label: string;
  onSelect: () => void;
}

export interface ChromeDownloadMenuProps {
  chromeSurfaceStyle?: React.CSSProperties;
  chromeHoverBackground?: string;
  /** 主按钮 title */
  title?: string;
  items: ChromeDownloadMenuItem[];
  /** 菜单额外 class */
  menuClassName?: string;
}

/**
 * 下载图标点击展开菜单：合并「独立网页」「JSON」等导出项，与 Map / Graph 顶栏玻璃风格一致。
 */
export const ChromeDownloadMenu: React.FC<ChromeDownloadMenuProps> = ({
  chromeSurfaceStyle,
  chromeHoverBackground,
  title = '导出',
  items,
  menuClassName = ''
}) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc, true);
    return () => document.removeEventListener('mousedown', onDoc, true);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative flex h-10 sm:h-12 items-center shrink-0">
      <ChromeIconButton
        chromeSurfaceStyle={chromeSurfaceStyle}
        chromeHoverBackground={chromeHoverBackground}
        nonChromeIdleHover="imperative-gray100"
        title={title}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Download size={18} className="sm:w-5 sm:h-5" />
      </ChromeIconButton>

      {open && items.length > 0 && (
        <div
          role="menu"
          className={`absolute right-0 top-[calc(100%+6px)] z-[600] min-w-[13rem] rounded-xl border border-gray-200/80 py-1 shadow-xl ring-1 ring-black/[0.04] ${menuClassName}`.trim()}
          style={chromeSurfaceStyle}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className="w-full text-left px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-100/90 flex items-center gap-2"
              onClick={(e) => {
                e.stopPropagation();
                item.onSelect();
                setOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

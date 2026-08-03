import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bookmark, Check, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import type { GraphViewPreset } from '../../utils/graph/graphPresets';
import { ChromeIconButton } from '../ui/ChromeIconButton';
import { useChromeMenuTop } from '../../utils/ui/chromeMenuPosition';

type Props = {
  themeColor: string;
  chromeSurfaceStyle?: React.CSSProperties;
  chromeHoverBackground?: string;
  presets: GraphViewPreset[];
  activePresetId?: string | null;
  onSaveCurrent: (name: string) => void;
  /** 用当前视图覆盖指定预设（保留名称与 id） */
  onUpdatePreset: (id: string) => void;
  onApply: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  /** 编辑模式栏也显示时是否可用 */
  disabled?: boolean;
};

/**
 * 图谱右上角：导出与编辑之间的预设按钮 + 浮层（保存 / 应用 / 改名 / 删除）。
 */
export const GraphPresetsMenu: React.FC<Props> = ({
  themeColor,
  chromeSurfaceStyle,
  chromeHoverBackground,
  presets,
  activePresetId,
  onSaveCurrent,
  onUpdatePreset,
  onApply,
  onRename,
  onDelete,
  disabled = false
}) => {
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const menuTop = useChromeMenuTop(open, wrapRef, 6);

  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setDraftName('');
      return;
    }
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (document.getElementById('graph-presets-menu-portal')?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc, true);
    return () => document.removeEventListener('mousedown', onDoc, true);
  }, [open]);

  useEffect(() => {
    if (open) nameInputRef.current?.focus();
  }, [open]);

  const handleSave = () => {
    const name =
      draftName.trim() ||
      `预设 ${presets.length + 1}`;
    onSaveCurrent(name);
    setDraftName('');
  };

  return (
    <div ref={wrapRef} className="relative flex h-10 sm:h-12 items-center shrink-0">
      <ChromeIconButton
        chromeSurfaceStyle={chromeSurfaceStyle}
        chromeHoverBackground={chromeHoverBackground}
        nonChromeIdleHover="imperative-gray100"
        active={open}
        pressThemeFlash
        tooltip="图谱预设"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bookmark size={18} className="sm:w-5 sm:h-5" />
      </ChromeIconButton>

      {open && menuTop != null
        ? createPortal(
            <div
              id="graph-presets-menu-portal"
              role="dialog"
              aria-label="图谱预设"
              className="fixed z-[600] ui-chrome-menu-page-right w-[min(18rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-gray-100/80 shadow-xl"
              style={{ top: menuTop, ...chromeSurfaceStyle }}
              onPointerDown={(e) => e.stopPropagation()}
            >
          <div className="border-b border-gray-100/80 px-3 py-2.5">
            <div className="text-sm font-semibold text-gray-900">图谱预设</div>
            <p className="mt-0.5 text-[10px] leading-snug text-gray-400">
              临时记录点位、图例颜色与图层显隐，不写入项目文件
            </p>
          </div>

          <div className="max-h-[min(16rem,50vh)] overflow-y-auto overscroll-contain px-1.5 py-1.5">
            {presets.length === 0 ? (
              <p className="px-2 py-3 text-xs text-gray-400">暂无预设，保存当前视图开始</p>
            ) : (
              <ul className="space-y-0.5">
                {presets.map((p) => {
                  const active = p.id === activePresetId;
                  const editing = editingId === p.id;
                  return (
                    <li
                      key={p.id}
                      className={`rounded-lg px-1.5 py-1 ${active ? 'bg-gray-100/80' : 'hover:bg-gray-50'}`}
                    >
                      {editing ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                e.preventDefault();
                                setEditingId(null);
                                return;
                              }
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                onRename(p.id, editDraft);
                                setEditingId(null);
                              }
                            }}
                            className="min-w-0 flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs outline-none focus:ring-2"
                            style={{ ['--tw-ring-color' as string]: themeColor }}
                          />
                          <button
                            type="button"
                            className="rounded-md p-1 text-gray-600 hover:bg-gray-100"
                            title="确认"
                            onClick={() => {
                              onRename(p.id, editDraft);
                              setEditingId(null);
                            }}
                          >
                            <Check size={14} />
                          </button>
                          <button
                            type="button"
                            className="rounded-md p-1 text-gray-400 hover:bg-gray-100"
                            title="取消"
                            onClick={() => setEditingId(null)}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            className="min-w-0 flex-1 truncate px-1.5 py-1 text-left text-xs font-medium text-gray-800"
                            title="应用此预设"
                            onClick={() => onApply(p.id)}
                          >
                            {p.name}
                            {active ? (
                              <span className="ml-1 text-[10px] font-normal text-gray-400">当前</span>
                            ) : null}
                          </button>
                          {active ? (
                            <button
                              type="button"
                              className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                              title="保存当前视图到此预设"
                              onClick={() => onUpdatePreset(p.id)}
                            >
                              <Save size={13} />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                            title="重命名"
                            onClick={() => {
                              setEditingId(p.id);
                              setEditDraft(p.name);
                            }}
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            title="删除"
                            onClick={() => {
                              if (window.confirm(`删除预设「${p.name}」？`)) onDelete(p.id);
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-gray-100/80 px-2.5 py-2.5">
            <div className="flex items-center gap-1.5">
              <input
                ref={nameInputRef}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSave();
                  }
                }}
                placeholder={`预设 ${presets.length + 1}`}
                className="min-w-0 flex-1 rounded-lg border border-gray-200/90 bg-white/70 px-2 py-1.5 text-xs text-gray-800 outline-none focus:border-gray-300"
              />
              <button
                type="button"
                onClick={handleSave}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-theme-chrome-fg shadow-sm"
                style={{ backgroundColor: themeColor }}
                title="保存当前点位与图例"
              >
                <Plus size={14} />
                保存
              </button>
            </div>
          </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
};

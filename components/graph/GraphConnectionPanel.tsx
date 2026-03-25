import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link2, Minus, MousePointer2, X } from 'lucide-react';
import type { Note } from '../../types';

export interface ConnectionDraft {
  fromNoteId: string;
  toNoteId: string;
  label: string;
  fromArrow: 'arrow' | 'none';
  toArrow: 'arrow' | 'none';
}

function noteSearchText(note: Note): string {
  const t = (note.text || '').trim();
  const line = t.indexOf('\n') === -1 ? t : t.slice(0, t.indexOf('\n'));
  const head = line.replace(/^#+\s+/, '').trim().split(/[,，]/, 1)[0] || '';
  const raw = `${note.emoji || ''}${head}`.trim();
  return raw || '便签';
}

interface GraphConnectionPanelProps {
  isOpen: boolean;
  themeColor: string;
  panelChromeStyle?: React.CSSProperties;
  notes: Note[];
  draft: ConnectionDraft;
  onDraftChange: (patch: Partial<ConnectionDraft>) => void;
  panelEditingKey: string | 'new';
  pickTarget: 'from' | 'to' | null;
  onPickTargetChange: (t: 'from' | 'to' | null) => void;
  onCommit: () => void;
  onDelete: () => void;
  onNewConnection: () => void;
  onClose: () => void;
  /** 当前在编辑已有连线时，开始编辑起终点则切换为新建草稿（与「新建」一致） */
  onBeginEndpointEdit?: () => void;
  /** 图中点选节点后递增：清空检索词并失焦输入框，避免进入「检索输入」状态 */
  graphPickNonce?: number;
  /** 同时清除边选中、画布节点高亮与草稿起终点 */
  onClearGraphAndDraftSelection?: () => void;
  /** 仅清除起点（用于编辑时保留另一侧） */
  onClearFromSelection?: () => void;
  /** 仅清除终点（用于编辑时保留另一侧） */
  onClearToSelection?: () => void;
  /** 是否显示清除按钮（有边选中、点高亮或草稿起终点时） */
  showClearSelection?: boolean;
  /** 点击已选便签标题时在图中定位该节点 */
  onFocusNoteOnGraph?: (noteId: string) => void;
  /** 禁用图中点选入口（例如 table 视图） */
  disableGraphPick?: boolean;
  /** 禁用点选时的提示文案 */
  graphPickDisabledHint?: string;
}

export const GraphConnectionPanel: React.FC<GraphConnectionPanelProps> = ({
  isOpen,
  themeColor,
  panelChromeStyle: ch,
  notes,
  draft,
  onDraftChange,
  panelEditingKey,
  pickTarget,
  onPickTargetChange,
  onCommit,
  onDelete,
  onNewConnection,
  onClose,
  onBeginEndpointEdit,
  graphPickNonce,
  onClearGraphAndDraftSelection,
  onClearFromSelection,
  onClearToSelection,
  showClearSelection,
  onFocusNoteOnGraph,
  disableGraphPick = false,
  graphPickDisabledHint = '请到 GraphView 选点'
}) => {
  const panelRootRef = useRef<HTMLDivElement>(null);
  const [qFrom, setQFrom] = useState('');
  const [qTo, setQTo] = useState('');
  const pickNoncePrev = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (graphPickNonce === undefined) return;
    if (pickNoncePrev.current === undefined) {
      pickNoncePrev.current = graphPickNonce;
      return;
    }
    if (pickNoncePrev.current === graphPickNonce) return;
    pickNoncePrev.current = graphPickNonce;
    setQFrom('');
    setQTo('');
    const root = panelRootRef.current;
    if (root) {
      root.querySelectorAll('input').forEach((inp) => {
        if (document.activeElement === inp) (inp as HTMLInputElement).blur();
      });
    }
  }, [graphPickNonce]);

  const filteredFrom = useMemo(() => {
    const q = qFrom.trim().toLowerCase();
    if (!q) return [];
    return notes
      .filter((n) => noteSearchText(n).toLowerCase().includes(q) || n.id.toLowerCase().includes(q))
      .slice(0, 12);
  }, [notes, qFrom]);

  const filteredTo = useMemo(() => {
    const q = qTo.trim().toLowerCase();
    if (!q) return [];
    return notes
      .filter((n) => noteSearchText(n).toLowerCase().includes(q) || n.id.toLowerCase().includes(q))
      .slice(0, 12);
  }, [notes, qTo]);

  const fromNote = draft.fromNoteId ? notes.find((n) => n.id === draft.fromNoteId) : undefined;
  const toNote = draft.toNoteId ? notes.find((n) => n.id === draft.toNoteId) : undefined;

  /** 起点行右侧：已选起点、或仅有全局选中（边/画布）且无起终点草稿时显示减号，点选模式中不占用为减号 */
  const fromSlotIsMinus =
    !!fromNote ||
    (!!onClearGraphAndDraftSelection &&
      !!showClearSelection &&
      !draft.fromNoteId &&
      !draft.toNoteId &&
      pickTarget == null);
  /** 终点行右侧：已选终点时显示减号 */
  const toSlotIsMinus = !!toNote;

  const beginEndpointEditIfNeeded = () => {
    if (panelEditingKey !== 'new') {
      onBeginEndpointEdit?.();
    }
  };

  /**
   * 图中点选节点后 pickTarget 会被清空，但 draft 仍带 fromNoteId —— 仅靠 pickTarget === 'from' 无法清空。
   * 聚焦/点按输入框：仅用于退出对侧点选，或在本侧处于「点选模式」时放弃点选并清空以便检索；
   * 已有已选节点时点击框体不再清空（避免误触取消）。
   */
  const onFromInputFocus = () => {
    if (pickTarget === 'from') {
      onPickTargetChange(null);
      onDraftChange({ fromNoteId: '' });
      setQFrom('');
    } else if (pickTarget === 'to') {
      onPickTargetChange(null);
    }
  };
  const onFromInputPointerDown = () => {
    if (panelEditingKey !== 'new') {
      onBeginEndpointEdit?.();
      return;
    }
    if (pickTarget === 'to') onPickTargetChange(null);
    if (pickTarget === 'from') {
      onPickTargetChange(null);
      onDraftChange({ fromNoteId: '' });
      setQFrom('');
    }
  };
  const onToInputFocus = () => {
    if (pickTarget === 'to') {
      onPickTargetChange(null);
      onDraftChange({ toNoteId: '' });
      setQTo('');
    } else if (pickTarget === 'from') {
      onPickTargetChange(null);
    }
  };
  const onToInputPointerDown = () => {
    if (panelEditingKey !== 'new') {
      onBeginEndpointEdit?.();
      return;
    }
    if (pickTarget === 'from') onPickTargetChange(null);
    if (pickTarget === 'to') {
      onPickTargetChange(null);
      onDraftChange({ toNoteId: '' });
      setQTo('');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={panelRootRef}
      data-allow-context-menu
      className={`fixed top-14 sm:top-16 left-2 sm:left-4 z-[520] w-[min(100%-1rem,22rem)] max-h-[calc(100dvh-3.5rem-1rem-env(safe-area-inset-bottom,0px))] sm:max-h-[calc(100dvh-4rem-1rem-env(safe-area-inset-bottom,0px))] overflow-y-auto rounded-2xl border shadow-xl p-4 text-sm ${
        ch ? 'border-gray-200/80' : 'border-white/50 map-chrome-surface-fallback'
      }`}
      style={ch}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="space-y-3">
        <div className="flex justify-between items-center gap-2">
          <span className="font-bold text-gray-800 flex items-center gap-2 min-w-0">
            <Link2 size={18} className="shrink-0 opacity-80" />
            <span className="truncate">关联</span>
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onNewConnection}
              className="text-[11px] px-2 py-1 rounded-lg text-gray-600 hover:bg-gray-100 font-medium"
            >
              新建
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors leading-none"
              aria-label="关闭面板"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-500 tracking-wide block">起点</label>
          <div className="flex gap-1.5 items-stretch">
            <div
              onPointerDown={!fromNote ? onFromInputPointerDown : undefined}
              className={`flex min-h-[2.75rem] min-w-0 flex-1 items-center gap-2 rounded-xl bg-white px-3 transition-[box-shadow,border-color] ${
                fromNote ? 'border-2 shadow-sm' : 'border border-gray-200/80'
              }`}
              style={
                fromNote
                  ? { borderColor: themeColor, boxShadow: `0 0 0 1px ${themeColor}33` }
                  : undefined
              }
            >
              {fromNote ? (
                <button
                  type="button"
                  onClick={() => onFocusNoteOnGraph?.(fromNote.id)}
                  className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-gray-900 py-2 rounded-lg hover:bg-gray-50/80 transition-colors -mx-1 px-1"
                  title="在图中定位"
                >
                  {noteSearchText(fromNote)}
                </button>
              ) : (
                <input
                  type="text"
                  value={qFrom}
                  onChange={(e) => setQFrom(e.target.value)}
                  onFocus={onFromInputFocus}
                  placeholder={pickTarget === 'from' ? '在图中点击节点作为起点' : '搜索'}
                  className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm outline-none focus:ring-2 focus:ring-inset focus:ring-offset-0 placeholder:text-gray-400"
                  style={{ ['--tw-ring-color' as string]: themeColor }}
                />
              )}
            </div>
            {fromSlotIsMinus && onClearGraphAndDraftSelection ? (
              <button
                type="button"
                onClick={onClearFromSelection ?? onClearGraphAndDraftSelection}
                className="shrink-0 self-center rounded-lg p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors leading-none w-9 h-9 flex items-center justify-center"
                title="清除边与点的选中"
                aria-label="清除边与点的选中"
              >
                <Minus size={16} strokeWidth={2.25} />
              </button>
            ) : (
              <button
                type="button"
                title={disableGraphPick ? graphPickDisabledHint : '在图中点选'}
                disabled={disableGraphPick}
                onClick={() => {
                  if (disableGraphPick) return;
                  beginEndpointEditIfNeeded();
                  onPickTargetChange(pickTarget === 'from' ? null : 'from');
                }}
                className={`shrink-0 self-center rounded-lg p-1.5 border-0 shadow-none outline-none ring-0 transition-colors focus-visible:ring-0 w-9 h-9 flex items-center justify-center ${
                  disableGraphPick
                    ? 'text-gray-300 bg-gray-100 cursor-not-allowed'
                    : pickTarget === 'from'
                    ? 'text-gray-800 bg-gray-200/45'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100/60'
                }`}
              >
                <MousePointer2 size={14} />
              </button>
            )}
          </div>
          {filteredFrom.length > 0 && (
            <ul className="max-h-28 overflow-y-auto rounded-lg border border-gray-100 divide-y divide-gray-50">
              {filteredFrom.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`w-full text-left px-2 py-1.5 text-xs hover:bg-gray-50 truncate ${
                      draft.fromNoteId === n.id ? 'bg-gray-100 font-medium' : ''
                    }`}
                    onClick={() => {
                      beginEndpointEditIfNeeded();
                      onDraftChange({ fromNoteId: n.id });
                      setQFrom('');
                      onFocusNoteOnGraph?.(n.id);
                    }}
                  >
                    {noteSearchText(n)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-500 tracking-wide block">终点</label>
          <div className="flex gap-1.5 items-stretch">
            <div
              onPointerDown={!toNote ? onToInputPointerDown : undefined}
              className={`flex min-h-[2.75rem] min-w-0 flex-1 items-center gap-2 rounded-xl bg-white px-3 transition-[box-shadow,border-color] ${
                toNote ? 'border-2 shadow-sm' : 'border border-gray-200/80'
              }`}
              style={
                toNote
                  ? { borderColor: themeColor, boxShadow: `0 0 0 1px ${themeColor}33` }
                  : undefined
              }
            >
              {toNote ? (
                <button
                  type="button"
                  onClick={() => onFocusNoteOnGraph?.(toNote.id)}
                  className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-gray-900 py-2 rounded-lg hover:bg-gray-50/80 transition-colors -mx-1 px-1"
                  title="在图中定位"
                >
                  {noteSearchText(toNote)}
                </button>
              ) : (
                <input
                  type="text"
                  value={qTo}
                  onChange={(e) => setQTo(e.target.value)}
                  onFocus={onToInputFocus}
                  placeholder={pickTarget === 'to' ? '在图中点击节点作为终点' : '搜索'}
                  className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm outline-none focus:ring-2 focus:ring-inset focus:ring-offset-0 placeholder:text-gray-400"
                  style={{ ['--tw-ring-color' as string]: themeColor }}
                />
              )}
            </div>
            {toSlotIsMinus && onClearGraphAndDraftSelection ? (
              <button
                type="button"
                onClick={onClearToSelection ?? onClearGraphAndDraftSelection}
                className="shrink-0 self-center rounded-lg p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors leading-none w-9 h-9 flex items-center justify-center"
                title="清除边与点的选中"
                aria-label="清除边与点的选中"
              >
                <Minus size={16} strokeWidth={2.25} />
              </button>
            ) : (
              <button
                type="button"
                title={disableGraphPick ? graphPickDisabledHint : '在图中点选'}
                disabled={disableGraphPick}
                onClick={() => {
                  if (disableGraphPick) return;
                  beginEndpointEditIfNeeded();
                  onPickTargetChange(pickTarget === 'to' ? null : 'to');
                }}
                className={`shrink-0 self-center rounded-lg p-1.5 border-0 shadow-none outline-none ring-0 transition-colors focus-visible:ring-0 w-9 h-9 flex items-center justify-center ${
                  disableGraphPick
                    ? 'text-gray-300 bg-gray-100 cursor-not-allowed'
                    : pickTarget === 'to'
                    ? 'text-gray-800 bg-gray-200/45'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100/60'
                }`}
              >
                <MousePointer2 size={14} />
              </button>
            )}
          </div>
          {filteredTo.length > 0 && (
            <ul className="max-h-28 overflow-y-auto rounded-lg border border-gray-100 divide-y divide-gray-50">
              {filteredTo.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`w-full text-left px-2 py-1.5 text-xs hover:bg-gray-50 truncate ${
                      draft.toNoteId === n.id ? 'bg-gray-100 font-medium' : ''
                    }`}
                    onClick={() => {
                      beginEndpointEditIfNeeded();
                      onDraftChange({ toNoteId: n.id });
                      setQTo('');
                      onFocusNoteOnGraph?.(n.id);
                    }}
                  >
                    {noteSearchText(n)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-500 tracking-wide">关系</label>
          <input
            value={draft.label}
            onChange={(e) => onDraftChange({ label: e.target.value })}
            className="w-full px-3 py-2 rounded-xl border border-gray-200/80 bg-white text-sm outline-none focus:ring-2 focus:ring-offset-0"
            style={{ ['--tw-ring-color' as string]: themeColor }}
          />
        </div>

        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <label className="text-[10px] font-semibold text-gray-500">起点端</label>
            <select
              value={draft.fromArrow}
              onChange={(e) => onDraftChange({ fromArrow: e.target.value as 'arrow' | 'none' })}
              className="w-full text-xs px-2 py-1.5 rounded-lg border border-gray-200 bg-white"
            >
              <option value="none">无</option>
              <option value="arrow">←</option>
            </select>
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-[10px] font-semibold text-gray-500">终点端</label>
            <select
              value={draft.toArrow}
              onChange={(e) => onDraftChange({ toArrow: e.target.value as 'arrow' | 'none' })}
              className="w-full text-xs px-2 py-1.5 rounded-lg border border-gray-200 bg-white"
            >
              <option value="none">无</option>
              <option value="arrow">→</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {panelEditingKey === 'new' && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              取消
            </button>
          )}
          <button
            type="button"
            onClick={onCommit}
            className="flex-1 min-w-[6rem] py-2.5 rounded-xl text-xs font-semibold text-theme-chrome-fg shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: themeColor }}
          >
            保存
          </button>
          {panelEditingKey !== 'new' && (
            <button
              type="button"
              onClick={onDelete}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors"
            >
              删除
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

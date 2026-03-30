import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Frame as FrameIcon,
  GripVertical,
  Tag as TagIcon
} from 'lucide-react';
import { TAG_COLORS } from '../../constants';
import type { Frame, GraphLayerState, Note } from '../../types';
import {
  GRAPH_LAYER_WEIGHT_MAX,
  GRAPH_LAYER_WEIGHT_MIN,
  type GraphLayerGroupStandard
} from '../../utils/graph/graphRuntimeCore';
import {
  groupDisplayLabel,
  noteBelongsToLayerGroupKey,
  sortNotesForLayerPanelDesc,
  truncateRawTextLabel
} from '../../utils/layer/unifiedNoteLayer';
import { SettingsCompactSlider } from '../ui/SettingsCompactSlider';
import { TagAddPanel } from '../ui/TagAddPanel';

function insertRelative(order: string[], fromKey: string, toKey: string, place: 'before' | 'after'): string[] {
  const next = [...order];
  const fromIdx = next.indexOf(fromKey);
  let toIdx = next.indexOf(toKey);
  if (fromIdx < 0 || toIdx < 0 || fromKey === toKey) return order;
  next.splice(fromIdx, 1);
  toIdx = next.indexOf(toKey);
  if (toIdx < 0) return order;
  const insertAt = place === 'after' ? toIdx + 1 : toIdx;
  next.splice(insertAt, 0, fromKey);
  return next;
}

function normalizeTagLabel(v: string | undefined | null): string {
  return String(v ?? '').trim();
}

function accordionStorageKey(projectId: string, standard: GraphLayerGroupStandard): string {
  return `unifiedNotesLayerAccordion:v1:${projectId}:${standard}`;
}

export interface ProjectNotesLayerPanelProps {
  themeColor: string;
  panelChromeStyle?: React.CSSProperties;
  variant?: 'graph' | 'dock';
  projectId: string;
  merged: GraphLayerState;
  layerGroupStandard: GraphLayerGroupStandard;
  onLayerGroupStandardChange: (standard: GraphLayerGroupStandard) => void;
  onStateChange: (next: GraphLayerState) => void;
  notes: Note[];
  onUpdateNote: (note: Note) => void;
  onBatchUpdateNotes?: (nextNotes: Note[]) => void | Promise<void>;
  frames: Frame[];
  onActivateNote?: (note: Note) => void;
  boardVariantToggles?: {
    primary: boolean;
    image: boolean;
    onChange: (next: { primary: boolean; image: boolean }) => void;
  };
  /** Table 等：嵌入滚动区，不用 absolute 下拉 */
  embed?: boolean;
  /** Map：`start` 与图层按钮左对齐，`end` 与按钮右对齐 */
  dockAlign?: 'start' | 'end';
}

export const ProjectNotesLayerPanel: React.FC<ProjectNotesLayerPanelProps> = ({
  themeColor,
  panelChromeStyle,
  variant: _layerPanelVariant = 'dock',
  projectId,
  merged,
  layerGroupStandard,
  onLayerGroupStandardChange,
  onStateChange,
  notes,
  onUpdateNote,
  onBatchUpdateNotes,
  frames,
  onActivateNote,
  boardVariantToggles,
  embed = false,
  dockAlign = 'start'
}) => {
  const hiddenSet = new Set((merged.hidden ?? []).map((h) => String(h).trim()));
  const keysSet = useMemo(() => new Set((merged.order ?? []).map((k) => String(k).trim())), [merged.order]);
  const framesById = useMemo(() => new Map(frames.map((f) => [String(f.id).trim(), f])), [frames]);

  const tagColorsByKey = useMemo(() => {
    if (layerGroupStandard !== 'tag') return new Map<string, string[]>();
    const map = new Map<string, string[]>();
    const seenColorSetByKey = new Map<string, Set<string>>();

    for (const note of notes) {
      for (const t of note.tags ?? []) {
        const label = normalizeTagLabel(t.label);
        if (!keysSet.has(label)) continue;
        const c = t.color;
        if (!map.has(label)) {
          map.set(label, []);
          seenColorSetByKey.set(label, new Set());
        }
        const seen = seenColorSetByKey.get(label)!;
        if (!seen.has(c)) {
          seen.add(c);
          map.get(label)!.push(c);
        }
      }
    }

    return map;
  }, [notes, keysSet, layerGroupStandard]);

  const frameColorsByKey = useMemo(() => {
    if (layerGroupStandard !== 'frame') return new Map<string, string[]>();
    const map = new Map<string, string[]>();
    for (const f of frames) {
      const id = String(f.id).trim();
      if (!keysSet.has(id)) continue;
      map.set(id, [f.color]);
    }
    return map;
  }, [frames, keysSet, layerGroupStandard]);

  type TagColorBatchEditor = {
    tagLabelKey: string;
    fromColor: string;
    toColor: string;
    portalPlacement: { top: number; left: number };
  };
  const [tagColorBatchEditor, setTagColorBatchEditor] = useState<TagColorBatchEditor | null>(null);

  const openTagColorBatchEditor = useCallback(
    (tagLabelKey: string, fromColor: string, anchorEl: HTMLElement) => {
      if (layerGroupStandard !== 'tag') return;
      const rect = anchorEl.getBoundingClientRect();
      const TAG_PANEL_EST_W = 260;
      const TAG_PANEL_EST_H = 220;
      const gap = 8;
      let top = rect.bottom + gap;
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < TAG_PANEL_EST_H && rect.top > TAG_PANEL_EST_H + gap) {
        top = rect.top - TAG_PANEL_EST_H - gap;
      }
      let left = rect.left;
      left = Math.max(8, Math.min(left, window.innerWidth - TAG_PANEL_EST_W - 8));

      const idx = TAG_COLORS.indexOf(fromColor);
      const defaultToColor = idx >= 0 ? TAG_COLORS[(idx + 1) % TAG_COLORS.length] : TAG_COLORS[0];

      setTagColorBatchEditor({
        tagLabelKey,
        fromColor,
        toColor: defaultToColor,
        portalPlacement: { top, left }
      });
    },
    [layerGroupStandard]
  );

  const applyBatchTagColorChange = useCallback(
    async (tagLabelKey: string, fromColor: string, toColor: string) => {
      if (layerGroupStandard !== 'tag') return;
      if (toColor === fromColor) return;

      const nextNotes = notes.map((note) => {
        let changed = false;
        const nextTags = (note.tags ?? []).map((t) => {
          const label = normalizeTagLabel(t.label);
          if (label === tagLabelKey && t.color === fromColor) {
            changed = true;
            return { ...t, color: toColor };
          }
          return t;
        });
        return changed ? { ...note, tags: nextTags } : note;
      });

      if (onBatchUpdateNotes) {
        await onBatchUpdateNotes(nextNotes);
        return;
      }

      for (let i = 0; i < nextNotes.length; i++) {
        const nextNote = nextNotes[i];
        const origNote = notes[i];
        if (nextNote === origNote) continue;
        await Promise.resolve(onUpdateNote(nextNote));
      }
    },
    [layerGroupStandard, notes, onUpdateNote, onBatchUpdateNotes]
  );

  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setExpandedGroupKey(null);
      return;
    }
    try {
      const raw = localStorage.getItem(accordionStorageKey(projectId, layerGroupStandard));
      if (raw == null || raw === 'null') {
        setExpandedGroupKey(null);
        return;
      }
      const parsed = JSON.parse(raw) as string | null;
      setExpandedGroupKey(typeof parsed === 'string' ? parsed : null);
    } catch {
      setExpandedGroupKey(null);
    }
  }, [projectId, layerGroupStandard]);

  const persistExpanded = useCallback(
    (key: string | null) => {
      setExpandedGroupKey(key);
      if (!projectId) return;
      try {
        localStorage.setItem(accordionStorageKey(projectId, layerGroupStandard), JSON.stringify(key));
      } catch {
        /* ignore */
      }
    },
    [projectId, layerGroupStandard]
  );

  const toggleAccordion = useCallback(
    (rowKey: string) => {
      persistExpanded(expandedGroupKey === rowKey ? null : rowKey);
    },
    [expandedGroupKey, persistExpanded]
  );

  const [dragKey, setDragKey] = useState<string | null>(null);
  const [weightOpenKey, setWeightOpenKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [dropPlace, setDropPlace] = useState<'before' | 'after'>('before');

  const [dragNoteId, setDragNoteId] = useState<string | null>(null);
  const [overNoteId, setOverNoteId] = useState<string | null>(null);
  const [noteDropPlace, setNoteDropPlace] = useState<'before' | 'after'>('before');

  const patch = useCallback(
    (fn: (prev: GraphLayerState) => GraphLayerState) => {
      onStateChange(fn(merged));
    },
    [merged, onStateChange]
  );

  const clearDropIndicator = useCallback(() => {
    setOverKey(null);
  }, []);

  const clearNoteDrop = useCallback(() => {
    setOverNoteId(null);
  }, []);

  const applyReorderInGroup = useCallback(
    (groupKey: string, newOrderTopFirst: Note[]) => {
      const base = Date.now();
      const len = newOrderTopFirst.length;
      const updates: Note[] = newOrderTopFirst.map((n, i) => ({
        ...n,
        layerStackOrder: base + (len - i) * 10
      }));
      if (onBatchUpdateNotes) {
        void onBatchUpdateNotes(
          notes.map((n) => {
            const u = updates.find((x) => x.id === n.id);
            return u ?? n;
          })
        );
        return;
      }
      updates.forEach((u) => onUpdateNote(u));
    },
    [notes, onBatchUpdateNotes, onUpdateNote]
  );

  const weightSideOpen = weightOpenKey != null;
  const weightPanelKey = weightOpenKey;

  const posCls = embed
    ? 'relative z-[40] my-2'
    : dockAlign === 'end'
      ? 'absolute right-0 left-auto top-full z-[2000]'
      : 'absolute left-0 top-full z-[2000]';

  return (
    <div
      className={`${posCls} mt-2 flex max-h-[min(24rem,70vh)] overflow-hidden rounded-xl border border-gray-200/90 shadow-xl ${
        embed ? 'w-full max-w-xl' : weightSideOpen ? 'w-[min(36rem,calc(100vw-1rem))]' : 'w-[min(20rem,calc(100vw-2rem))]'
      }`}
      style={panelChromeStyle ?? { backgroundColor: 'rgba(255,255,255,0.96)' }}
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="max-h-[min(22rem,68vh)] min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 py-0.5 theme-surface-scrollbar">
          {boardVariantToggles ? (
            <>
              <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">显示类型</div>
              <div className="mb-2 space-y-1 rounded-lg border border-gray-100 bg-gray-50/50 px-2 py-1.5">
                <label className="flex items-center justify-between gap-2 text-xs text-gray-700">
                  <span>便签</span>
                  <input
                    type="checkbox"
                    checked={boardVariantToggles.primary}
                    onChange={() =>
                      boardVariantToggles.onChange({
                        primary: !boardVariantToggles.primary,
                        image: boardVariantToggles.image
                      })
                    }
                    className="h-4 w-4 rounded border-2"
                    style={{ accentColor: themeColor }}
                  />
                </label>
                <label className="flex items-center justify-between gap-2 text-xs text-gray-700">
                  <span>图片</span>
                  <input
                    type="checkbox"
                    checked={boardVariantToggles.image}
                    onChange={() =>
                      boardVariantToggles.onChange({
                        primary: boardVariantToggles.primary,
                        image: !boardVariantToggles.image
                      })
                    }
                    className="h-4 w-4 rounded border-2"
                    style={{ accentColor: themeColor }}
                  />
                </label>
              </div>
            </>
          ) : null}

          <div className="flex items-center gap-2 px-1.5 py-1.5">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onLayerGroupStandardChange('tag');
              }}
              className={`flex flex-1 items-center justify-center rounded-lg px-2 py-1.5 transition-colors ${
                layerGroupStandard === 'tag' ? 'text-white' : 'text-gray-600'
              } ${layerGroupStandard === 'tag' ? '' : 'bg-gray-100 hover:bg-gray-200'}`}
              style={layerGroupStandard === 'tag' ? { backgroundColor: themeColor } : undefined}
              aria-label="切换为按标签分组"
              title="按标签分组"
            >
              <TagIcon size={18} strokeWidth={2} aria-hidden />
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onLayerGroupStandardChange('frame');
              }}
              className={`flex flex-1 items-center justify-center rounded-lg px-2 py-1.5 transition-colors ${
                layerGroupStandard === 'frame' ? 'text-white' : 'text-gray-600'
              } ${layerGroupStandard === 'frame' ? '' : 'bg-gray-100 hover:bg-gray-200'}`}
              style={layerGroupStandard === 'frame' ? { backgroundColor: themeColor } : undefined}
              aria-label="切换为按帧分组"
              title="按帧分组"
            >
              <FrameIcon size={18} strokeWidth={2} aria-hidden />
            </button>
          </div>

          {merged.order.map((key) => {
            const k = String(key).trim();
            const visible = !hiddenSet.has(k);
            const rowKey = k === '' && layerGroupStandard === 'frame' ? '__empty_frame__' : k;
            const weightOpen = weightOpenKey === k;
            const isDragging = dragKey === k;
            const isOver = overKey === k && dragKey != null && dragKey !== k;
            const showLineBefore = isOver && dropPlace === 'before';
            const showLineAfter = isOver && dropPlace === 'after';
            const expanded = expandedGroupKey === rowKey;
            const groupNotes = notes.filter((n) => noteBelongsToLayerGroupKey(n, k, layerGroupStandard));
            const panelNotes = sortNotesForLayerPanelDesc(groupNotes);

            return (
              <div key={rowKey}>
                {showLineBefore ? (
                  <div
                    className="mx-2 h-0.5 rounded-full transition-opacity duration-150"
                    style={{ backgroundColor: themeColor }}
                  />
                ) : null}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragKey == null || dragKey === k) return;
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const before = e.clientY < rect.top + rect.height / 2;
                    setOverKey(k);
                    setDropPlace(before ? 'before' : 'after');
                  }}
                  onDragLeave={(e) => {
                    const related = e.relatedTarget as Node | null;
                    if (related && (e.currentTarget as HTMLElement).contains(related)) return;
                    if (overKey === k) clearDropIndicator();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = dragKey;
                    setDragKey(null);
                    clearDropIndicator();
                    if (from == null || from === k) return;
                    patch((p) => ({
                      ...p,
                      order: insertRelative(p.order, from, k, dropPlace)
                    }));
                  }}
                  className={`flex flex-col rounded-lg transition-colors duration-150 ${
                    isOver && !isDragging ? 'bg-gray-50/90' : ''
                  }`}
                >
                  <div
                    className={`flex items-center gap-1 px-2 py-1 transition-[opacity,transform] duration-150 ease-out ${
                      isDragging ? 'opacity-45 scale-[0.98]' : 'opacity-100 scale-100'
                    }`}
                  >
                    <button
                      type="button"
                      className="shrink-0 rounded-md p-0.5 text-gray-500 hover:bg-gray-100"
                      aria-expanded={expanded}
                      onClick={() => toggleAccordion(rowKey)}
                    >
                      {expanded ? (
                        <ChevronDown size={18} strokeWidth={2} />
                      ) : (
                        <ChevronRight size={18} strokeWidth={2} />
                      )}
                    </button>
                    <div
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', k);
                        setDragKey(k);
                        try {
                          e.dataTransfer.setDragImage(e.currentTarget, 12, 12);
                        } catch {
                          /* ignore */
                        }
                      }}
                      onDragEnd={() => {
                        setDragKey(null);
                        clearDropIndicator();
                      }}
                      className="shrink-0 cursor-grab text-gray-400 active:cursor-grabbing"
                      aria-hidden
                    >
                      <GripVertical size={16} strokeWidth={2} />
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1 pr-0.5">
                      {(
                        (layerGroupStandard === 'tag' ? tagColorsByKey.get(k) : frameColorsByKey.get(k)) ?? []
                      )
                        .slice(0, 6)
                        .map((c) => (
                          <button
                            key={`${k}:${c}`}
                            type="button"
                            draggable={false}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (layerGroupStandard === 'tag') {
                                openTagColorBatchEditor(k, c, e.currentTarget);
                              }
                            }}
                            className="h-3 w-3 rounded-full border border-white/90 shadow-sm transition-transform hover:scale-110"
                            style={{ backgroundColor: c }}
                            title={layerGroupStandard === 'tag' ? `点击切换颜色：${c}` : `帧颜色：${c}`}
                            aria-label={`分组「${groupDisplayLabel(k, layerGroupStandard, framesById)}」颜色`}
                          />
                        ))}
                      {(
                        (layerGroupStandard === 'tag' ? tagColorsByKey.get(k) : frameColorsByKey.get(k)) ?? []
                      ).length > 6 ? (
                        <span className="pl-0.5 text-[10px] leading-none text-gray-400">
                          +{((layerGroupStandard === 'tag' ? tagColorsByKey.get(k) : frameColorsByKey.get(k)) ?? []).length - 6}
                        </span>
                      ) : null}
                    </div>
                    <span
                      className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800"
                      title={groupDisplayLabel(k, layerGroupStandard, framesById)}
                    >
                      {groupDisplayLabel(k, layerGroupStandard, framesById)}
                    </span>
                    <span className="shrink-0 text-[10px] text-gray-400">{groupNotes.length}</span>
                    <button
                      type="button"
                      draggable={false}
                      className="shrink-0 rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
                      aria-label={visible ? '隐藏分组' : '显示分组'}
                      onClick={() =>
                        patch((p) => {
                          const h = new Set((p.hidden ?? []).map((x) => String(x).trim()));
                          if (h.has(k)) h.delete(k);
                          else h.add(k);
                          return { ...p, hidden: [...h] };
                        })
                      }
                    >
                      {visible ? <Eye size={18} strokeWidth={2} /> : <EyeOff size={18} strokeWidth={2} />}
                    </button>
                    <button
                      type="button"
                      draggable={false}
                      className={`shrink-0 rounded-md p-1.5 hover:bg-gray-100 ${
                        weightOpen ? 'text-gray-900' : 'text-gray-500'
                      }`}
                      style={weightOpen ? { color: themeColor } : undefined}
                      aria-label={weightOpen ? '关闭权重面板' : '在右侧调节半径权重'}
                      title={layerGroupStandard === 'tag' ? '标签分组半径权重' : '帧分组半径权重'}
                      onClick={() => setWeightOpenKey((prev) => (prev === k ? null : k))}
                    >
                      {weightOpen ? (
                        <ChevronLeft size={18} strokeWidth={2} />
                      ) : (
                        <ChevronRight size={18} strokeWidth={2} />
                      )}
                    </button>
                  </div>

                  {expanded ? (
                    <div className="border-t border-gray-100/90 pb-1 pl-1 pr-1 pt-0.5">
                      {panelNotes.map((note) => {
                        const nVisible = !note.layerItemHidden;
                        const isNDrag = dragNoteId === note.id;
                        const isNOver = overNoteId === note.id && dragNoteId != null && dragNoteId !== note.id;
                        const lineB = isNOver && noteDropPlace === 'before';
                        const lineA = isNOver && noteDropPlace === 'after';
                        return (
                          <div key={note.id}>
                            {lineB ? (
                              <div
                                className="mx-3 h-0.5 rounded-full"
                                style={{ backgroundColor: themeColor }}
                              />
                            ) : null}
                            <div
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                e.dataTransfer.dropEffect = 'move';
                                if (!dragNoteId || dragNoteId === note.id) return;
                                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                                const before = e.clientY < rect.top + rect.height / 2;
                                setOverNoteId(note.id);
                                setNoteDropPlace(before ? 'before' : 'after');
                              }}
                              onDragLeave={(e) => {
                                const related = e.relatedTarget as Node | null;
                                if (related && (e.currentTarget as HTMLElement).contains(related)) return;
                                if (overNoteId === note.id) clearNoteDrop();
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const fromId = dragNoteId;
                                setDragNoteId(null);
                                clearNoteDrop();
                                if (!fromId || fromId === note.id) return;
                                const orderIds = panelNotes.map((n) => n.id);
                                const fromIdx = orderIds.indexOf(fromId);
                                const toIdx = orderIds.indexOf(note.id);
                                if (fromIdx < 0 || toIdx < 0) return;
                                const nextIds = [...orderIds];
                                nextIds.splice(fromIdx, 1);
                                let insertAt = toIdx;
                                if (fromIdx < toIdx) insertAt -= 1;
                                if (noteDropPlace === 'after') insertAt += 1;
                                insertAt = Math.max(0, Math.min(nextIds.length, insertAt));
                                nextIds.splice(insertAt, 0, fromId);
                                const reordered = nextIds
                                  .map((id) => panelNotes.find((x) => x.id === id))
                                  .filter(Boolean) as Note[];
                                applyReorderInGroup(k, reordered);
                              }}
                              className={`flex items-center gap-1 rounded-md border border-transparent px-1 py-0.5 ${
                                isNOver && !isNDrag ? 'bg-gray-120/90' : 'bg-gray-100/90'
                              }`}
                            >
                              <div
                                draggable
                                onDragStart={(e) => {
                                  e.stopPropagation();
                                  e.dataTransfer.effectAllowed = 'move';
                                  e.dataTransfer.setData('text/plain', note.id);
                                  setDragNoteId(note.id);
                                }}
                                onDragEnd={() => {
                                  setDragNoteId(null);
                                  clearNoteDrop();
                                }}
                                className="shrink-0 cursor-grab text-gray-400 active:cursor-grabbing"
                              >
                                <GripVertical size={14} strokeWidth={2} />
                              </div>
                              <button
                                type="button"
                                draggable={false}
                                className="min-w-0 flex-1 truncate text-left text-xs text-gray-500 hover:text-gray-700"
                                title={note.text || ''}
                                onClick={() => onActivateNote?.(note)}
                              >
                                {truncateRawTextLabel(note.text || '')}
                              </button>
                              <button
                                type="button"
                                draggable={false}
                                className="shrink-0 rounded-md p-1 text-gray-500 hover:bg-gray-100"
                                aria-label={nVisible ? '隐藏节点' : '显示节点'}
                                onClick={() =>
                                  onUpdateNote({ ...note, layerItemHidden: !note.layerItemHidden })
                                }
                              >
                                {nVisible ? <Eye size={16} strokeWidth={2} /> : <EyeOff size={16} strokeWidth={2} />}
                              </button>
                            </div>
                            {lineA ? (
                              <div
                                className="mx-3 h-0.5 rounded-full"
                                style={{ backgroundColor: themeColor }}
                              />
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
                {showLineAfter ? (
                  <div
                    className="mx-2 h-0.5 rounded-full transition-opacity duration-150"
                    style={{ backgroundColor: themeColor }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {weightPanelKey != null ? (
        <div
          className="flex w-[min(16rem,45vw)] shrink-0 flex-col justify-center border-l border-gray-200/85 px-2 py-2"
          title={groupDisplayLabel(weightPanelKey, layerGroupStandard, framesById)}
        >
          <SettingsCompactSlider
            label="半径权重"
            themeColor={themeColor}
            value={merged.weights?.[weightPanelKey] ?? 0.5}
            min={GRAPH_LAYER_WEIGHT_MIN}
            max={GRAPH_LAYER_WEIGHT_MAX}
            step={0.05}
            onChange={(v) =>
              patch((p) => ({
                ...p,
                weights: { ...p.weights, [weightPanelKey]: v }
              }))
            }
            formatValue={(v) => v.toFixed(2)}
            minCaption="近心"
            maxCaption="远心"
            trackWidth="stretch"
            className="min-w-0"
          />
        </div>
      ) : null}

      {tagColorBatchEditor && (
        <TagAddPanel
          themeColor={themeColor}
          panelChromeStyle={panelChromeStyle}
          title={`批量修改标签「${groupDisplayLabel(tagColorBatchEditor.tagLabelKey, 'tag', framesById)}」颜色`}
          label={tagColorBatchEditor.tagLabelKey}
          hideLabelInput
          selectedColor={tagColorBatchEditor.toColor}
          onColorChange={(c) => {
            setTagColorBatchEditor((prev) => (prev ? { ...prev, toColor: c } : prev));
          }}
          onApply={async () => {
            await applyBatchTagColorChange(
              tagColorBatchEditor.tagLabelKey,
              tagColorBatchEditor.fromColor,
              tagColorBatchEditor.toColor
            );
            setTagColorBatchEditor(null);
          }}
          onDismissOutside={() => setTagColorBatchEditor(null)}
          portalPlacement={tagColorBatchEditor.portalPlacement}
          closeOnInteractOutside
          dismissIgnoreClosestSelector={undefined}
          autoFocus={false}
          onLabelChange={() => {}}
        />
      )}
    </div>
  );
};

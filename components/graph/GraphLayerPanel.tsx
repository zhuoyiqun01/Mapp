import React, { useCallback, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, EyeOff, GripVertical } from 'lucide-react';
import { TAG_COLORS } from '../../constants';
import type { Frame, GraphLayerState, Note } from '../../types';
import { GRAPH_LAYER_WEIGHT_MAX, GRAPH_LAYER_WEIGHT_MIN, type GraphLayerGroupStandard } from '../../utils/graph/graphRuntimeCore';
import { SettingsCompactSlider } from '../ui/SettingsCompactSlider';
import { TagAddPanel } from '../ui/TagAddPanel';

export interface GraphLayerPanelProps {
  themeColor: string;
  panelChromeStyle?: React.CSSProperties;
  merged: GraphLayerState;
  layerGroupStandard: GraphLayerGroupStandard;
  onLayerGroupStandardChange: (standard: GraphLayerGroupStandard) => void;
  onStateChange: (next: GraphLayerState) => void;
  notes: Note[];
  onUpdateNote: (note: Note) => void;
  /**
   * 批量更新 notes（一次性提交），用于避免多次 `updateNoteInProject`
   * 因为基于同一 `activeProject` 快照而互相覆盖。
   */
  onBatchUpdateNotes?: (nextNotes: Note[]) => void | Promise<void>;
  frames: Frame[];
}

function groupLabel(key: string, layerGroupStandard: GraphLayerGroupStandard, framesById: Map<string, Frame>): string {
  const k = String(key).trim();
  if (layerGroupStandard === 'tag') return k === '' ? '无标签' : k;
  if (k === '') return '无帧';
  return framesById.get(k)?.title ?? k;
}

function normalizeTagLabel(v: string | undefined | null): string {
  return String(v ?? '').trim();
}

/** 将 fromKey 移到 toKey 之前或之后（与 order 内键一致） */
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

/** 图谱：标签组顺序（整行拖拽 + 插入指示）、显隐（眼睛）、权重（展开滑块） */
export const GraphLayerPanel: React.FC<GraphLayerPanelProps> = ({
  themeColor,
  panelChromeStyle,
  merged,
  layerGroupStandard,
  onLayerGroupStandardChange,
  onStateChange,
  notes,
  onUpdateNote,
  onBatchUpdateNotes,
  frames
}) => {
  const hiddenSet = new Set((merged.hidden ?? []).map((h) => String(h).trim()));
  const keysSet = useMemo(() => new Set((merged.order ?? []).map((k) => String(k).trim())), [merged.order]);
  const framesById = useMemo(() => new Map(frames.map((f) => [String(f.id).trim(), f])), [frames]);

  // Colors per group key (used for the little colored dots).
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

      // 批量修改：所有便签中 label==该分组 且 color==fromColor 的 tag 颜色都切到 toColor
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

      // fallback：尽量顺序更新（但由于 activeProject 快照问题，可能仍会丢失）。
      for (let i = 0; i < nextNotes.length; i++) {
        const nextNote = nextNotes[i];
        const origNote = notes[i];
        if (nextNote === origNote) continue;
        await Promise.resolve(onUpdateNote(nextNote));
      }
    },
    [layerGroupStandard, notes, onUpdateNote, onBatchUpdateNotes]
  );

  const [dragKey, setDragKey] = useState<string | null>(null);
  const [weightOpenKey, setWeightOpenKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [dropPlace, setDropPlace] = useState<'before' | 'after'>('before');

  const patch = useCallback(
    (fn: (prev: GraphLayerState) => GraphLayerState) => {
      onStateChange(fn(merged));
    },
    [merged, onStateChange]
  );

  const clearDropIndicator = useCallback(() => {
    setOverKey(null);
  }, []);

  const weightSideOpen = weightOpenKey != null;
  const weightPanelKey = weightOpenKey;

  return (
    <div
      className={`absolute left-0 top-full z-[2000] mt-2 flex max-h-[min(24rem,70vh)] overflow-hidden rounded-xl border border-gray-200/90 shadow-xl ${
        weightSideOpen ? 'w-[min(36rem,calc(100vw-1rem))]' : 'w-[min(20rem,calc(100vw-2rem))]'
      }`}
      style={panelChromeStyle ?? { backgroundColor: 'rgba(255,255,255,0.96)' }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="max-h-[min(22rem,68vh)] min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 py-0.5 theme-surface-scrollbar">
          <div className="flex items-center gap-2 px-1.5 py-1.5">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onLayerGroupStandardChange('tag');
              }}
              className={`flex-1 rounded-lg px-2 py-1 text-xs font-semibold transition-colors ${
                layerGroupStandard === 'tag' ? 'text-white' : 'text-gray-600'
              } ${layerGroupStandard === 'tag' ? '' : 'bg-gray-100 hover:bg-gray-200'}`}
              style={layerGroupStandard === 'tag' ? { backgroundColor: themeColor } : undefined}
              aria-label="切换为按标签分组"
            >
              tag
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onLayerGroupStandardChange('frame');
              }}
              className={`flex-1 rounded-lg px-2 py-1 text-xs font-semibold transition-colors ${
                layerGroupStandard === 'frame' ? 'text-white' : 'text-gray-600'
              } ${layerGroupStandard === 'frame' ? '' : 'bg-gray-100 hover:bg-gray-200'}`}
              style={layerGroupStandard === 'frame' ? { backgroundColor: themeColor } : undefined}
              aria-label="切换为按帧分组"
            >
              frame
            </button>
          </div>
        {merged.order.map((key) => {
          const k = String(key).trim();
          const visible = !hiddenSet.has(k);
          const rowKey = k === '' ? '__empty_tag__' : k;
          const weightOpen = weightOpenKey === k;
          const isDragging = dragKey === k;
          const isOver = overKey === k && dragKey != null && dragKey !== k;
          const showLineBefore = isOver && dropPlace === 'before';
          const showLineAfter = isOver && dropPlace === 'after';

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
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', k);
                    setDragKey(k);
                    try {
                      e.dataTransfer.setDragImage(e.currentTarget, 24, 18);
                    } catch {
                      /* ignore */
                    }
                  }}
                  onDragEnd={() => {
                    setDragKey(null);
                    clearDropIndicator();
                  }}
                  className={`flex cursor-grab items-center gap-1.5 px-3 py-1.5 transition-[opacity,transform] duration-150 ease-out active:cursor-grabbing ${
                    isDragging ? 'opacity-45 scale-[0.98]' : 'opacity-100 scale-100'
                  }`}
                >
                  <div className="shrink-0 text-gray-400" aria-hidden>
                    <GripVertical size={16} strokeWidth={2} />
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1 pr-0.5">
                    {(
                      (layerGroupStandard === 'tag' ? tagColorsByKey.get(k) : frameColorsByKey.get(k)) ?? []
                    ).slice(0, 6).map((c) => (
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
                        className="w-3 h-3 rounded-full border border-white/90 shadow-sm hover:scale-110 transition-transform"
                        style={{ backgroundColor: c }}
                        title={layerGroupStandard === 'tag' ? `点击切换颜色：${c}` : `帧颜色：${c}`}
                        aria-label={`分组「${groupLabel(k, layerGroupStandard, framesById)}」颜色为 ${c}`}
                      />
                    ))}
                    {(
                      (layerGroupStandard === 'tag' ? tagColorsByKey.get(k) : frameColorsByKey.get(k)) ?? []
                    ).length > 6 ? (
                      <span className="text-[10px] text-gray-400 leading-none pl-0.5">
                        +{
                          ((layerGroupStandard === 'tag' ? tagColorsByKey.get(k) : frameColorsByKey.get(k)) ??
                            []).length - 6
                        }
                      </span>
                    ) : null}
                  </div>
                  <span
                    className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800"
                    title={groupLabel(k, layerGroupStandard, framesById)}
                  >
                    {groupLabel(k, layerGroupStandard, framesById)}
                  </span>
                  <button
                    type="button"
                    draggable={false}
                    className="shrink-0 rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
                    aria-label={visible ? '隐藏' : '显示'}
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
                    onClick={() => setWeightOpenKey((prev) => (prev === k ? null : k))}
                  >
                    {weightOpen ? (
                      <ChevronLeft size={18} strokeWidth={2} />
                    ) : (
                      <ChevronRight size={18} strokeWidth={2} />
                    )}
                  </button>
                </div>
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
          title={groupLabel(weightPanelKey, layerGroupStandard, framesById)}
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
          title={`批量修改标签「${groupLabel(tagColorBatchEditor.tagLabelKey, 'tag', framesById)}」颜色`}
          label={tagColorBatchEditor.tagLabelKey}
          hideLabelInput
          selectedColor={tagColorBatchEditor.toColor}
          onColorChange={(c) => {
            setTagColorBatchEditor((prev) =>
              prev ? { ...prev, toColor: c } : prev
            );
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
          // onLabelChange is unused when hideLabelInput=true
          onLabelChange={() => {}}
        />
      )}
    </div>
  );
};

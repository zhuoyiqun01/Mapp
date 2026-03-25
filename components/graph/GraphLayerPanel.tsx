import React, { useCallback, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, EyeOff, GripVertical } from 'lucide-react';
import { TAG_COLORS } from '../../constants';
import type { GraphLayerState, Note } from '../../types';
import { GRAPH_LAYER_WEIGHT_MAX, GRAPH_LAYER_WEIGHT_MIN } from '../../utils/graph/graphRuntimeCore';
import { SettingsCompactSlider } from '../ui/SettingsCompactSlider';

export interface GraphLayerPanelProps {
  themeColor: string;
  panelChromeStyle?: React.CSSProperties;
  merged: GraphLayerState;
  onStateChange: (next: GraphLayerState) => void;
  notes: Note[];
  onUpdateNote: (note: Note) => void;
}

function tagGroupLabel(key: string): string {
  const k = String(key).trim();
  return k === '' ? '无标签' : k;
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
  onStateChange,
  notes,
  onUpdateNote
}) => {
  const hiddenSet = new Set((merged.hidden ?? []).map((h) => String(h).trim()));
  const keysSet = useMemo(() => new Set((merged.order ?? []).map((k) => String(k).trim())), [merged.order]);

  // tag colors for each tagGroup key (based on all tags of matching label).
  const tagColorsByKey = useMemo(() => {
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
  }, [notes, keysSet]);

  const cycleTagColor = useCallback(
    (tagLabelKey: string, fromColor: string) => {
      const idx = TAG_COLORS.indexOf(fromColor);
      const toColor = idx >= 0 ? TAG_COLORS[(idx + 1) % TAG_COLORS.length] : TAG_COLORS[0];
      if (toColor === fromColor) return;

      // 批量修改：所有便签中 label==该分组 且 color==点击颜色 的 tag 颜色都切到 toColor
      for (const note of notes) {
        let changed = false;
        const nextTags = (note.tags ?? []).map((t) => {
          const label = normalizeTagLabel(t.label);
          if (label === tagLabelKey && t.color === fromColor) {
            changed = true;
            return { ...t, color: toColor };
          }
          return t;
        });
        if (!changed) continue;
        onUpdateNote({ ...note, tags: nextTags });
      }
    },
    [notes, onUpdateNote]
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
                    {(tagColorsByKey.get(k) ?? []).slice(0, 6).map((c) => (
                      <button
                        key={`${k}:${c}`}
                        type="button"
                        draggable={false}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          cycleTagColor(k, c);
                        }}
                        className="w-3 h-3 rounded-full border border-white/90 shadow-sm hover:scale-110 transition-transform"
                        style={{ backgroundColor: c }}
                        title={`点击切换颜色：${c}`}
                        aria-label={`切换标签「${tagGroupLabel(k)}」中颜色为 ${c} 的 tag`}
                      />
                    ))}
                    {((tagColorsByKey.get(k) ?? []).length ?? 0) > 6 ? (
                      <span className="text-[10px] text-gray-400 leading-none pl-0.5">+{(tagColorsByKey.get(k) ?? []).length - 6}</span>
                    ) : null}
                  </div>
                  <span
                    className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800"
                    title={tagGroupLabel(k)}
                  >
                    {tagGroupLabel(k)}
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
          title={tagGroupLabel(weightPanelKey)}
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
    </div>
  );
};

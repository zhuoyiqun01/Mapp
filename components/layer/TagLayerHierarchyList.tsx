import React, { useCallback, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Eye, EyeOff } from 'lucide-react';
import type { GraphLayerState, Note, TagVisibilityLogic } from '../../types';
import { GRAPH_UNTAGGED_TAG_GROUP } from '../../utils/graph/graphRuntimeCore';
import {
  noteBelongsToLayerGroupKey,
  normalizeTagVisibilityLogic,
  sortNotesForLayerPanelDesc,
  truncateRawTextLabel
} from '../../utils/layer/unifiedNoteLayer';
import {
  groupTagsByHierarchyPrefix,
  tagHasHierarchySep,
  tagHierarchySuffix
} from '../../utils/layer/tagHierarchy';

type Props = {
  themeColor: string;
  merged: GraphLayerState;
  onStateChange: (next: GraphLayerState) => void;
  notes: Note[];
  onUpdateNote: (note: Note) => void;
  onActivateNote?: (note: Note) => void;
  tagColorsByKey: Map<string, string[]>;
  onOpenTagColor: (tagKey: string, fromColor: string, anchor: HTMLElement) => void;
  weightOpenKey: string | null;
  setWeightOpenKey: React.Dispatch<React.SetStateAction<string | null>>;
};

/**
 * 标签图层三级：前缀（· 之前）→ 二级后缀（· 之后）→ 节点。
 * 无「 · 」的标签：一级展开后直接到节点。
 */
export const TagLayerHierarchyList: React.FC<Props> = ({
  themeColor,
  merged,
  onStateChange,
  notes,
  onUpdateNote,
  onActivateNote,
  tagColorsByKey,
  onOpenTagColor,
  weightOpenKey,
  setWeightOpenKey
}) => {
  const hiddenSet = useMemo(
    () => new Set((merged.hidden ?? []).map((h) => String(h).trim())),
    [merged.hidden]
  );

  const visibilityLogic = normalizeTagVisibilityLogic(merged.tagVisibilityLogic);

  const hierarchy = useMemo(
    () => groupTagsByHierarchyPrefix(merged.order ?? [], GRAPH_UNTAGGED_TAG_GROUP),
    [merged.order]
  );

  const [expandedPrefix, setExpandedPrefix] = useState<string | null>(null);
  const [expandedTag, setExpandedTag] = useState<string | null>(null);

  const patch = useCallback(
    (fn: (p: GraphLayerState) => GraphLayerState) => {
      onStateChange(fn(merged));
    },
    [merged, onStateChange]
  );

  const setVisibilityLogic = (logic: TagVisibilityLogic) => {
    patch((p) => ({ ...p, tagVisibilityLogic: logic }));
  };

  const toggleHidden = (keys: string[], force?: boolean) => {
    patch((p) => {
      const h = new Set((p.hidden ?? []).map((x) => String(x).trim()));
      const allHidden = keys.every((k) => h.has(k));
      const hide = force ?? !allHidden;
      for (const k of keys) {
        if (hide) h.add(k);
        else h.delete(k);
      }
      return { ...p, hidden: [...h] };
    });
  };

  const prefixColors = (tags: string[]) => {
    const colors: string[] = [];
    const seen = new Set<string>();
    for (const t of tags) {
      for (const c of tagColorsByKey.get(t) ?? []) {
        if (seen.has(c)) continue;
        seen.add(c);
        colors.push(c);
        if (colors.length >= 6) return colors;
      }
    }
    return colors;
  };

  const notesForTag = (tagKey: string) =>
    sortNotesForLayerPanelDesc(notes.filter((n) => noteBelongsToLayerGroupKey(n, tagKey, 'tag')));

  const notesForPrefix = (tags: string[]) => {
    const ids = new Set<string>();
    const out: Note[] = [];
    for (const t of tags) {
      for (const n of notesForTag(t)) {
        if (ids.has(n.id)) continue;
        ids.add(n.id);
        out.push(n);
      }
    }
    return sortNotesForLayerPanelDesc(out);
  };

  const renderNotes = (tagKey: string) => {
    const panelNotes = notesForTag(tagKey);
    return (
      <div className="border-t border-gray-100/90 pb-1 pl-1 pr-1 pt-0.5">
        {panelNotes.length === 0 ? (
          <div className="px-2 py-1 text-[10px] text-gray-400">无便签</div>
        ) : (
          panelNotes.map((note) => {
            const nVisible = !note.layerItemHidden;
            return (
              <div
                key={note.id}
                className="flex items-center gap-1 rounded-md border border-transparent px-1 py-0.5 bg-gray-100/90"
              >
                <div className="shrink-0 w-3.5" aria-hidden />
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-xs text-gray-500 hover:text-gray-700"
                  title={note.text || ''}
                  onClick={() => onActivateNote?.(note)}
                >
                  {truncateRawTextLabel(note.text || '')}
                </button>
                <button
                  type="button"
                  className="shrink-0 rounded-md p-1 text-gray-500 hover:bg-gray-100"
                  aria-label={nVisible ? '隐藏节点' : '显示节点'}
                  onClick={() => onUpdateNote({ ...note, layerItemHidden: !note.layerItemHidden })}
                >
                  {nVisible ? <Eye size={16} strokeWidth={2} /> : <EyeOff size={16} strokeWidth={2} />}
                </button>
              </div>
            );
          })
        )}
      </div>
    );
  };

  const renderTagRow = (k: string, opts: { nested?: boolean }) => {
    const visible = !hiddenSet.has(k);
    const weightOpen = weightOpenKey === k;
    const expanded = expandedTag === k;
    const groupNotes = notesForTag(k);
    const fullLabel = k === GRAPH_UNTAGGED_TAG_GROUP ? '无标签' : k;
    const displayLabel =
      opts.nested && k !== GRAPH_UNTAGGED_TAG_GROUP ? tagHierarchySuffix(k) : fullLabel;

    return (
      <div key={k} className={opts.nested ? 'ml-3 border-l border-gray-100 pl-1' : undefined}>
        <div className="flex items-center gap-1 px-2 py-1">
          <button
            type="button"
            className="shrink-0 rounded-md p-0.5 text-gray-500 hover:bg-gray-100"
            aria-expanded={expanded}
            onClick={() => setExpandedTag((prev) => (prev === k ? null : k))}
          >
            {expanded ? <ChevronDown size={16} strokeWidth={2} /> : <ChevronRight size={16} strokeWidth={2} />}
          </button>
          <div className="flex flex-shrink-0 items-center gap-1 pr-0.5">
            {(tagColorsByKey.get(k) ?? []).slice(0, 6).map((c) => (
              <button
                key={`${k}:${c}`}
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenTagColor(k, c, e.currentTarget);
                }}
                className="h-3 w-3 rounded-full border border-white/90 shadow-sm transition-transform hover:scale-110"
                style={{ backgroundColor: c }}
                title={`点击切换颜色：${c}`}
              />
            ))}
          </div>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800" title={fullLabel}>
            {displayLabel}
          </span>
          <span className="shrink-0 text-[10px] text-gray-400">{groupNotes.length}</span>
          <button
            type="button"
            className="shrink-0 rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
            aria-label={visible ? '隐藏标签' : '显示标签'}
            onClick={() => toggleHidden([k])}
          >
            {visible ? <Eye size={16} strokeWidth={2} /> : <EyeOff size={16} strokeWidth={2} />}
          </button>
          <button
            type="button"
            className={`shrink-0 rounded-md p-1.5 hover:bg-gray-100 ${
              weightOpen ? 'text-gray-900' : 'text-gray-500'
            }`}
            style={weightOpen ? { color: themeColor } : undefined}
            aria-label={weightOpen ? '关闭权重面板' : '调节半径权重'}
            title="标签分组半径权重"
            onClick={() => setWeightOpenKey((prev) => (prev === k ? null : k))}
          >
            {weightOpen ? <ChevronLeft size={16} strokeWidth={2} /> : <ChevronRight size={16} strokeWidth={2} />}
          </button>
        </div>
        {expanded ? renderNotes(k) : null}
      </div>
    );
  };

  return (
    <>
      <div className="flex items-center justify-between gap-2 px-2 pb-1 pt-0.5">
        <span className="text-[10px] font-medium text-gray-400">多标签显隐</span>
        <div
          className="inline-flex shrink-0 items-center rounded-full border border-gray-200/90 bg-gray-100/80 p-0.5"
          role="group"
          aria-label="标签显隐逻辑"
        >
          {(
            [
              { id: 'and' as const, title: '且：任一标签隐藏则隐藏节点' },
              { id: 'or' as const, title: '或：任一标签显示则显示节点' }
            ] as const
          ).map(({ id, title }) => {
            const active = visibilityLogic === id;
            return (
              <button
                key={id}
                type="button"
                title={title}
                aria-label={title}
                aria-pressed={active}
                onClick={() => setVisibilityLogic(id)}
                className={`min-w-[2.25rem] rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide transition-colors ${
                  active ? 'text-theme-chrome-fg shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
                style={active ? { backgroundColor: themeColor } : undefined}
              >
                {id === 'and' ? 'AND' : 'OR'}
              </button>
            );
          })}
        </div>
      </div>

      {hierarchy.map(({ prefix, tags }) => {
        const leafOnly = tags.length === 1 && !tagHasHierarchySep(tags[0]);
        const prefixKey = `p:${prefix}`;
        const prefixOpen = expandedPrefix === prefixKey;
        const pNotes = notesForPrefix(tags);
        const allHidden = tags.every((t) => hiddenSet.has(t));
        const colors = leafOnly ? prefixColors(tags) : [];
        const prefixLabel = prefix === GRAPH_UNTAGGED_TAG_GROUP ? '无标签' : prefix;

        return (
          <div key={prefixKey} className="flex flex-col rounded-lg">
            <div className="flex items-center gap-1 px-2 py-1">
              <button
                type="button"
                className="shrink-0 rounded-md p-0.5 text-gray-500 hover:bg-gray-100"
                aria-expanded={prefixOpen}
                onClick={() => {
                  setExpandedPrefix((prev) => (prev === prefixKey ? null : prefixKey));
                }}
              >
                {prefixOpen ? (
                  <ChevronDown size={18} strokeWidth={2} />
                ) : (
                  <ChevronRight size={18} strokeWidth={2} />
                )}
              </button>
              {leafOnly ? (
                <div className="flex flex-shrink-0 items-center gap-1 pr-0.5">
                  {colors.map((c) => (
                    <span
                      key={`${prefix}:${c}`}
                      className="h-3 w-3 rounded-full border border-white/90 shadow-sm"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              ) : null}
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800" title={prefixLabel}>
                {prefixLabel}
              </span>
              <span className="shrink-0 text-[10px] text-gray-400">{pNotes.length}</span>
              <button
                type="button"
                className="shrink-0 rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
                aria-label={allHidden ? '显示该组标签' : '隐藏该组标签'}
                onClick={() => toggleHidden(tags)}
              >
                {allHidden ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
              </button>
              {leafOnly ? (
                <button
                  type="button"
                  className={`shrink-0 rounded-md p-1.5 hover:bg-gray-100 ${
                    weightOpenKey === tags[0] ? 'text-gray-900' : 'text-gray-500'
                  }`}
                  style={weightOpenKey === tags[0] ? { color: themeColor } : undefined}
                  aria-label={weightOpenKey === tags[0] ? '关闭权重面板' : '调节半径权重'}
                  title="标签分组半径权重"
                  onClick={() => setWeightOpenKey((prev) => (prev === tags[0] ? null : tags[0]))}
                >
                  {weightOpenKey === tags[0] ? (
                    <ChevronLeft size={18} strokeWidth={2} />
                  ) : (
                    <ChevronRight size={18} strokeWidth={2} />
                  )}
                </button>
              ) : null}
            </div>

            {prefixOpen && leafOnly ? renderNotes(tags[0]) : null}

            {prefixOpen && !leafOnly
              ? tags.map((t) => renderTagRow(t, { nested: true }))
              : null}
          </div>
        );
      })}
    </>
  );
};

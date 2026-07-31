import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Reorder } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import type { Tag } from '../../types';
import { THEME_COLOR } from '../../constants';
import { TagChip } from '../ui/TagChip';
import { TagAddPanel } from '../ui/TagAddPanel';

interface TagPropertyEditorProps {
  tags: Tag[];
  editingTagId: string | null;
  isAddingTag: boolean;
  newTagLabel: string;
  newTagColor: string;
  setNewTagLabel: (v: string) => void;
  setNewTagColor: (v: string) => void;
  onEditTag: (tag: Tag) => void;
  onRemoveTag: (id: string) => void;
  onReorderTags: (next: Tag[]) => void;
  onSaveTag: () => void;
  onCancelTagEdit: () => void;
  onStartAddTag: () => void;
  onDismissOverlays?: () => void;
  trailingSlot?: React.ReactNode;
  showDelete?: boolean;
  onDeleteNote?: () => void;
  themeColor?: string;
  panelChromeStyle?: React.CSSProperties;
}

/** tags Property 的编辑 UI（Registry component: TagEditor） */
export const TagPropertyEditor: React.FC<TagPropertyEditorProps> = ({
  tags,
  editingTagId,
  isAddingTag,
  newTagLabel,
  newTagColor,
  setNewTagLabel,
  setNewTagColor,
  onEditTag,
  onRemoveTag,
  onReorderTags,
  onSaveTag,
  onCancelTagEdit,
  onStartAddTag,
  onDismissOverlays,
  trailingSlot,
  showDelete,
  onDeleteNote,
  themeColor = THEME_COLOR,
  panelChromeStyle
}) => {
  const dismiss = onDismissOverlays ?? (() => {});
  const tagPanelAnchorRef = useRef<HTMLDivElement>(null);
  const [tagPanelPos, setTagPanelPos] = useState<{ top: number; left: number } | null>(null);

  const TAG_PANEL_EST_W = 260;
  const TAG_PANEL_EST_H = 220;
  const updateTagPanelPlacement = useCallback(() => {
    const el = tagPanelAnchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 8;
    let top = r.bottom + gap;
    const spaceBelow = window.innerHeight - r.bottom;
    if (spaceBelow < TAG_PANEL_EST_H && r.top > TAG_PANEL_EST_H + gap) {
      top = r.top - TAG_PANEL_EST_H - gap;
    }
    let left = r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - TAG_PANEL_EST_W - 8));
    setTagPanelPos({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!isAddingTag && !editingTagId) {
      setTagPanelPos(null);
      return;
    }
    updateTagPanelPlacement();
  }, [isAddingTag, editingTagId, tags.length, updateTagPanelPlacement]);

  useEffect(() => {
    if (!isAddingTag && !editingTagId) return;
    const onReposition = () => updateTagPanelPlacement();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [isAddingTag, editingTagId, updateTagPanelPlacement]);

  return (
    <div className="px-4 pt-0 pb-2 flex flex-col gap-2 min-h-[52px]">
      <div ref={tagPanelAnchorRef} className="flex gap-2 items-center">
        <div className="flex flex-1 min-w-0 gap-2 overflow-x-auto scrollbar-hide items-center touch-none">
          {editingTagId ? (
            tags
              .filter((t) => t.id !== editingTagId)
              .map((tag) => (
                <TagChip
                  key={tag.id}
                  label={tag.label}
                  color={tag.color}
                  onClick={() => {
                    dismiss();
                    onEditTag(tag);
                  }}
                  onRemove={() => {
                    dismiss();
                    onRemoveTag(tag.id);
                  }}
                />
              ))
          ) : tags.length > 1 ? (
            <Reorder.Group
              axis="x"
              values={tags}
              onReorder={onReorderTags}
              as="div"
              style={{
                display: 'flex',
                flexDirection: 'row',
                flexWrap: 'nowrap',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              {tags.map((tag) => (
                <Reorder.Item
                  key={tag.id}
                  value={tag}
                  className="flex-shrink-0 list-none"
                  layout="position"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  whileDrag={{
                    scale: 1.04,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                    zIndex: 20,
                    cursor: 'grabbing'
                  }}
                  style={{ cursor: 'grab' }}
                >
                  <TagChip
                    label={tag.label}
                    color={tag.color}
                    className="cursor-grab active:cursor-grabbing"
                    onClick={() => {
                      dismiss();
                      onEditTag(tag);
                    }}
                    onRemove={() => {
                      dismiss();
                      onRemoveTag(tag.id);
                    }}
                  />
                </Reorder.Item>
              ))}
            </Reorder.Group>
          ) : (
            tags.map((tag) => (
              <TagChip
                key={tag.id}
                label={tag.label}
                color={tag.color}
                onClick={() => {
                  dismiss();
                  onEditTag(tag);
                }}
                onRemove={() => {
                  dismiss();
                  onRemoveTag(tag.id);
                }}
              />
            ))
          )}

          {isAddingTag || editingTagId ? null : (
            <button
              type="button"
              onClick={() => {
                dismiss();
                onStartAddTag();
              }}
              className="flex-shrink-0 h-9 min-h-9 px-3.5 rounded-full text-xs font-semibold text-gray-400 hover:text-gray-600 hover:bg-black/5 active:scale-95 transition-colors inline-flex items-center justify-center cursor-pointer"
            >
              + Tag
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {trailingSlot}
          {showDelete && onDeleteNote ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                dismiss();
                onDeleteNote();
              }}
              className="shrink-0 rounded-full p-2 min-h-9 min-w-9 inline-flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 active:scale-95 transition-colors border-0 cursor-pointer"
              title="删除便签"
            >
              <Trash2 size={20} strokeWidth={2} />
            </button>
          ) : null}
        </div>
      </div>

      {(isAddingTag || editingTagId) && tagPanelPos != null && (
        <TagAddPanel
          themeColor={themeColor}
          panelChromeStyle={panelChromeStyle}
          title={editingTagId ? '编辑标签' : '添加标签'}
          label={newTagLabel}
          onLabelChange={setNewTagLabel}
          selectedColor={newTagColor}
          onColorChange={setNewTagColor}
          onApply={onSaveTag}
          onDismissOutside={onSaveTag}
          portalPlacement={tagPanelPos}
          autoFocus
          onInputKeyDown={(e) => {
            if (e.key === 'Enter') onSaveTag();
            if (e.key === 'Escape') onCancelTagEdit();
          }}
        />
      )}
    </div>
  );
};

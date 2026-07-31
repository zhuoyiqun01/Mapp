import React from 'react';
import type { Tag } from '../../types';
import { NoteTimeRangeControl } from './NoteTimeRangeControl';
import { TagPropertyEditor } from './TagPropertyEditor';

interface PropertySectionProps {
  startYear?: number;
  endYear?: number;
  onTimeChange: (next: { startYear?: number; endYear?: number }) => void;
  themeColor: string;
  panelChromeStyle?: React.CSSProperties;
  active: boolean;
  onProvideTimeDismiss?: (dismiss: () => void) => void;

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

  /** emoji 等附加操作 */
  trailingSlot?: React.ReactNode;
  showDelete?: boolean;
  onDeleteNote?: () => void;
}

/** Properties：emoji / tags / time（经 Registry 语义；组件复用现有控件） */
export const PropertySection: React.FC<PropertySectionProps> = ({
  startYear,
  endYear,
  onTimeChange,
  themeColor,
  panelChromeStyle,
  active,
  onProvideTimeDismiss,
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
  onDeleteNote
}) => (
  <section className="flex flex-col shrink-0 border-t border-gray-100/80" aria-label="属性">
    <div className="px-4 pt-2 pb-1 flex items-center justify-between gap-2">
      <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">属性</span>
      <NoteTimeRangeControl
        startYear={startYear}
        endYear={endYear}
        onChange={onTimeChange}
        themeColor={themeColor}
        panelChromeStyle={panelChromeStyle}
        active={active}
        onProvideDismiss={onProvideTimeDismiss}
      />
    </div>
    <TagPropertyEditor
      tags={tags}
      editingTagId={editingTagId}
      isAddingTag={isAddingTag}
      newTagLabel={newTagLabel}
      newTagColor={newTagColor}
      setNewTagLabel={setNewTagLabel}
      setNewTagColor={setNewTagColor}
      onEditTag={onEditTag}
      onRemoveTag={onRemoveTag}
      onReorderTags={onReorderTags}
      onSaveTag={onSaveTag}
      onCancelTagEdit={onCancelTagEdit}
      onStartAddTag={onStartAddTag}
      onDismissOverlays={onDismissOverlays}
      themeColor={themeColor}
      panelChromeStyle={panelChromeStyle}
      trailingSlot={trailingSlot}
      showDelete={showDelete}
      onDeleteNote={onDeleteNote}
    />
  </section>
);

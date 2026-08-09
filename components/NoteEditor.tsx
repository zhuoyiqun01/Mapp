import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Note, Tag } from '../types';
import { THEME_COLOR } from '../constants';
import { generateId, parseNoteContent } from '../utils';
import { buildEditorModel, fromEditorModel } from '../utils/note/editorModel';
import { DrawingCanvas } from './DrawingCanvas';
import { motion } from 'framer-motion';
import { useTiptapEditor } from './hooks/useTiptapEditor';
import { useNoteState } from './hooks/useNoteState';
import { useMediaHandler } from './hooks/useMediaHandler';
import { NoteHeader } from './note-editor/NoteHeader';
import { ImagePreviewModal } from './note-editor/ImagePreviewModal';
import { ContentSection } from './note-editor/ContentSection';
import { PropertySection } from './note-editor/PropertySection';
import { MediaSection } from './note-editor/MediaSection';
import { MetadataSection } from './note-editor/MetadataSection';
import { Camera, PenTool, Minus, Smile } from 'lucide-react';
import { EmojiPicker } from './note-editor/EmojiPicker';
import {
  NOTE_EDITOR_ADD_PILL_ACTIVE,
  NOTE_EDITOR_ADD_PILL_CLASS,
  NOTE_EDITOR_ADD_PILL_IDLE,
  NoteEditorAddPillLabel
} from './note-editor/addPillStyles';
import { DeleteConfirmDialog } from './ui/DeleteConfirmDialog';
import { MODAL_BACKDROP_MASK_STYLE } from '../utils/map/mapChromeStyle';
import {
  hasNavigableGpsCoords
} from '../utils/map/openExternalNavigation';
import { ExternalNavigationSheet } from './map/overlays/ExternalNavigationSheet';

interface NoteEditorProps {
  initialNote?: Partial<Note>;
  isOpen: boolean;
  onClose: () => void;
  onSave: (note: Partial<Note>) => void;
  onDelete?: (noteId: string) => void;
  onSwitchToMapView?: (coords?: { lat: number; lng: number }) => void;
  onSwitchToBoardView?: (coords?: { x: number; y: number }, mapInstance?: any) => void;
  /** Graph 项目：关闭编辑器并在图谱中聚焦该便签 */
  onSwitchToGraphView?: (noteId: string) => void;
  themeColor?: string;
  /** 与全局「界面外观」一致：主面板及内嵌白底控件玻璃化 */
  panelChromeStyle?: React.CSSProperties;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({
  initialNote,
  isOpen,
  onClose,
  onSave,
  onDelete,
  onSwitchToMapView,
  onSwitchToBoardView,
  onSwitchToGraphView,
  themeColor = THEME_COLOR,
  panelChromeStyle
}) => {
  const MotionDiv = (motion.div as unknown) as React.ComponentType<any>;
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [navSheetOpen, setNavSheetOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [startYear, setStartYear] = useState<number | undefined>(initialNote?.startYear);
  const [endYear, setEndYear] = useState<number | undefined>(initialNote?.endYear);
  const dismissTimeRangePanelRef = useRef<() => void>(() => {});

  const {
    isCompactMode,
    noteState,
    setEmoji,
    setText,
    setIsFavorite,
    setTags,
    setIsPreviewMode,
    setIsAddingTag,
    setEditingTagId,
    setNewTagLabel,
    setNewTagColor
  } = useNoteState({ initialNote, isOpen });

  const {
    emoji,
    text,
    isFavorite,
    tags,
    isPreviewMode,
    isAddingTag,
    editingTagId,
    newTagLabel,
    newTagColor
  } = noteState;

  useEffect(() => {
    if (!isOpen) return;
    setStartYear(initialNote?.startYear);
    setEndYear(initialNote?.endYear);
  }, [initialNote?.id, isOpen]);

  const { editor } = useTiptapEditor({
    noteId: initialNote?.id,
    content: text,
    onMarkdownChange: setText
  });

  const color = '#FFFFFF';

  const {
    images,
    setImages,
    sketch,
    setSketch,
    isProcessingImages,
    handleImageUpload,
    handlePaste,
    handleDropImages,
    removeImage,
    removeSketch,
    previewImage,
    setPreviewImage,
    previewImageIndex,
    setPreviewImageIndex
  } = useMediaHandler({ initialNote, isOpen, text, setText, textareaRef });

  const [isSketching, setIsSketching] = useState(false);

  const updateCursorPosition = useCallback(() => {
    if (!textareaRef.current) return;
  }, []);

  const emojiAnchorRef = useRef<HTMLButtonElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dismissOverlays = useCallback(() => {
    setShowEmojiPicker(false);
    dismissTimeRangePanelRef.current();
  }, []);

  const dismissOverlaysExceptTime = useCallback(() => {
    setShowEmojiPicker(false);
    setIsAddingTag(false);
    setEditingTagId(null);
    setNewTagLabel('');
  }, [setIsAddingTag, setEditingTagId, setNewTagLabel]);

  const registerTimeRangeDismiss = useCallback((fn: () => void) => {
    dismissTimeRangePanelRef.current = fn;
  }, []);

  const openEmojiPicker = useCallback(() => {
    setIsAddingTag(false);
    setEditingTagId(null);
    setNewTagLabel('');
    dismissTimeRangePanelRef.current();
    setShowEmojiPicker((open) => !open);
  }, [setIsAddingTag, setEditingTagId, setNewTagLabel]);

  const handleSaveTag = () => {
    if (newTagLabel.trim()) {
      if (editingTagId) {
        setTags(tags.map((t) => (t.id === editingTagId ? { ...t, label: newTagLabel.trim(), color: newTagColor } : t)));
        setEditingTagId(null);
      } else {
        const newTag: Tag = {
          id: generateId(),
          label: newTagLabel.trim(),
          color: newTagColor
        };
        setTags([...tags, newTag]);
      }
      setNewTagLabel('');
      setIsAddingTag(false);
    } else {
      setNewTagLabel('');
      setIsAddingTag(false);
      setEditingTagId(null);
    }
  };

  const handleEditTag = (tag: Tag) => {
    setEditingTagId(tag.id);
    setNewTagLabel(tag.label);
    setNewTagColor(tag.color);
    setIsAddingTag(false);
  };

  const handleCancelTagEdit = () => {
    setNewTagLabel('');
    setIsAddingTag(false);
    setEditingTagId(null);
  };

  const removeTag = (id: string) => {
    setTags(tags.filter((t) => t.id !== id));
  };

  const displayTitle = useMemo(() => parseNoteContent(text || '').title || undefined, [text]);

  const getCurrentNoteData = (): Partial<Note> => {
    const model = buildEditorModel({
      text,
      emoji: isCompactMode ? '' : emoji,
      tags: isCompactMode ? [] : tags,
      startYear,
      endYear,
      images: images || [],
      sketch: sketch === '' ? undefined : sketch,
      id: initialNote?.id,
      createdAt: initialNote?.createdAt
    });

    return fromEditorModel(model, {
      coords: initialNote?.coords,
      boardX: initialNote?.boardX,
      boardY: initialNote?.boardY,
      groupId: initialNote?.groupId,
      groupName: initialNote?.groupName,
      groupIds: initialNote?.groupIds,
      groupNames: initialNote?.groupNames,
      variant: initialNote?.variant,
      imageWidth: initialNote?.imageWidth,
      imageHeight: initialNote?.imageHeight,
      noteGroupId: initialNote?.noteGroupId,
      isFavorite,
      fontSize: 3,
      isBold: false,
      color: '#FFFFFF'
    });
  };

  const isEmptyNote = (noteData: Partial<Note>): boolean => {
    const hasText = noteData.text && noteData.text.trim().length > 0;
    const hasEmoji = !isCompactMode && noteData.emoji && noteData.emoji.length > 0;
    const hasImages = noteData.images && noteData.images.length > 0;
    const hasSketch = noteData.sketch && noteData.sketch.length > 0;
    const hasTags = !isCompactMode && noteData.tags && noteData.tags.length > 0;
    const hasTime = noteData.startYear != null || noteData.endYear != null;
    return !hasText && !hasEmoji && !hasImages && !hasSketch && !hasTags && !hasTime;
  };

  const handleSave = () => {
    const noteData = getCurrentNoteData();

    if (!noteData.images) {
      noteData.images = images || [];
    }

    if (isEmptyNote(noteData) && initialNote?.id && onDelete) {
      onDelete(initialNote.id);
      onClose();
      return;
    }

    if (isEmptyNote(noteData) && !initialNote?.id) {
      onClose();
      return;
    }

    onSave(noteData);

    setTimeout(() => {
      onClose();
    }, 0);
  };

  const deleteTitleHint = useMemo(
    () => parseNoteContent(initialNote?.text || '').title || '无标题',
    [initialNote?.id, initialNote?.text]
  );

  const openDeleteConfirm = () => {
    dismissOverlays();
    setDeleteConfirmOpen(true);
  };

  const executeDeleteNote = async () => {
    if (!initialNote?.id || !onDelete) return;
    setDeleteConfirming(true);
    try {
      await Promise.resolve(onDelete(initialNote.id));
      setDeleteConfirmOpen(false);
      onClose();
    } finally {
      setDeleteConfirming(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setDeleteConfirmOpen(false);
      setDeleteConfirming(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const emojiTrailingSlot = !isCompactMode ? (
    <div className="relative group">
      <button
        ref={emojiAnchorRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openEmojiPicker();
        }}
        className={`${NOTE_EDITOR_ADD_PILL_CLASS} ${
          showEmojiPicker || emoji ? NOTE_EDITOR_ADD_PILL_ACTIVE : NOTE_EDITOR_ADD_PILL_IDLE
        }`}
        title={emoji ? '更换表情' : '添加表情'}
        aria-expanded={showEmojiPicker}
      >
        {emoji ? (
          <span className="text-[1.05rem] leading-none select-none" role="img" aria-label="当前表情">
            {emoji}
          </span>
        ) : (
          <>
            <NoteEditorAddPillLabel expanded={showEmojiPicker}>+ Emoji</NoteEditorAddPillLabel>
            <Smile size={14} strokeWidth={2} className="shrink-0" aria-hidden />
          </>
        )}
      </button>
      {emoji ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setEmoji('');
            setShowEmojiPicker(false);
          }}
          className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 border-0 cursor-pointer shadow-sm hover:bg-red-600"
          title="清除表情"
        >
          <Minus size={11} strokeWidth={2.5} />
        </button>
      ) : null}
      <EmojiPicker
        isOpen={showEmojiPicker}
        anchorRef={emojiAnchorRef}
        onClose={() => setShowEmojiPicker(false)}
        onSelectEmoji={(e) => setEmoji(e)}
        panelChromeStyle={panelChromeStyle}
      />
    </div>
  ) : null;

  const mediaActionsSlot = !isCompactMode ? (
    <div className="flex items-center gap-1 shrink-0">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="hidden"
        onChange={(e) => {
          dismissOverlays();
          handleImageUpload(e);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => {
          dismissOverlays();
          fileInputRef.current?.click();
        }}
        className={`${NOTE_EDITOR_ADD_PILL_CLASS} ${NOTE_EDITOR_ADD_PILL_IDLE}`}
        title="添加图片"
      >
        <NoteEditorAddPillLabel>+ 图片</NoteEditorAddPillLabel>
        <Camera size={14} strokeWidth={2} className="shrink-0" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => {
          dismissOverlays();
          setIsSketching(true);
        }}
        className={`${NOTE_EDITOR_ADD_PILL_CLASS} ${NOTE_EDITOR_ADD_PILL_IDLE}`}
        title="添加涂鸦"
      >
        <NoteEditorAddPillLabel>+ 涂鸦</NoteEditorAddPillLabel>
        <PenTool size={14} strokeWidth={2} className="shrink-0" aria-hidden />
      </button>
    </div>
  ) : null;

  return (
    <div
      className="fixed top-0 ui-workspace-overlay h-[100dvh] max-h-dvh z-[1000] flex items-center justify-center p-4 touch-none cursor-auto"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onDragOver={(e) => e.stopPropagation()}
      onDragEnter={(e) => e.stopPropagation()}
      onDragLeave={(e) => e.stopPropagation()}
      onDrop={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-0" onClick={handleSave} style={{ zIndex: 1 }}></div>

      <div
        className="absolute inset-0 pointer-events-none"
        style={{ ...MODAL_BACKDROP_MASK_STYLE, zIndex: 5 }}
      />

      <div className="relative z-10 flex flex-col items-end">
        <MotionDiv
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className={`w-[500px] max-w-[min(95%,calc(100%-2rem))] flex flex-col relative transition-colors duration-300 max-h-[90vh] max-h-[90dvh] min-h-[300px] rounded-2xl border border-gray-100/80 ${panelChromeStyle ? '' : 'bg-white'} ${isSketching ? 'min-h-[500px]' : ''}`}
          style={{
            ...(panelChromeStyle || {}),
            boxShadow: '0 25px 50px 12px rgba(0, 0, 0, 0.15)',
            overflow: 'hidden'
          }}
          onDragOver={(e) => e.stopPropagation()}
          onDragEnter={(e) => e.stopPropagation()}
          onDragLeave={(e) => e.stopPropagation()}
          onDrop={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {isSketching && (
            <div className="absolute inset-0 z-50" onPointerDown={(e) => e.stopPropagation()}>
              <DrawingCanvas
                initialData={sketch}
                backgroundColor={color}
                onSave={(data) => {
                  setSketch(data === '' ? undefined : data);
                  setIsSketching(false);
                }}
                onCancel={() => setIsSketching(false)}
              />
            </div>
          )}

          <div className={`flex flex-col flex-1 h-full min-h-0 ${isSketching ? 'invisible' : ''}`} style={{ zIndex: 10 }}>
            <NoteHeader
              themeColor={themeColor}
              panelChromeStyle={panelChromeStyle}
              isPreviewMode={isPreviewMode}
              onSetPreviewMode={(preview) => {
                dismissOverlays();
                setIsPreviewMode(preview);
              }}
              isFavorite={isFavorite}
              onToggleFavorite={() => {
                dismissOverlays();
                setIsFavorite(!isFavorite);
              }}
              showUpgrade={false}
              onUpgrade={() => {}}
              showLocateBoard={
                !!(
                  initialNote?.boardX !== undefined &&
                  initialNote?.boardY !== undefined &&
                  onSwitchToBoardView
                )
              }
              onLocateBoard={() => {
                dismissOverlays();
                const noteWidth = initialNote!.variant === 'image' ? initialNote!.imageWidth || 256 : 256;
                const noteHeight = initialNote!.variant === 'image' ? initialNote!.imageHeight || 256 : 256;
                const centerX = initialNote!.boardX! + noteWidth / 2;
                const centerY = initialNote!.boardY! + noteHeight / 2;
                onSwitchToBoardView?.({ x: centerX, y: centerY });
              }}
              showLocateMap={
                !!(initialNote?.coords && initialNote.coords.lat !== 0 && initialNote.coords.lng !== 0 && onSwitchToMapView)
              }
              onLocateMap={() => {
                dismissOverlays();
                onSwitchToMapView?.(initialNote!.coords);
              }}
              showNavigateGo={hasNavigableGpsCoords(initialNote?.coords)}
              onNavigateGo={() => {
                if (!hasNavigableGpsCoords(initialNote?.coords)) return;
                setNavSheetOpen(true);
              }}
              showLocateGraph={!!(initialNote?.id && onSwitchToGraphView)}
              onLocateGraph={() => {
                if (!initialNote?.id) return;
                dismissOverlays();
                onSwitchToGraphView(initialNote.id);
              }}
              onSave={() => {
                dismissOverlays();
                handleSave();
              }}
              centerSlot={null}
            />

            {isProcessingImages && (
              <div className="px-4 py-2 text-sm text-blue-700 bg-blue-50/90 border border-blue-200/80 rounded-xl flex items-center gap-2 mx-4">
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
                正在处理图片…
              </div>
            )}

            <ContentSection
              displayTitle={displayTitle}
              isPreviewMode={isPreviewMode}
              text={text}
              onTextChange={setText}
              onPaste={handlePaste}
              onDropImages={handleDropImages}
              isProcessingImages={isProcessingImages}
              textareaRef={textareaRef}
              updateCursorPosition={updateCursorPosition}
              editor={editor}
              themeColor={themeColor}
            />

            {!isCompactMode && (
              <PropertySection
                startYear={startYear}
                endYear={endYear}
                onTimeChange={(next) => {
                  setStartYear(next.startYear);
                  setEndYear(next.endYear);
                }}
                themeColor={themeColor}
                panelChromeStyle={panelChromeStyle}
                active={isOpen}
                onProvideTimeDismiss={registerTimeRangeDismiss}
                tags={tags}
                editingTagId={editingTagId}
                isAddingTag={isAddingTag}
                newTagLabel={newTagLabel}
                newTagColor={newTagColor}
                setNewTagLabel={setNewTagLabel}
                setNewTagColor={setNewTagColor}
                onEditTag={handleEditTag}
                onRemoveTag={removeTag}
                onReorderTags={setTags}
                onSaveTag={handleSaveTag}
                onCancelTagEdit={handleCancelTagEdit}
                onStartAddTag={() => setIsAddingTag(true)}
                onDismissOverlays={dismissOverlays}
                onBeforeOpenTime={dismissOverlaysExceptTime}
                trailingSlot={emojiTrailingSlot}
              />
            )}

            {!isCompactMode && (
              <MediaSection
                images={images}
                onPreviewImage={(index) => {
                  dismissOverlays();
                  setPreviewImageIndex(index);
                  setPreviewImage(images[index] || null);
                }}
                onRemoveImage={(index) => {
                  dismissOverlays();
                  removeImage(index);
                }}
                sketch={sketch}
                onOpenSketch={() => {
                  dismissOverlays();
                  setIsSketching(true);
                }}
                onRemoveSketch={() => {
                  dismissOverlays();
                  removeSketch();
                }}
                onDismissOverlays={dismissOverlays}
                moreActionsSlot={mediaActionsSlot}
              />
            )}

            <MetadataSection
              id={initialNote?.id}
              createdAt={initialNote?.createdAt}
              showDelete={!!(initialNote?.id && onDelete)}
              onDeleteNote={
                initialNote?.id && onDelete
                  ? () => {
                      dismissOverlays();
                      openDeleteConfirm();
                    }
                  : undefined
              }
              onDismissOverlays={dismissOverlays}
            />
          </div>
        </MotionDiv>
      </div>

      <ImagePreviewModal
        images={images}
        previewIndex={previewImageIndex}
        isOpen={!!previewImage && images.length > 0}
        onClose={() => setPreviewImage(null)}
        onChangeIndex={(idx) => {
          setPreviewImageIndex(idx);
          setPreviewImage(images[idx] || null);
        }}
      />

      <DeleteConfirmDialog
        open={deleteConfirmOpen}
        variant="note"
        titleHint={deleteTitleHint}
        confirming={deleteConfirming}
        onCancel={() => !deleteConfirming && setDeleteConfirmOpen(false)}
        onConfirm={executeDeleteNote}
        themeColor={themeColor}
        panelChromeStyle={panelChromeStyle}
      />
      {hasNavigableGpsCoords(initialNote?.coords) && initialNote?.coords ? (
        <ExternalNavigationSheet
          open={navSheetOpen}
          lat={initialNote.coords.lat}
          lng={initialNote.coords.lng}
          label={parseNoteContent(initialNote?.text || '').title || undefined}
          onClose={() => setNavSheetOpen(false)}
          themeColor={themeColor}
        />
      ) : null}
    </div>
  );
};

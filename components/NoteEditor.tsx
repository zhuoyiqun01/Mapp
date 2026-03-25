
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Note, Tag } from '../types';
import { THEME_COLOR } from '../constants';
import { createTag, generateId, parseNoteContent } from '../utils';
import { DrawingCanvas } from './DrawingCanvas';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { useTiptapEditor } from './hooks/useTiptapEditor';
import { useNoteState } from './hooks/useNoteState';
import { useMediaHandler } from './hooks/useMediaHandler';
import { NoteHeader } from './note-editor/NoteHeader';
import { NoteTimeRangeControl } from './note-editor/NoteTimeRangeControl';
import { ImagePreviewModal } from './note-editor/ImagePreviewModal';
import { EditorArea } from './note-editor/EditorArea';
import { MediaGallery } from './note-editor/MediaGallery';
import { Plus, Smile, Camera, PenTool, Minus } from 'lucide-react';
import { EmojiPicker } from './note-editor/EmojiPicker';
import { DeleteConfirmDialog } from './ui/DeleteConfirmDialog';
import { MODAL_BACKDROP_MASK_STYLE } from '../utils/map/mapChromeStyle';

interface NoteEditorProps {
  initialNote?: Partial<Note>;
  isOpen: boolean;
  onClose: () => void;
  onSave: (note: Partial<Note>) => void;
  onDelete?: (noteId: string) => void;
  onSwitchToMapView?: (coords?: { lat: number; lng: number }) => void;
  onSwitchToBoardView?: (coords?: { x: number; y: number }, mapInstance?: any) => void;
  themeColor?: string;
  /** 与全局「界面外观」一致：主面板及内嵌白底控件玻璃化 */
  panelChromeStyle?: React.CSSProperties;
}

const DEFAULT_BG = '#FFFFFF';

export const NoteEditor: React.FC<NoteEditorProps> = ({ 
  initialNote, 
  isOpen, 
  onClose, 
  onSave, 
  onDelete,
  onSwitchToMapView,
  onSwitchToBoardView,
  themeColor = THEME_COLOR,
  panelChromeStyle
}) => {
  // Work around occasional framer-motion typing issues in TS server
  const MotionDiv = (motion.div as unknown) as React.ComponentType<any>;
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
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
  
  // Initialize TipTap editor for Feishu-like experience
  const { editor } = useTiptapEditor({
    noteId: initialNote?.id,
    content: text,
    onMarkdownChange: setText
  });

  const fontSize = 3;
  const isBold = false;
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

  // Sketch mode state
  const [isSketching, setIsSketching] = useState(false);
  
  const updateCursorPosition = useCallback(() => {
    if (!textareaRef.current) return;
  }, []);

  const emojiAnchorRef = useRef<HTMLDivElement | null>(null);
  const moreMenuButtonRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const moreMenuPortalRef = useRef<HTMLDivElement>(null);
  const [emojiPickerPosition, setEmojiPickerPosition] = useState<{ left: number; top: number } | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [moreMenuPlacement, setMoreMenuPlacement] = useState<{
    right: number;
    top: number;
  } | null>(null);

  const dismissOverlays = useCallback(() => {
    setShowEmojiPicker(false);
    setShowMoreMenu(false);
    setMoreMenuPlacement(null);
    dismissTimeRangePanelRef.current();
  }, []);

  const registerTimeRangeDismiss = useCallback((fn: () => void) => {
    dismissTimeRangePanelRef.current = fn;
  }, []);

  const updateMoreMenuPlacement = useCallback(() => {
    const el = moreMenuButtonRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setMoreMenuPlacement({
      right: window.innerWidth - r.right,
      top: r.bottom + 8
    });
  }, []);

  useLayoutEffect(() => {
    if (!showMoreMenu) return;
    updateMoreMenuPlacement();
  }, [showMoreMenu, updateMoreMenuPlacement]);

  useEffect(() => {
    if (!showMoreMenu) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (moreMenuButtonRef.current?.contains(t)) return;
      if (moreMenuPortalRef.current?.contains(t)) return;
      setShowMoreMenu(false);
      setMoreMenuPlacement(null);
    };
    const onReposition = () => updateMoreMenuPlacement();
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [showMoreMenu, updateMoreMenuPlacement]);

  const openEmojiPicker = useCallback(() => {
    if (emojiAnchorRef.current) {
      const rect = emojiAnchorRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      if (spaceBelow < 400 && spaceAbove > spaceBelow) {
        setEmojiPickerPosition({ left: rect.left, top: rect.top - 200 - 8 });
      } else {
        setEmojiPickerPosition({ left: rect.left, top: rect.bottom + 8 });
      }
    }
    setShowMoreMenu(false);
    setMoreMenuPlacement(null);
    setShowEmojiPicker(true);
  }, []);

  // isCompactMode is managed by useNoteState
  
  // touch handlers moved to useTouchNavigation
  // Note core state & media reset logic moved to useNoteState/useMediaHandler
  
  const handleSaveTag = () => {
    if (newTagLabel.trim()) {
      if (editingTagId) {
        // Update existing tag
        setTags(tags.map(t => t.id === editingTagId ? { ...t, label: newTagLabel.trim(), color: newTagColor } : t));
        setEditingTagId(null);
      } else {
        // Create new tag
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
      // If no text entered, cancel adding/editing
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
    setTags(tags.filter(t => t.id !== id));
  };
  // Media handlers moved to useMediaHandler

  const getCurrentNoteData = (): Partial<Note> => {
    // Don't spread initialNote first - build from scratch to ensure we use current state
    const noteData: Partial<Note> = {
      // Only copy id and other immutable fields from initialNote
      id: initialNote?.id,
      createdAt: initialNote?.createdAt,
      startYear,
      endYear,
      coords: initialNote?.coords,
      boardX: initialNote?.boardX,
      boardY: initialNote?.boardY,
      groupId: initialNote?.groupId,
      groupName: initialNote?.groupName,
      groupIds: initialNote?.groupIds,
      groupNames: initialNote?.groupNames,
      // Use current state for all editable fields
      emoji: isCompactMode ? '' : emoji,
      text,
      fontSize,
      isBold,
      isFavorite,
      color,
      tags: isCompactMode ? [] : tags,
      // Always use current state for images and sketch
      images: images || [],
      sketch: sketch === '' ? undefined : sketch
    };

    // Never auto-set variant based on content

    return noteData;
  };

  const isEmptyNote = (noteData: Partial<Note>): boolean => {
    // Check if note has any content
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

    // Ensure images are always included in the saved data
    if (!noteData.images) {
      noteData.images = images || [];
    }

    // If note is empty and it's a new note (has id but hasn't been saved yet), delete it
    if (isEmptyNote(noteData) && initialNote?.id && onDelete) {
      onDelete(initialNote.id);
      onClose();
      return;
    }

    // If note is empty and has no id, just close without saving
    if (isEmptyNote(noteData) && !initialNote?.id) {
      onClose();
      return;
    }

    // Otherwise, save the note
    onSave(noteData);

    // Delay closing to ensure state updates are processed
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

  const timeCenterSlot = (
    <NoteTimeRangeControl
      startYear={startYear}
      endYear={endYear}
      onChange={(next) => {
        setStartYear(next.startYear);
        setEndYear(next.endYear);
      }}
      themeColor={themeColor}
      panelChromeStyle={panelChromeStyle}
      active={isOpen}
      onProvideDismiss={registerTimeRangeDismiss}
    />
  );

  const moreMenuItemCls =
    'w-full px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2.5 border-0 bg-transparent cursor-pointer rounded-lg mx-0.5';

  const mediaMoreBottomSlot =
    !isCompactMode ? (
      <div className="flex items-center gap-1 shrink-0">
        <div ref={emojiAnchorRef} className="relative group">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowMoreMenu(false);
              setMoreMenuPlacement(null);
              openEmojiPicker();
            }}
            className={`rounded-full p-2 min-h-9 min-w-9 box-border inline-flex items-center justify-center transition-colors active:scale-95 ${
              showEmojiPicker
                ? 'text-gray-700 bg-black/[0.08]'
                : 'text-gray-400 hover:text-gray-600 hover:bg-black/5'
            }`}
            title="表情"
          >
            {emoji ? (
              <span className="text-[1.2rem] leading-none select-none" role="img" aria-label="当前表情">
                {emoji}
              </span>
            ) : (
              <Smile size={20} strokeWidth={2} className="text-gray-400 group-hover:text-gray-600" />
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
        </div>

        <div ref={moreMenuButtonRef} className="relative">
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
              if (showMoreMenu) {
                setShowMoreMenu(false);
                setMoreMenuPlacement(null);
              } else {
                setShowEmojiPicker(false);
                updateMoreMenuPlacement();
                setShowMoreMenu(true);
              }
            }}
            className={`relative rounded-full p-2 min-h-9 min-w-9 box-border inline-flex items-center justify-center transition-colors active:scale-95 ${
              showMoreMenu
                ? 'text-gray-700 bg-black/[0.08]'
                : 'text-gray-400 hover:text-gray-600 hover:bg-black/5'
            }`}
            title="添加图片或涂鸦"
          >
            <Plus size={20} strokeWidth={2} />
          </button>
        </div>

        <EmojiPicker
          isOpen={showEmojiPicker}
          position={emojiPickerPosition}
          onClose={() => setShowEmojiPicker(false)}
          onSelectEmoji={(e) => setEmoji(e)}
        />
      </div>
    ) : null;

  return (
    <div 
      className="fixed left-0 top-0 w-full h-screen h-[100dvh] z-[1000] flex items-center justify-center p-4 touch-none cursor-auto"
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
      
      {/* Blur overlay - full screen mask, behind card z-5 */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{ ...MODAL_BACKDROP_MASK_STYLE, zIndex: 5 }}
      />
      
      <div className="relative z-10 flex flex-col items-end">
      <MotionDiv 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        // Explicit width w-[500px] to prevent auto-growing behavior. min-h-[500px] added when sketching to ensure full canvas.
          className={`w-[500px] max-w-[95vw] flex flex-col relative transition-colors duration-300 max-h-[90vh] max-h-[90dvh] min-h-[300px] rounded-2xl border border-gray-200/80 ${panelChromeStyle ? '' : 'bg-white'} ${isSketching ? 'min-h-[500px]' : ''}`}
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
                  // If data is empty string, set to undefined (empty canvas)
                  setSketch(data === '' ? undefined : data); 
                  setIsSketching(false); 
                }}
                onCancel={() => setIsSketching(false)}
            />
          </div>
        )}
        
        <div className={`flex flex-col flex-1 h-full min-h-0 ${isSketching ? 'invisible' : ''}`} style={{ zIndex: 10 }}>
            {/* Header - middle layer z-10 (inherits from parent) */}
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
                  onSwitchToBoardView &&
                  !onSwitchToMapView
                )
              }
              onLocateBoard={() => {
                dismissOverlays();
                const noteWidth = initialNote!.variant === 'image' ? (initialNote!.imageWidth || 256) : 256;
                const noteHeight = initialNote!.variant === 'image' ? (initialNote!.imageHeight || 256) : 256;
                const centerX = initialNote!.boardX! + noteWidth / 2;
                const centerY = initialNote!.boardY! + noteHeight / 2;
                onSwitchToBoardView?.({ x: centerX, y: centerY });
              }}
              showLocateMap={!!(initialNote?.coords && initialNote.coords.lat !== 0 && initialNote.coords.lng !== 0 && onSwitchToMapView)}
              onLocateMap={() => {
                dismissOverlays();
                onSwitchToMapView?.(initialNote!.coords);
              }}
              onSave={() => {
                dismissOverlays();
                handleSave();
              }}
              centerSlot={timeCenterSlot}
            />

            {/* Image Processing Indicator */}
            {isProcessingImages && (
              <div className="px-4 py-2 text-sm text-blue-700 bg-blue-50/90 border border-blue-200/80 rounded-xl flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
                正在处理图片…
              </div>
            )}

            <EditorArea
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

            <MediaGallery
              isCompactMode={isCompactMode}
              themeColor={themeColor}
              panelChromeStyle={panelChromeStyle}
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
              showDelete={!!(initialNote?.id && onDelete)}
              onDeleteNote={
                initialNote?.id && onDelete
                  ? () => {
                      dismissOverlays();
                      openDeleteConfirm();
                    }
                  : undefined
              }
              moreActionsSlot={mediaMoreBottomSlot}
            />

            {showMoreMenu &&
              moreMenuPlacement &&
              createPortal(
                <div
                  ref={moreMenuPortalRef}
                  className={`min-w-[11rem] rounded-xl border border-gray-200/90 py-1.5 shadow-xl ${panelChromeStyle ? '' : 'bg-white'}`}
                  style={{
                    ...(panelChromeStyle || {}),
                    position: 'fixed',
                    right: moreMenuPlacement.right,
                    top: moreMenuPlacement.top,
                    bottom: 'auto',
                    zIndex: 10002
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => {
                      dismissOverlays();
                      fileInputRef.current?.click();
                    }}
                    className={moreMenuItemCls}
                  >
                    <Camera size={18} className="text-gray-500 shrink-0" />
                    添加图片
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      dismissOverlays();
                      setIsSketching(true);
                    }}
                    className={moreMenuItemCls}
                  >
                    <PenTool size={18} className="text-gray-500 shrink-0" />
                    涂鸦
                  </button>
                </div>,
                document.body
              )}
            
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
    </div>
  );
};

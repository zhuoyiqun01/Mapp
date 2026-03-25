
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
import { ImagePreviewModal } from './note-editor/ImagePreviewModal';
import { EditorArea } from './note-editor/EditorArea';
import { MediaGallery } from './note-editor/MediaGallery';

interface NoteEditorProps {
  initialNote?: Partial<Note>;
  isOpen: boolean;
  onClose: () => void;
  onSave: (note: Partial<Note>) => void;
  onDelete?: (noteId: string) => void;
  onSwitchToMapView?: (coords?: { lat: number; lng: number }) => void;
  onSwitchToBoardView?: (coords?: { x: number; y: number }, mapInstance?: any) => void;
  themeColor?: string;
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
  themeColor = THEME_COLOR
}) => {
  // Work around occasional framer-motion typing issues in TS server
  const MotionDiv = (motion.div as unknown) as React.ComponentType<any>;
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const emojiButtonRef = useRef<HTMLDivElement | null>(null);
  const [emojiPickerPosition, setEmojiPickerPosition] = useState<{ left: number; top: number } | null>(null);

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
    // Variant should always remain as the initial type
    // The only way to change variant is through explicit user interaction (compact -> standard upgrade)

    return noteData;
  };

  const isEmptyNote = (noteData: Partial<Note>): boolean => {
    // Check if note has any content
    const hasText = noteData.text && noteData.text.trim().length > 0;
    const hasEmoji = !isCompactMode && noteData.emoji && noteData.emoji.length > 0;
    const hasImages = noteData.images && noteData.images.length > 0;
    const hasSketch = noteData.sketch && noteData.sketch.length > 0;
    const hasTags = !isCompactMode && noteData.tags && noteData.tags.length > 0;
    
    return !hasText && !hasEmoji && !hasImages && !hasSketch && !hasTags;
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

  const handleDelete = () => {
      if (initialNote?.id && onDelete) {
          // Direct deletion without confirmation dialog as requested
          onDelete(initialNote.id);
          onClose();
      }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed left-0 top-0 w-full h-screen h-[100dvh] z-[1000] flex items-center justify-center p-4 touch-none"
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
        style={{ 
          backgroundColor: 'rgba(0, 0, 0, 0.15)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          zIndex: 5
        }}
      />
      
      <div className="relative z-10 flex flex-col items-end">
      <MotionDiv 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        // Explicit width w-[500px] to prevent auto-growing behavior. min-h-[500px] added when sketching to ensure full canvas.
          className={`w-[500px] max-w-[95vw] flex flex-col relative transition-colors duration-300 max-h-[90vh] max-h-[90dvh] min-h-[300px] bg-white ${isSketching ? 'min-h-[500px]' : ''}`}
        style={{ 
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
              isPreviewMode={isPreviewMode}
              onSetPreviewMode={(preview) => {
                setShowEmojiPicker(false);
                setIsPreviewMode(preview);
              }}
              isFavorite={isFavorite}
              onToggleFavorite={() => {
                setShowEmojiPicker(false);
                setIsFavorite(!isFavorite);
              }}
              showDelete={!!(initialNote?.id && onDelete)}
              onDelete={() => {
                setShowEmojiPicker(false);
                handleDelete();
              }}
              showUpgrade={!!(isCompactMode && initialNote?.id)}
              onUpgrade={() => {
                setShowEmojiPicker(false);
                const currentData = getCurrentNoteData();
                const upgradedNote: Partial<Note> = {
                  ...initialNote!,
                  ...currentData,
                  variant: 'standard' as const,
                  coords: initialNote?.coords || { lat: 0, lng: 0 }
                };
                onSave(upgradedNote);
                onClose();
              }}
              showLocateBoard={
                !!(
                  initialNote?.boardX !== undefined &&
                  initialNote?.boardY !== undefined &&
                  onSwitchToBoardView &&
                  !onSwitchToMapView
                )
              }
              onLocateBoard={() => {
                setShowEmojiPicker(false);
                const noteWidth = initialNote!.variant === 'compact' ? 180 : 256;
                const noteHeight = initialNote!.variant === 'compact' ? 180 : 256;
                const centerX = initialNote!.boardX! + noteWidth / 2;
                const centerY = initialNote!.boardY! + noteHeight / 2;
                onSwitchToBoardView?.({ x: centerX, y: centerY });
              }}
              showLocateMap={!!(initialNote?.coords && initialNote.coords.lat !== 0 && initialNote.coords.lng !== 0 && onSwitchToMapView)}
              onLocateMap={() => {
                setShowEmojiPicker(false);
                onSwitchToMapView?.(initialNote!.coords);
              }}
              onSave={() => {
                setShowEmojiPicker(false);
                handleSave();
              }}
            />

            {/* Image Processing Indicator */}
            {isProcessingImages && (
              <div className="px-3 py-2 text-sm text-blue-600 bg-blue-50 border border-blue-200 rounded-md mb-2 flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                Processing images...
              </div>
            )}

            {/* Auto-Growing Text Area Container */}
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
              emoji={emoji}
              setEmoji={setEmoji}
              showEmojiPicker={showEmojiPicker}
              setShowEmojiPicker={setShowEmojiPicker}
              emojiButtonRef={emojiButtonRef}
              emojiPickerPosition={emojiPickerPosition}
              setEmojiPickerPosition={setEmojiPickerPosition}
              images={images}
              onPreviewImage={(index) => {
                setShowEmojiPicker(false);
                setPreviewImageIndex(index);
                setPreviewImage(images[index] || null);
              }}
              onRemoveImage={(index) => {
                setShowEmojiPicker(false);
                removeImage(index);
              }}
              onUploadImages={handleImageUpload}
              sketch={sketch}
              onOpenSketch={() => {
                setShowEmojiPicker(false);
                setIsSketching(true);
              }}
              onRemoveSketch={() => {
                setShowEmojiPicker(false);
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
              onSaveTag={handleSaveTag}
              onCancelTagEdit={handleCancelTagEdit}
              onStartAddTag={() => setIsAddingTag(true)}
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
    </div>
  );
};

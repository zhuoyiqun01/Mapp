
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Note, Tag } from '../types';
import { EMOJI_LIST, EMOJI_CATEGORIES, TAG_COLORS, THEME_COLOR } from '../constants';
import { createTag, fileToBase64, generateId } from '../utils';
import { X, Camera, Plus, Check, PenTool, Minus, Bold, Image as ImageIcon, Trash2, ArrowLeft, ArrowRight, Locate, ArrowUp, Star } from 'lucide-react';
import { DrawingCanvas } from './DrawingCanvas';
import { motion } from 'framer-motion';

interface NoteEditorProps {
  initialNote?: Partial<Note>;
  isOpen: boolean;
  onClose: () => void;
  onSave: (note: Partial<Note>) => void;
  onDelete?: (noteId: string) => void;
  clusterNotes?: Note[];
  currentIndex?: number;
  onNext?: () => void;
  onPrev?: () => void;
  onSaveWithoutClose?: (note: Partial<Note>) => void;
  onSwitchToMapView?: (coords?: { lat: number; lng: number }) => void;
  onSwitchToBoardView?: (coords?: { x: number; y: number }, mapInstance?: any) => void;
}

const DEFAULT_BG = '#FFFDF5';
const PASTEL_COLORS = [
  '#FFFDF5', // Default Off-white/Yellowish
  '#FEF3C7', // Amber-100
  '#D1FAE5', // Emerald-100
  '#DBEAFE', // Blue-100
  '#F3E8FF', // Purple-100
  '#FFE4E6', // Rose-100
];

export const NoteEditor: React.FC<NoteEditorProps> = ({ 
  initialNote, 
  isOpen, 
  onClose, 
  onSave, 
  onDelete,
  clusterNotes = [],
  currentIndex = 0,
  onNext,
  onPrev,
  onSaveWithoutClose,
  onSwitchToMapView,
  onSwitchToBoardView
}) => {
  const [emoji, setEmoji] = useState(initialNote?.emoji || '');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedEmojiCategory, setSelectedEmojiCategory] = useState<keyof typeof EMOJI_CATEGORIES>('Recent');
  const [text, setText] = useState(initialNote?.text || '');
  const [fontSize, setFontSize] = useState<number>(initialNote?.fontSize || 3); 
  const [isBold, setIsBold] = useState(initialNote?.isBold || false);
  const [isFavorite, setIsFavorite] = useState<boolean>(initialNote?.isFavorite ?? false);
  const [color, setColor] = useState(initialNote?.color || DEFAULT_BG);
  const [tags, setTags] = useState<Tag[]>(initialNote?.tags || []);
  const [images, setImages] = useState<string[]>(initialNote?.images || []);
  const [sketch, setSketch] = useState<string | undefined>(initialNote?.sketch);
  
  // Image processing state
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  
  // Tag creation state
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [newTagLabel, setNewTagLabel] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[2]);

  // Sketch mode state
  const [isSketching, setIsSketching] = useState(false);

  // Image preview state
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewImageIndex, setPreviewImageIndex] = useState<number>(0);

  // Keyboard height detection
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  
  // Swipe detection for cluster navigation
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchEndRef = useRef<{ x: number; y: number } | null>(null);
  const emojiButtonRef = useRef<HTMLButtonElement | null>(null);
  const [emojiPickerPosition, setEmojiPickerPosition] = useState<{ left: number; top: number } | null>(null);
  
  // Category tabs scroll navigation
  const categoryTabsRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  
  const minSwipeDistance = 50; // Minimum swipe distance
  
  // Check scroll position and update arrow visibility
  const checkScrollPosition = () => {
    if (!categoryTabsRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = categoryTabsRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
  };
  
  // Scroll category tabs
  const scrollCategoryTabs = (direction: 'left' | 'right') => {
    if (!categoryTabsRef.current) return;
    const scrollAmount = 200; // Scroll by 200px
    const currentScroll = categoryTabsRef.current.scrollLeft;
    const newScroll = direction === 'left' 
      ? Math.max(0, currentScroll - scrollAmount)
      : Math.min(categoryTabsRef.current.scrollWidth - categoryTabsRef.current.clientWidth, currentScroll + scrollAmount);
    categoryTabsRef.current.scrollTo({
      left: newScroll,
      behavior: 'smooth'
    });
    // Check position after scroll animation
    setTimeout(checkScrollPosition, 300);
  };

  const isCompactMode = initialNote?.variant === 'compact';
  
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  
  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  
  const handleTouchEnd = () => {
    if (!touchStartRef.current || !touchEndRef.current) return;
    
    const deltaX = touchEndRef.current.x - touchStartRef.current.x;
    const deltaY = touchEndRef.current.y - touchStartRef.current.y;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);
    
    // Only handle horizontal swipes where horizontal distance is greater than vertical
    if (absDeltaX > minSwipeDistance && absDeltaX > absDeltaY) {
      if (deltaX > 0 && onNext) {
        // Swipe right - next
        onNext();
      } else if (deltaX < 0 && onPrev) {
        // Swipe left - previous
        onPrev();
      }
    }
    
    touchStartRef.current = null;
    touchEndRef.current = null;
  };

  // Check scroll position when emoji picker opens or category changes
  useEffect(() => {
    if (showEmojiPicker && categoryTabsRef.current) {
      checkScrollPosition();
      const container = categoryTabsRef.current;
      container.addEventListener('scroll', checkScrollPosition);
      // Also check on resize
      window.addEventListener('resize', checkScrollPosition);
      return () => {
        container.removeEventListener('scroll', checkScrollPosition);
        window.removeEventListener('resize', checkScrollPosition);
      };
    }
  }, [showEmojiPicker, selectedEmojiCategory]);

  // Track if editor was just opened to only reset state on open, not on every initialNote change
  const prevIsOpenRef = useRef(false);
  const prevNoteIdRef = useRef<string | undefined>(initialNote?.id);
  const noteId = initialNote?.id;

  // Create a checksum of the note data to detect changes
  const noteDataChecksum = useMemo(() => {
    return JSON.stringify({
      emoji: initialNote?.emoji,
      text: initialNote?.text,
      fontSize: initialNote?.fontSize,
      isBold: initialNote?.isBold,
      isFavorite: initialNote?.isFavorite,
      color: initialNote?.color,
      tags: initialNote?.tags,
      images: initialNote?.images,
      sketch: initialNote?.sketch,
    });
  }, [initialNote]);

  useEffect(() => {
    // When note ID changes (switching between notes in cluster) OR note data changes (same note updated), reset all state
    if (isOpen && (noteId !== prevNoteIdRef.current || prevIsOpenRef.current !== isOpen)) {
      setEmoji(initialNote?.emoji || '');
      setText(initialNote?.text || '');
      setFontSize(initialNote?.fontSize || 3);
      setIsBold(initialNote?.isBold || false);
      setIsFavorite(initialNote?.isFavorite ?? false);
      setColor(initialNote?.color || DEFAULT_BG);
      setTags(initialNote?.tags || []);
      setImages(initialNote?.images || []);
      setSketch(initialNote?.sketch);
      setIsAddingTag(false);
      setIsSketching(false);
      prevNoteIdRef.current = noteId;
    }
    prevIsOpenRef.current = isOpen;
  }, [noteId, isOpen, noteDataChecksum]);
  
  // Detect keyboard height by monitoring viewport height changes (removed for text mode)
  useEffect(() => {
    // Text mode removed
    if (!isOpen) return;
    
    const initialViewportHeight = window.visualViewport?.height || window.innerHeight;
    let lastHeight = initialViewportHeight;
    
    const handleResize = () => {
      const currentHeight = window.visualViewport?.height || window.innerHeight;
      const heightDiff = initialViewportHeight - currentHeight;
      // If viewport shrunk significantly, keyboard is likely open
      if (heightDiff > 150) {
        setKeyboardHeight(heightDiff);
      } else {
        setKeyboardHeight(0);
      }
      lastHeight = currentHeight;
    };
    
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
    } else {
      window.addEventListener('resize', handleResize);
    }
    
    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
      } else {
        window.removeEventListener('resize', handleResize);
      }
    };
  }, [isOpen]);

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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      try {
        const files = Array.from(e.target.files) as File[];
        const base64Promises = files.map((file: File) => fileToBase64(file));
        const base64Images = await Promise.all(base64Promises);
        setImages([...images, ...base64Images]);
        // Reset input to allow selecting the same files again
        e.target.value = '';
      } catch (err) {
        console.error("Failed to convert image", err);
      }
    }
  };

  const removeImage = (e: React.MouseEvent, index?: number) => {
    e.stopPropagation();
    e.preventDefault();
    if (index !== undefined) {
      // Remove specific image
      const newImages = images.filter((_, i) => i !== index);
      setImages(newImages);
      // Update preview if needed
      if (previewImage) {
        if (previewImageIndex === index) {
          // If previewing the removed image, switch to another or close
          if (newImages.length > 0) {
            const newIndex = Math.min(index, newImages.length - 1);
            setPreviewImageIndex(newIndex);
            setPreviewImage(newImages[newIndex]);
          } else {
            setPreviewImage(null);
          }
        } else if (previewImageIndex > index) {
          // If previewing an image after the removed one, adjust index
          const newIndex = previewImageIndex - 1;
          setPreviewImageIndex(newIndex);
          setPreviewImage(newImages[newIndex]);
        }
        // If previewing an image before the removed one, no change needed
      }
    } else {
      // Remove all images (backward compatibility)
    setImages([]); 
      setPreviewImage(null);
    }
  };

  const removeSketch = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setSketch(undefined);
  };

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

  const handleSaveWithoutClose = () => {
    if (onSaveWithoutClose) {
      const noteData = getCurrentNoteData();
      // Ensure images are always included
      if (!noteData.images) {
        noteData.images = images || [];
      }
      onSaveWithoutClose(noteData);
    }
  };

  const handleDelete = () => {
      if (initialNote?.id && onDelete) {
          // Direct deletion without confirmation dialog as requested
          onDelete(initialNote.id);
          onClose();
      }
  };

  const getTextStyles = () => {
    // Unified scale for all note types: 3rem - 7rem (5 levels)
    const sizeMap: Record<number, string> = {
      1: 'text-[3rem]',
      2: 'text-[4rem]',
      3: 'text-[5rem]',
      4: 'text-[6rem]',
      5: 'text-[7rem]',
    };
    return `${sizeMap[fontSize] || 'text-[5rem]'} ${isBold ? 'font-black' : 'font-medium'}`;
  };

  const adjustFontSize = (delta: number) => {
    setFontSize(prev => Math.max(1, Math.min(5, prev + delta)));
  };

  if (!isOpen) return null;

  return (
    <div 
      className={`fixed inset-0 z-[1000] flex items-center justify-center p-4 touch-none`}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onDragOver={(e) => e.stopPropagation()}
      onDragEnter={(e) => e.stopPropagation()}
      onDragLeave={(e) => e.stopPropagation()}
      onDrop={(e) => e.stopPropagation()}
      style={{}}
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
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        // Explicit width w-[500px] to prevent auto-growing behavior. min-h-[500px] added when sketching to ensure full canvas.
          className={`w-[500px] max-w-[95vw] flex flex-col relative transition-colors duration-300 max-h-[90vh] min-h-[300px] ${isSketching ? 'min-h-[500px]' : ''}`}
        style={{ 
            backgroundColor: color,
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
        
        {/* Font Control buttons - topmost z-20 */}
        <div
          className="absolute left-3 flex justify-center items-center gap-2 pointer-events-auto"
          style={{ 
            top: isCompactMode ? '8px' : '12px',
            zIndex: 20
          }}
        >
          <div className="flex items-center gap-1 bg-white rounded-xl shadow-lg p-2" style={{ border: 'none' }}>
            <button onClick={() => { setShowEmojiPicker(false); adjustFontSize(1); }} className="p-1 bg-gray-50 text-gray-600 rounded-lg transition-all" style={{ border: 'none', outline: 'none' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${THEME_COLOR}1A`; e.currentTarget.style.color = THEME_COLOR; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = ''; e.currentTarget.style.color = ''; }}><Plus size={18}/></button>
            <button onClick={() => { setShowEmojiPicker(false); adjustFontSize(-1); }} className="p-1 bg-gray-50 text-gray-600 rounded-lg transition-all" style={{ border: 'none', outline: 'none' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${THEME_COLOR}1A`; e.currentTarget.style.color = THEME_COLOR; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = ''; e.currentTarget.style.color = ''; }}><Minus size={18}/></button>
            <div className="w-px h-6 bg-gray-200 mx-1"></div>
            <button onClick={() => { setShowEmojiPicker(false); setIsBold(!isBold); }} className={`p-1 rounded-lg transition-all ${isBold ? 'text-white' : 'bg-gray-50 text-gray-600'}`} style={{ border: 'none', outline: 'none', backgroundColor: isBold ? THEME_COLOR : undefined }} onMouseEnter={(e) => !isBold && (e.currentTarget.style.backgroundColor = `${THEME_COLOR}1A`)} onMouseLeave={(e) => !isBold && (e.currentTarget.style.backgroundColor = '')}><Bold size={18}/></button>
          </div>
        </div>
        
        <div className={`flex flex-col flex-1 h-full ${isSketching ? 'invisible' : ''}`} style={{ zIndex: 10 }}>
            {/* Header - middle layer z-10 (inherits from parent) */}
            <div className={`flex justify-between items-start p-4 pb-2 relative flex-shrink-0`}>
                <div></div>
                
                <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setShowEmojiPicker(false); setIsFavorite(!isFavorite); }}
                      className={`rounded-full p-1.5 transition-colors active:scale-90 ${
                        isFavorite ? 'text-white' : 'text-gray-400 hover:text-gray-600 hover:bg-black/5'
                      }`}
                      style={isFavorite ? { backgroundColor: THEME_COLOR } : undefined}
                      title={isFavorite ? '取消收藏' : '收藏'}
                    >
                      <Star size={24} fill={isFavorite ? THEME_COLOR : 'none'} />
                    </button>
                    {initialNote?.id && onDelete && (
                        <button 
                            onClick={() => { setShowEmojiPicker(false); handleDelete(); }}
                            className="text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full p-1.5 transition-colors active:scale-90"
                        >
                            <Trash2 size={24} />
                        </button>
                    )}
                    {/* Upgrade button for compact notes */}
                    {isCompactMode && initialNote?.id && (
                    <button 
                            onClick={() => { 
                                setShowEmojiPicker(false); 
                                // Upgrade compact note to standard note
                                const currentData = getCurrentNoteData();
                                const upgradedNote: Note = {
                                    ...initialNote!,
                                    ...currentData,
                                    variant: 'standard' as const,
                                    coords: initialNote?.coords || { lat: 0, lng: 0 } // Keep existing coords if available
                                };
                                onSave(upgradedNote);
                                onClose();
                            }}
                            className="text-green-400 hover:text-green-600 hover:bg-green-50 rounded-full p-1.5 transition-colors active:scale-90"
                            title="升级为标准便签"
                    >
                            <ArrowUp size={24} />
                    </button>
                    )}
                    {/* Show navigate to board button when in map view (only if onSwitchToMapView doesn't exist) */}
                    {initialNote?.boardX !== undefined && initialNote?.boardY !== undefined && onSwitchToBoardView && !onSwitchToMapView && (
                            <button 
                            onClick={() => { 
                                setShowEmojiPicker(false); 
                                // Calculate center coordinates of the note
                                const noteWidth = initialNote.variant === 'compact' ? 180 : 256;
                                const noteHeight = initialNote.variant === 'compact' ? 180 : 256;
                                const centerX = initialNote.boardX! + noteWidth / 2;
                                const centerY = initialNote.boardY! + noteHeight / 2;
                                onSwitchToBoardView({ x: centerX, y: centerY }); 
                            }}
                            className="text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-full p-1.5 transition-colors active:scale-90"
                            title="定位到board视图"
                            >
                            <Locate size={24} className="text-gray-400 hover:text-gray-600" />
                            </button>
                    )}
                    {/* Show navigate to map button when in board view (only if onSwitchToBoardView doesn't exist or both exist) */}
                    {initialNote?.coords && initialNote.coords.lat !== 0 && initialNote.coords.lng !== 0 && onSwitchToMapView && (
                        <button 
                            onClick={() => { 
                                setShowEmojiPicker(false); 
                                onSwitchToMapView(initialNote.coords); 
                            }}
                            className="text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-full p-1.5 transition-colors active:scale-90"
                            title="定位到地图视图"
                        >
                            <Locate size={24} className="text-gray-400 hover:text-gray-600" />
                        </button>
                )}
                <button 
                    onClick={() => { setShowEmojiPicker(false); handleSave(); }}
                        className="text-gray-400 hover:text-gray-600 hover:bg-black/5 rounded-full p-1.5 transition-colors active:scale-90"
                >
                    <Check size={28} />
                </button>
                </div>
            </div>

            {/* Image Processing Indicator */}
            {isProcessingImages && (
              <div className="px-3 py-2 text-sm text-blue-600 bg-blue-50 border border-blue-200 rounded-md mb-2 flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                Processing images...
              </div>
            )}

            {/* Auto-Growing Text Area Container */}
            <div
              className={`flex-1 px-3 relative group flex flex-col overflow-y-auto custom-scrollbar min-h-[120px] ${
                isProcessingImages ? 'ring-2 ring-blue-400 ring-opacity-50 bg-blue-50 bg-opacity-30' : ''
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={async (e) => {
                e.preventDefault();
                e.stopPropagation();

                const files = Array.from(e.dataTransfer.files) as File[];
                const imageFiles = files.filter((file: File) => file.type.startsWith('image/'));

                if (imageFiles.length > 0 && !isProcessingImages) {
                  setIsProcessingImages(true);

                  try {
                    // Process images in batches to avoid blocking UI
                    const batchSize = 3;
                    const processedImages: string[] = [];

                    for (let i = 0; i < imageFiles.length; i += batchSize) {
                      const batch = imageFiles.slice(i, i + batchSize);
                      // Process images with optimized compression for drag & drop
                      const base64Promises = batch.map(async (file) => {
                        // For drag & drop, use faster compression settings
                        if (file.size > 500 * 1024) { // Files larger than 500KB
                          // Use smaller max dimensions and lower quality for large files
                          return new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.readAsDataURL(file);
                            reader.onload = (e) => {
                              const img = new Image();
                              img.src = e.target?.result as string;
                              img.onload = () => {
                                const canvas = document.createElement('canvas');
                                let width = img.width;
                                let height = img.height;

                                // More aggressive size reduction based on file size
                                let maxSize = 1200; // Default max dimension
                                if (file.size > 10 * 1024 * 1024) { // 10MB+
                                  maxSize = 600;
                                } else if (file.size > 5 * 1024 * 1024) { // 5MB+
                                  maxSize = 800;
                                } else if (file.size > 2 * 1024 * 1024) { // 2MB+
                                  maxSize = 1000;
                                }

                                if (width > maxSize || height > maxSize) {
                                  const ratio = Math.min(maxSize / width, maxSize / height);
                                  width = Math.floor(width * ratio);
                                  height = Math.floor(height * ratio);
                                }

                                canvas.width = width;
                                canvas.height = height;

                                const ctx = canvas.getContext('2d');
                                if (!ctx) {
                                  reject(new Error('Could not get canvas context'));
                                  return;
                                }

                                ctx.drawImage(img, 0, 0, width, height);

                                // Lower quality for better compression
                                let quality = 0.8; // Default quality
                                if (file.size > 5 * 1024 * 1024) {
                                  quality = 0.5; // Very aggressive compression for large files
                                } else if (file.size > 2 * 1024 * 1024) {
                                  quality = 0.6; // Aggressive compression for medium files
                                } else {
                                  quality = 0.7; // Moderate compression for smaller files
                                }

                                const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
                                console.log(`Compressed image: ${file.name} (${file.size} bytes) -> ${width}x${height}, quality: ${quality}, result: ${(compressedDataUrl.length * 3 / 4 / 1024 / 1024).toFixed(2)}MB`);
                                resolve(compressedDataUrl);
                              };
                              img.onerror = (error) => reject(error);
                            };
                            reader.onerror = (error) => reject(error);
                          });
                        } else {
                          // Small files use standard compression
                          return fileToBase64(file);
                        }
                      });
                      const batchResults = await Promise.all(base64Promises);
                      processedImages.push(...batchResults);

                      // Update UI with processed images incrementally
                      setImages(prev => [...prev, ...batchResults]);
                    }
                  } catch (err) {
                    console.error("Failed to convert dragged image", err);
                    // Could add user notification here
                  } finally {
                    setIsProcessingImages(false);
                  }
                }
              }}
            >
              <div className="grid w-full min-w-0">
                {/* Invisible Pre-wrap div to force height */}
                <div 
                  className={`col-start-1 row-start-1 w-full min-w-0 whitespace-pre-wrap break-words invisible leading-none pb-4 ${getTextStyles()}`}
                  aria-hidden="true"
                >
                   {text + ' '}
                </div>

                {/* Actual Textarea */}
                <textarea
                    autoFocus={false}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Write here..."
                    className={`col-start-1 row-start-1 w-full min-w-0 h-full bg-transparent border-none resize-none focus:ring-0 p-0 text-gray-800 placeholder-gray-500/30 leading-none overflow-hidden break-words whitespace-pre-wrap pb-4 ${getTextStyles()}`}
                    spellCheck={false}
                    style={{ 
                      backgroundColor: 'transparent',
                      border: 'none',
                      outline: 'none',
                      boxShadow: 'none'
                    }}
                />
              </div>
              
            </div>

            {/* Footer Actions */}
            {true && (
              <div className="flex flex-col z-10 backdrop-blur-[2px] mt-auto flex-shrink-0">
                
                {/* Media Row */}
                {!isCompactMode && (
                  <div className="px-3 pt-1 flex gap-3 overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
                      <div className="relative group flex-shrink-0">
                        <div 
                          ref={emojiButtonRef}
                          onClick={() => {
                            if (emojiButtonRef.current) {
                              const rect = emojiButtonRef.current.getBoundingClientRect();
                              const spaceBelow = window.innerHeight - rect.bottom;
                              const spaceAbove = rect.top;
                              // If space below is insufficient, show above
                              if (spaceBelow < 400 && spaceAbove > spaceBelow) {
                                setEmojiPickerPosition({
                                  left: rect.left,
                                  top: rect.top - 200 - 8
                                });
                              } else {
                                setEmojiPickerPosition({
                                  left: rect.left,
                                  top: rect.bottom + 8
                                });
                              }
                            }
                            setShowEmojiPicker(!showEmojiPicker);
                          }}
                          className="w-20 h-20 bg-white/60 hover:bg-white shadow-sm rounded-2xl flex items-center justify-center transition-colors cursor-pointer"
                          style={{ border: 'none' }}
                        >
                          <span className="text-3xl leading-none">{emoji || '📌'}</span>
                        </div>
                        {emoji && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEmoji('');
                              setShowEmojiPicker(false);
                            }}
                            className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ border: 'none' }}
                          >
                            <X size={12} />
                          </button>
                        )}
                        {showEmojiPicker && emojiPickerPosition && createPortal(
                          <>
                            <div 
                              className="fixed inset-0" 
                              style={{ zIndex: 9999 }}
                              onClick={() => setShowEmojiPicker(false)} 
                            />
                            <div 
                              className="fixed bg-white rounded-xl shadow-2xl overflow-hidden"
                              style={{ 
                                border: 'none',
                                width: '320px',
                                maxHeight: '400px',
                                display: 'flex',
                                flexDirection: 'column',
                                left: `${emojiPickerPosition.left}px`,
                                top: `${emojiPickerPosition.top}px`,
                                zIndex: 10000,
                                position: 'fixed',
                                pointerEvents: 'auto'
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {/* Category Tabs */}
                              <div className="relative border-b border-gray-100">
                                {/* Left Arrow */}
                                {canScrollLeft && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      scrollCategoryTabs('left');
                                    }}
                                    className="absolute left-0 top-0 bottom-0 z-10 px-2 bg-white/80 hover:bg-white flex items-center transition-colors"
                                    style={{ backdropFilter: 'blur(4px)' }}
                                  >
                                    <ArrowLeft size={16} className="text-gray-600" />
                                  </button>
                                )}
                                {/* Right Arrow */}
                                {canScrollRight && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      scrollCategoryTabs('right');
                                    }}
                                    className="absolute right-0 top-0 bottom-0 z-10 px-2 bg-white/80 hover:bg-white flex items-center transition-colors"
                                    style={{ backdropFilter: 'blur(4px)' }}
                                  >
                                    <ArrowRight size={16} className="text-gray-600" />
                                  </button>
                                )}
                                {/* Category Tabs Container */}
                                <div 
                                  ref={categoryTabsRef}
                                  className="flex gap-1 p-1.5 overflow-x-auto scrollbar-hide"
                                  style={{
                                    scrollbarWidth: 'none',
                                    msOverflowStyle: 'none',
                                    WebkitOverflowScrolling: 'touch',
                                    touchAction: 'pan-x'
                                  }}
                                >
                                  {Object.keys(EMOJI_CATEGORIES).map(category => (
                                    <button
                                      key={category}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedEmojiCategory(category as keyof typeof EMOJI_CATEGORIES);
                                      }}
                                      className={`px-2 py-1 text-xs font-medium rounded-lg whitespace-nowrap transition-colors flex-shrink-0 ${
                                        selectedEmojiCategory === category
                                          ? 'text-gray-900'
                                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                      }`}
                                    >
                                      {category}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              
                              {/* Emoji Grid */}
                              <div className="p-3 overflow-y-auto" style={{ maxHeight: '320px' }}>
                                <div className="grid grid-cols-8 gap-1" key={selectedEmojiCategory}>
                                  {(EMOJI_CATEGORIES[selectedEmojiCategory] || EMOJI_CATEGORIES['Recent']).map((e, index) => (
                                    <button 
                                      key={`${selectedEmojiCategory}-${index}-${e}`} 
                                      onClick={() => { 
                                        setEmoji(e); 
                                        setShowEmojiPicker(false);
                                        // Add to recent
                                        if (selectedEmojiCategory !== 'Recent') {
                                          const recent = EMOJI_CATEGORIES['Recent'];
                                          if (!recent.includes(e)) {
                                            EMOJI_CATEGORIES['Recent'] = [e, ...recent.slice(0, 19)];
                                          }
                                        }
                                      }}
                                      className="text-2xl p-2 rounded-lg transition-colors flex items-center justify-center"
                                      style={{ backgroundColor: 'transparent' }}
                                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${THEME_COLOR}1A`}
                                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                      {e}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </>,
                          document.body
                        )}
                      </div>
                      {/* Images - scrollable list */}
                      {images.map((image, index) => (
                        <div key={index} className="relative group flex-shrink-0">
                          <div 
                            className="w-20 h-20 bg-white/60 shadow-sm rounded-2xl overflow-hidden cursor-pointer"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setShowEmojiPicker(false);
                              setPreviewImageIndex(index);
                              setPreviewImage(image);
                            }}
                          >
                            <img 
                              src={image} 
                              alt="便签图片"
                              className="w-full h-full object-cover" 
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.nextElementSibling?.classList.remove('hidden');
                              }}
                            />
                            <div className="hidden absolute inset-0 bg-gray-200 flex items-center justify-center text-xs text-gray-500">
                              <div className="text-center">
                                <div className="text-lg mb-1">📷</div>
                                <div>图片已损毁</div>
                              </div>
                            </div>
                          </div>
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              setShowEmojiPicker(false); 
                              removeImage(e, index); 
                            }} 
                            className="absolute -top-1 -right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                          >
                            <X size={12}/>
                          </button>
                        </div>
                      ))}
                      {/* Upload button - always visible */}
                      <label className="w-20 h-20 bg-white/60 hover:bg-white shadow-sm rounded-2xl flex items-center justify-center cursor-pointer transition-colors relative flex-shrink-0" style={{ border: 'none' }}>
                          <Camera size={24} className="text-gray-500"/>
                          <input type="file" accept="image/*,.heic,.heif" multiple className="hidden" onChange={(e) => { setShowEmojiPicker(false); handleImageUpload(e); }} />
                      </label>
                      <button 
                        onClick={() => { setShowEmojiPicker(false); setIsSketching(true); }}
                        className="w-20 h-20 bg-white/60 hover:bg-white shadow-sm rounded-2xl flex items-center justify-center transition-colors relative overflow-hidden group flex-shrink-0"
                        style={{ border: 'none' }}
                      >
                          {sketch && sketch !== '' ? (
                            <div className="relative w-full h-full">
                              <img
                                src={sketch}
                                alt="便签涂鸦"
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                }}
                              />
                              <div className="hidden absolute inset-0 bg-gray-200 flex items-center justify-center text-xs text-gray-500">
                                <div className="text-center">
                                  <div className="text-lg mb-1">🎨</div>
                                  <div>涂鸦已损毁</div>
                                </div>
                              </div>
                            </div>
                          ) : <PenTool size={24} className="text-gray-500"/>}
                          {sketch && sketch !== '' && <div onClick={(e) => {e.stopPropagation(); setShowEmojiPicker(false); removeSketch(e); }} className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X size={12}/></div>}
                      </button>
                  </div>
                )}

                {/* Tags Row */}
                {!isCompactMode && (
                    <div className="px-3 pt-2 pb-2 flex-1 flex gap-2 overflow-x-auto scrollbar-hide items-center min-h-[50px]">
                        {tags.map(tag => (
                            editingTagId === tag.id ? (
                                <div key={tag.id} className="flex items-center gap-1 bg-white rounded-full shadow-sm p-1 pr-2 h-10 animate-in fade-in slide-in-from-left-2 flex-shrink-0" style={{ border: 'none' }}>
                                    <input 
                                        autoFocus
                                        className="w-16 text-sm bg-transparent outline-none ml-2 text-gray-700 placeholder-gray-400"
                                        placeholder="Tag name..."
                                        value={newTagLabel}
                                        onChange={(e) => setNewTagLabel(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleSaveTag();
                                            if (e.key === 'Escape') handleCancelTagEdit();
                                        }}
                                    />
                                    <div className="flex gap-1 pl-2" style={{ borderLeft: 'none' }}>
                                        {TAG_COLORS.slice(0,5).map(c => (
                                            <button 
                                                key={c} 
                                                onClick={() => setNewTagColor(c)} 
                                                style={{backgroundColor: c}} 
                                                className={`w-5 h-5 rounded-full transition-transform ${newTagColor === c ? 'scale-125 ring-2 ring-gray-300 ring-offset-1' : 'hover:scale-110'}`}
                                            />
                                        ))}
                                    </div>
                                    <button onClick={handleSaveTag} className="ml-1 text-green-500 hover:text-green-600 active:scale-90 transition-transform"><Check size={18}/></button>
                                </div>
                            ) : (
                                <span 
                                    key={tag.id} 
                                    onClick={() => { setShowEmojiPicker(false); handleEditTag(tag); }}
                                    className="flex-shrink-0 h-6 px-2.5 rounded-full text-xs font-bold text-white shadow-sm flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity" 
                                    style={{backgroundColor: tag.color}}
                                >
                                {tag.label}
                                    <button onClick={(e) => { e.stopPropagation(); setShowEmojiPicker(false); removeTag(tag.id); }}><X size={10}/></button>
                            </span>
                            )
                        ))}
                        {isAddingTag && !editingTagId ? (
                            <div className="flex items-center gap-1 bg-white rounded-full shadow-sm p-1 pr-2 h-10 animate-in fade-in slide-in-from-left-2" style={{ border: 'none' }}>
                            <input 
                                autoFocus
                                className="w-16 text-sm bg-transparent outline-none ml-2 text-gray-700 placeholder-gray-400"
                                placeholder="Tag name..."
                                value={newTagLabel}
                                onChange={(e) => setNewTagLabel(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveTag();
                                    if (e.key === 'Escape') handleCancelTagEdit();
                                }}
                            />
                            <div className="flex gap-1 pl-2" style={{ borderLeft: 'none' }}>
                                {TAG_COLORS.slice(0,5).map(c => (
                                    <button 
                                        key={c} 
                                        onClick={() => setNewTagColor(c)} 
                                        style={{backgroundColor: c}} 
                                        className={`w-5 h-5 rounded-full transition-transform ${newTagColor === c ? 'scale-125 ring-2 ring-gray-300 ring-offset-1' : 'hover:scale-110'}`}
                                    />
                                ))}
                            </div>
                            <button onClick={handleSaveTag} className="ml-1 text-green-500 hover:text-green-600 active:scale-90 transition-transform"><Check size={18}/></button>
                            </div>
                        ) : !editingTagId ? (
                            <button onClick={() => { setShowEmojiPicker(false); setIsAddingTag(true); }} className="flex-shrink-0 h-10 px-4 bg-white/60 hover:bg-white rounded-full text-xs font-bold text-gray-500 shadow-sm flex items-center transition-all" style={{ border: 'none' }}>
                                + Tag
                            </button>
                        ) : null}
                    </div>
                )}

                <div className="h-px w-full mt-2 bg-black/5"></div>

                {/* Color Row */}
                <div className="px-4 py-4 flex justify-start items-center">
                    <div className="flex gap-2">
                        {PASTEL_COLORS.map(c => (
                            <button
                                key={c}
                                onClick={() => setColor(c)}
                                className={`w-6 h-6 rounded-full shadow-sm transition-transform ${color === c ? 'scale-125 ring-2 ring-gray-400 ring-offset-1' : 'hover:scale-110'}`}
                                style={{ backgroundColor: c, border: 'none' }}
                            />
                        ))}
                    </div>
                </div>
              </div>
            )}
            
        </div>
        </motion.div>
        
        {/* Cluster Navigation Buttons - Outside card, below, right-aligned */}
        {clusterNotes.length > 1 && (
          <div className="mt-4 flex items-center gap-2 pointer-events-auto">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onPrev && currentIndex > 0) {
                handleSaveWithoutClose();
                onPrev();
              }
            }}
            disabled={currentIndex === 0}
            className={`p-2 rounded-full transition-all ${
              currentIndex === 0
                ? 'text-gray-400 cursor-not-allowed'
                : 'text-white'
            }`}
            style={currentIndex !== 0 ? { color: 'white' } : undefined}
            onMouseEnter={(e) => currentIndex !== 0 && (e.currentTarget.style.color = THEME_COLOR)}
            onMouseLeave={(e) => currentIndex !== 0 && (e.currentTarget.style.color = 'white')}
            title="Previous note"
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18 L9 12 L15 6" />
            </svg>
          </button>
          <div className="px-3 py-1 text-base font-bold text-white">
            {currentIndex + 1} / {clusterNotes.length}
          </div>
                    <button 
            onClick={(e) => {
              e.stopPropagation();
              if (onNext && currentIndex < clusterNotes.length - 1) {
                handleSaveWithoutClose();
                onNext();
              }
            }}
            disabled={currentIndex === clusterNotes.length - 1}
            className={`p-2 rounded-full transition-all ${
              currentIndex === clusterNotes.length - 1
                ? 'text-gray-400 cursor-not-allowed'
                : 'text-white'
            }`}
            style={currentIndex !== clusterNotes.length - 1 ? { color: 'white' } : undefined}
            onMouseEnter={(e) => currentIndex !== clusterNotes.length - 1 && (e.currentTarget.style.color = THEME_COLOR)}
            onMouseLeave={(e) => currentIndex !== clusterNotes.length - 1 && (e.currentTarget.style.color = 'white')}
            title="Next note"
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18 L15 12 L9 6" />
            </svg>
                    </button>
                </div>
            )}
        </div>

      {/* Image Preview Modal */}
      {previewImage && images.length > 0 && (
        <div 
          className="fixed inset-0 z-[1000] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-full max-h-full flex items-center gap-4">
            {/* Previous Button */}
            {images.length > 1 && previewImageIndex > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const newIndex = previewImageIndex - 1;
                  setPreviewImageIndex(newIndex);
                  setPreviewImage(images[newIndex]);
                }}
                className="text-white hover:text-gray-300 transition-colors p-2"
                style={{ zIndex: 1001 }}
              >
                <ArrowLeft size={32} />
              </button>
            )}
            {images.length > 1 && previewImageIndex === 0 && (
              <div className="w-[40px]" /> // Spacer for alignment
            )}
            
            <div className="relative max-w-full max-h-full flex flex-col items-center">
              <button
                onClick={() => setPreviewImage(null)}
                className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors z-10"
              >
                <X size={32} />
              </button>
              <img 
                src={previewImage} 
                alt="Preview" 
                className="max-w-full max-h-[90vh] object-contain"
                onClick={(e) => e.stopPropagation()}
              />
              {images.length > 1 && (
                <div className="mt-4 text-white text-sm">
                  {previewImageIndex + 1} / {images.length}
                </div>
              )}
            </div>
            
            {/* Next Button */}
            {images.length > 1 && previewImageIndex < images.length - 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const newIndex = previewImageIndex + 1;
                  setPreviewImageIndex(newIndex);
                  setPreviewImage(images[newIndex]);
                }}
                className="text-white hover:text-gray-300 transition-colors p-2"
                style={{ zIndex: 1001 }}
              >
                <ArrowRight size={32} />
              </button>
            )}
            {images.length > 1 && previewImageIndex === images.length - 1 && (
              <div className="w-[40px]" /> // Spacer for alignment
            )}
          </div>
        </div>
      )}
    </div>
  );
};

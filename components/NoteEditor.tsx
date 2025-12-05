
import React, { useState, useEffect } from 'react';
import { Note, Tag } from '../types';
import { EMOJI_LIST, TAG_COLORS } from '../constants';
import { createTag, fileToBase64, generateId } from '../utils';
import { X, Camera, Plus, Check, PenTool, Minus, Bold, Image as ImageIcon, Trash2 } from 'lucide-react';
import { DrawingCanvas } from './DrawingCanvas';
import { motion } from 'framer-motion';

interface NoteEditorProps {
  initialNote?: Partial<Note>;
  isOpen: boolean;
  onClose: () => void;
  onSave: (note: Partial<Note>) => void;
  onDelete?: (noteId: string) => void;
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

export const NoteEditor: React.FC<NoteEditorProps> = ({ initialNote, isOpen, onClose, onSave, onDelete }) => {
  const [emoji, setEmoji] = useState(initialNote?.emoji || EMOJI_LIST[0]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [text, setText] = useState(initialNote?.text || '');
  const [fontSize, setFontSize] = useState<number>(initialNote?.fontSize || 3); 
  const [isBold, setIsBold] = useState(initialNote?.isBold || false);
  const [color, setColor] = useState(initialNote?.color || DEFAULT_BG);
  const [tags, setTags] = useState<Tag[]>(initialNote?.tags || []);
  const [images, setImages] = useState<string[]>(initialNote?.images || []);
  const [sketch, setSketch] = useState<string | undefined>(initialNote?.sketch);
  
  // Tag creation state
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagLabel, setNewTagLabel] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[2]);

  // Sketch mode state
  const [isSketching, setIsSketching] = useState(false);

  // Keyboard height detection
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const isTextMode = initialNote?.variant === 'text';
  const isCompactMode = initialNote?.variant === 'compact';

  useEffect(() => {
    if (isOpen) {
      setEmoji(initialNote?.emoji || EMOJI_LIST[0]);
      setText(initialNote?.text || '');
      setFontSize(initialNote?.fontSize || 3);
      setIsBold(initialNote?.isBold || false);
      setColor(initialNote?.color || DEFAULT_BG);
      setTags(initialNote?.tags || []);
      setImages(initialNote?.images || []);
      setSketch(initialNote?.sketch);
      setIsAddingTag(false);
      setIsSketching(false);
    }
  }, [initialNote, isOpen]);
  
  // Detect keyboard height by monitoring viewport height changes
  useEffect(() => {
    if (!isTextMode || !isOpen) return;
    
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
  }, [isTextMode, isOpen]);

  const handleSaveTag = () => {
    if (newTagLabel.trim()) {
      const newTag: Tag = {
        id: generateId(),
        label: newTagLabel.trim(),
        color: newTagColor
      };
      setTags([...tags, newTag]);
      setNewTagLabel('');
      setIsAddingTag(false);
    } else {
      // 如果没有输入文字，取消添加
      setNewTagLabel('');
      setIsAddingTag(false);
    }
  };

  const removeTag = (id: string) => {
    setTags(tags.filter(t => t.id !== id));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        const base64 = await fileToBase64(e.target.files[0]);
        setImages([...images, base64]);
      } catch (err) {
        console.error("Failed to convert image", err);
      }
    }
  };

  const removeImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setImages([]); 
  };

  const removeSketch = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setSketch(undefined);
  };

  const handleSave = () => {
    if (isTextMode && !text.trim()) {
        onClose();
        return;
    }

    onSave({
      ...initialNote,
      emoji: isCompactMode ? '' : emoji,
      text,
      fontSize,
      isBold,
      color,
      tags: isCompactMode ? [] : tags,
      images,
      sketch
    });
    onClose();
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
      className={`fixed inset-0 z-[1000] flex items-center justify-center ${isTextMode ? 'p-4' : 'p-4'} touch-none`}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      style={isTextMode ? { overflow: 'hidden', touchAction: 'none', backgroundColor: 'transparent' } : {}}
    >
      <div className="absolute inset-0" onClick={handleSave} style={{ zIndex: 1 }}></div>
      
      {/* Blur overlay - 全屏遮罩，在卡片背后 z-5 */}
      <div 
        className="fixed inset-0 pointer-events-none"
        style={{ 
          backgroundColor: 'rgba(0, 0, 0, 0.15)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          zIndex: 5
        }}
      />
      
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        // Explicit width w-[500px] to prevent auto-growing behavior. min-h-[500px] added when sketching to ensure full canvas.
        className={`${isTextMode ? 'w-auto max-w-[95vw]' : 'w-[500px] max-w-[95vw]'} flex flex-col relative z-10 transition-colors duration-300 ${isTextMode ? 'max-h-[60vh]' : 'max-h-[90vh]'} ${isTextMode ? 'min-h-0' : 'min-h-[300px]'} ${isSketching ? 'min-h-[500px]' : ''}`}
        style={{ 
            backgroundColor: isTextMode ? 'transparent' : color,
            boxShadow: isTextMode ? 'none' : '0 25px 50px 12px rgba(0, 0, 0, 0.15)',
            border: isTextMode ? '2px solid #FFDD00' : 'none',
            borderRadius: isTextMode ? '12px' : undefined,
            padding: isTextMode ? '6px' : '4px',
            overflow: isTextMode ? 'visible' : 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {isSketching && (
          <div className="absolute inset-0 z-50" onPointerDown={(e) => e.stopPropagation()}>
            <DrawingCanvas 
                initialData={sketch}
                backgroundColor={color}
                onSave={(data) => { setSketch(data); setIsSketching(false); }}
                onCancel={() => setIsSketching(false)}
            />
          </div>
        )}
        
        {/* Font Control buttons - 最顶层 z-20 */}
        <div 
          className="absolute right-4 flex justify-center items-center gap-2 pointer-events-auto"
          style={{ 
            bottom: isTextMode ? '4px' : isCompactMode ? '64px' : '154px',
            zIndex: 20
          }}
        >
          <div className="flex items-center gap-1 bg-white rounded-xl shadow-lg p-2" style={{ border: 'none' }}>
            <button onClick={() => adjustFontSize(1)} className="p-1 bg-gray-50 hover:bg-[#FFDD00]/10 text-gray-600 hover:text-[#FFDD00] rounded-lg transition-all" style={{ border: 'none', outline: 'none' }}><Plus size={18}/></button>
            <button onClick={() => adjustFontSize(-1)} className="p-1 bg-gray-50 hover:bg-[#FFDD00]/10 text-gray-600 hover:text-[#FFDD00] rounded-lg transition-all" style={{ border: 'none', outline: 'none' }}><Minus size={18}/></button>
            <div className="w-px h-6 bg-gray-200 mx-1"></div>
            <button onClick={() => setIsBold(!isBold)} className={`p-1 rounded-lg transition-all ${isBold ? 'bg-[#FFDD00] text-yellow-900' : 'bg-gray-50 hover:bg-[#FFDD00]/10 text-gray-600'}`} style={{ border: 'none', outline: 'none' }}><Bold size={18}/></button>
          </div>
        </div>
        
        <div className={`flex flex-col flex-1 h-full ${isSketching ? 'invisible' : ''}`} style={isTextMode ? { backgroundColor: 'transparent', zIndex: 10 } : { zIndex: 10 }}>
            {/* Header - 中间层 z-10（继承父容器） */}
            <div className={`flex justify-between items-start ${isTextMode ? 'hidden' : 'p-4 pb-2'} relative flex-shrink-0 ${isTextMode ? 'opacity-0 hover:opacity-100 transition-opacity' : ''}`} style={isTextMode ? { backgroundColor: 'transparent' } : {}}>
                {!isTextMode && !isCompactMode ? (
                  <div className="relative">
                    <button 
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className="text-5xl hover:scale-110 transition-transform cursor-pointer leading-none"
                    >
                      {emoji}
                    </button>
                    {showEmojiPicker && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowEmojiPicker(false)} />
                        <div className="absolute top-full left-0 mt-2 p-2 bg-white rounded-xl shadow-xl grid grid-cols-5 gap-1 w-64 z-20" style={{ border: 'none' }}>
                          {EMOJI_LIST.map(e => (
                            <button 
                              key={e} 
                              onClick={() => { setEmoji(e); setShowEmojiPicker(false); }}
                              className="text-2xl p-2 hover:bg-[#FFDD00]/10 rounded-lg transition-colors"
                            >
                              {e}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                    <div className="text-gray-400 font-bold text-sm tracking-wider uppercase">
                        {isTextMode ? '' : 'Sticky Note'}
                    </div>
                )}
                
                <div className="flex items-center gap-2">
                    {initialNote?.id && onDelete && (
                        <button 
                            onClick={handleDelete}
                            className="text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full p-1 transition-colors active:scale-90"
                        >
                            <Trash2 size={24} />
                        </button>
                    )}
                <button 
                    onClick={handleSave} 
                        className="text-gray-400 hover:text-gray-600 hover:bg-black/5 rounded-full p-1 transition-colors active:scale-90"
                >
                    <Check size={28} />
                </button>
                </div>
            </div>

            {/* Auto-Growing Text Area Container */}
            <div className={`flex-1 ${isTextMode ? 'px-2 py-2' : 'px-3'} relative group flex flex-col ${isTextMode ? 'overflow-hidden' : 'overflow-y-auto custom-scrollbar'} ${isTextMode ? 'min-h-0' : 'min-h-[120px]'}`} style={isTextMode ? { backgroundColor: 'transparent' } : {}}>
              <div className="grid w-full min-w-0" style={isTextMode ? { backgroundColor: 'transparent' } : {}}>
                {/* Invisible Pre-wrap div to force height */}
                <div 
                  className={`col-start-1 row-start-1 w-full min-w-0 ${isTextMode ? 'whitespace-nowrap' : 'whitespace-pre-wrap break-words'} invisible leading-none ${isTextMode ? 'pb-0' : 'pb-4'} ${getTextStyles()}`}
                  aria-hidden="true"
                >
                   {text + ' '}
                </div>

                {/* Actual Textarea */}
                <textarea
                    autoFocus={isTextMode}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={isTextMode ? "Type something..." : "Write here..."}
                    className={`col-start-1 row-start-1 w-full min-w-0 h-full bg-transparent border-none resize-none focus:ring-0 p-0 ${isTextMode ? 'text-gray-800' : 'text-gray-800'} placeholder-gray-500/30 leading-none overflow-hidden ${isTextMode ? 'whitespace-nowrap' : 'break-words whitespace-pre-wrap'} ${isTextMode ? 'pb-0' : 'pb-4'} ${getTextStyles()}`}
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
            {!isTextMode && (
              <div className="flex flex-col z-10 backdrop-blur-[2px] mt-auto flex-shrink-0">
                
                {/* Media Row */}
                {!isCompactMode && (
                  <div className="px-3 pt-1 flex gap-3">
                      <label className="w-20 h-20 bg-white/60 hover:bg-white shadow-sm rounded-2xl flex items-center justify-center cursor-pointer transition-colors relative overflow-hidden group" style={{ border: 'none' }}>
                          {images.length > 0 ? (
                              <img src={images[images.length - 1]} className="w-full h-full object-cover" />
                          ) : <Camera size={24} className="text-gray-500"/>}
                          <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                          {images.length > 0 && <button onClick={removeImage} className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X size={12}/></button>}
                      </label>
                      <button 
                        onClick={() => setIsSketching(true)}
                        className="w-20 h-20 bg-white/60 hover:bg-white shadow-sm rounded-2xl flex items-center justify-center transition-colors relative overflow-hidden group"
                        style={{ border: 'none' }}
                      >
                          {sketch ? (
                              <img src={sketch} className="w-full h-full object-cover" />
                          ) : <PenTool size={24} className="text-gray-500"/>}
                          {sketch && <div onClick={(e) => {e.stopPropagation(); removeSketch(e)}} className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X size={12}/></div>}
                      </button>
                  </div>
                )}

                {/* Tags Row */}
                {!isCompactMode && (
                    <div className="px-3 pt-2 pb-2 flex-1 flex gap-2 overflow-x-auto scrollbar-hide items-center min-h-[50px]">
                        {tags.map(tag => (
                            <span key={tag.id} className="flex-shrink-0 h-6 px-2.5 rounded-full text-xs font-bold text-white shadow-sm flex items-center gap-1" style={{backgroundColor: tag.color}}>
                                {tag.label}
                                <button onClick={() => removeTag(tag.id)}><X size={10}/></button>
                            </span>
                        ))}
                        {isAddingTag ? (
                            <div className="flex items-center gap-1 bg-white rounded-full shadow-sm p-1 pr-2 h-10 animate-in fade-in slide-in-from-left-2" style={{ border: 'none' }}>
                            <input 
                                autoFocus
                                className="w-16 text-sm bg-transparent outline-none ml-2 text-gray-700 placeholder-gray-400"
                                placeholder="Tag name..."
                                value={newTagLabel}
                                onChange={(e) => setNewTagLabel(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSaveTag()}
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
                            <button onClick={() => setIsAddingTag(true)} className="flex-shrink-0 h-10 px-4 bg-white/60 hover:bg-white rounded-full text-xs font-bold text-gray-500 shadow-sm flex items-center transition-all" style={{ border: 'none' }}>
                                + Tag
                            </button>
                        )}
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
    </div>
  );
};

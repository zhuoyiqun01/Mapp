
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
    // Sync with BoardView rendering
    if (isTextMode) {
         // Text Note Scale: 3.2rem - 10rem (Aligned with sticky notes)
         const sizeMap: Record<number, string> = {
            1: 'text-[3.2rem]', 
            2: 'text-[4.8rem]', 
            3: 'text-[6.4rem]', 
            4: 'text-[8rem]', 
            5: 'text-[10rem]', 
         };
         return `${sizeMap[fontSize] || 'text-[6.4rem]'} ${isBold ? 'font-black' : 'font-medium'}`;
    }

    // Sticky/Standard Note Scale: 3.2rem - 7.2rem on Board
    const sizeMap: Record<number, string> = {
      1: 'text-[3.2rem]',
      2: 'text-[4rem]',
      3: 'text-[5rem]',
      4: 'text-[6rem]',
      5: 'text-[7.2rem]',
    };
    return `${sizeMap[fontSize] || 'text-[5rem]'} ${isBold ? 'font-black' : 'font-medium'}`;
  };

  const adjustFontSize = (delta: number) => {
    setFontSize(prev => Math.max(1, Math.min(5, prev + delta)));
  };

  if (!isOpen) return null;

  return (
    <div 
      className={`fixed inset-0 z-[1000] flex items-center justify-center p-4 touch-none backdrop-blur-sm ${isTextMode ? '' : 'bg-black/30'}`}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-0" onClick={handleSave}></div>
      
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        // Explicit width w-[500px] to prevent auto-growing behavior. min-h-[500px] added when sketching to ensure full canvas.
        className={`w-[500px] max-w-[95vw] flex flex-col relative z-10 transition-colors duration-300 max-h-[90vh] ${isTextMode ? 'min-h-0' : 'shadow-2xl rounded-3xl overflow-hidden min-h-[300px]'} ${isSketching ? 'min-h-[500px]' : ''}`}
        style={{ 
            backgroundColor: isTextMode ? 'transparent' : color,
            boxShadow: isTextMode ? 'none' : '0 25px 50px 12px rgba(0, 0, 0, 0.15)' 
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
        
        <div className={`flex flex-col flex-1 h-full ${isSketching ? 'invisible' : ''}`}>
            {/* Header */}
            <div className={`flex justify-between items-start p-6 pb-2 relative z-20 flex-shrink-0 ${isTextMode ? 'opacity-0 hover:opacity-100 transition-opacity' : ''}`}>
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
                        <div className="absolute top-full left-0 mt-2 p-2 bg-white rounded-xl shadow-xl grid grid-cols-5 gap-1 w-64 z-20 border border-gray-100">
                          {EMOJI_LIST.map(e => (
                            <button 
                              key={e} 
                              onClick={() => { setEmoji(e); setShowEmojiPicker(false); }}
                              className="text-2xl p-2 hover:bg-yellow-50 rounded-lg transition-colors"
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
                
                <button 
                    onClick={handleSave} 
                    className="text-gray-400 hover:text-gray-600 hover:bg-black/5 rounded-full p-2 transition-colors active:scale-90"
                >
                    <Check size={28} />
                </button>
            </div>

            {/* Auto-Growing Text Area Container */}
            <div className={`flex-1 ${isTextMode ? 'px-2' : 'px-6'} relative group flex flex-col overflow-y-auto custom-scrollbar ${isTextMode ? 'min-h-0' : 'min-h-[120px]'}`}>
              <div className="grid w-full min-w-0">
                {/* Invisible Pre-wrap div to force height */}
                <div 
                  className={`col-start-1 row-start-1 w-full min-w-0 whitespace-pre-wrap break-words invisible leading-none ${isTextMode ? 'pb-0' : 'pb-4'} ${getTextStyles()}`}
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
                    className={`col-start-1 row-start-1 w-full min-w-0 h-full bg-transparent border-none resize-none focus:ring-0 p-0 text-gray-800 placeholder-gray-500/30 leading-none overflow-hidden break-words whitespace-pre-wrap ${isTextMode ? 'pb-0' : 'pb-4'} ${getTextStyles()}`}
                    spellCheck={false}
                />
              </div>
              
              {/* Floating Text Controls */}
              <div className="absolute top-0 right-4 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-30">
                  <button onClick={() => adjustFontSize(1)} className="p-1.5 bg-white/60 hover:bg-white text-gray-600 hover:text-yellow-600 rounded-lg shadow-sm backdrop-blur-sm transition-all"><Plus size={16}/></button>
                  <button onClick={() => adjustFontSize(-1)} className="p-1.5 bg-white/60 hover:bg-white text-gray-600 hover:text-yellow-600 rounded-lg shadow-sm backdrop-blur-sm transition-all"><Minus size={16}/></button>
                  <button onClick={() => setIsBold(!isBold)} className={`p-1.5 rounded-lg shadow-sm backdrop-blur-sm transition-colors ${isBold ? 'bg-yellow-400 text-yellow-900' : 'bg-white/60 hover:bg-white text-gray-600'}`}><Bold size={16}/></button>
              </div>
            </div>

            {/* Footer Actions */}
            {!isTextMode && (
              <div className="flex flex-col z-10 backdrop-blur-[2px] mt-auto flex-shrink-0">
                
                {/* Media Row */}
                {!isCompactMode && (
                  <div className="px-5 pt-2 flex gap-3">
                      <label className="w-20 h-20 bg-white/60 hover:bg-white shadow-sm rounded-2xl flex items-center justify-center cursor-pointer transition-colors relative overflow-hidden group">
                          {images.length > 0 ? (
                              <img src={images[images.length - 1]} className="w-full h-full object-cover" />
                          ) : <Camera size={24} className="text-gray-500"/>}
                          <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                          {images.length > 0 && <button onClick={removeImage} className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X size={12}/></button>}
                      </label>
                      <button 
                        onClick={() => setIsSketching(true)}
                        className="w-20 h-20 bg-white/60 hover:bg-white shadow-sm rounded-2xl flex items-center justify-center transition-colors relative overflow-hidden group"
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
                    <div className="px-5 pt-3 pb-2 flex-1 flex gap-2 overflow-x-auto scrollbar-hide items-center min-h-[50px]">
                        {tags.map(tag => (
                            <span key={tag.id} className="flex-shrink-0 h-6 px-2.5 rounded-full text-xs font-bold text-white shadow-sm flex items-center gap-1" style={{backgroundColor: tag.color}}>
                                {tag.label}
                                <button onClick={() => removeTag(tag.id)}><X size={10}/></button>
                            </span>
                        ))}
                        {isAddingTag ? (
                            <div className="flex items-center gap-1 bg-white rounded-full shadow-sm p-1 pr-2 h-10 animate-in fade-in slide-in-from-left-2 border border-gray-100">
                            <input 
                                autoFocus
                                className="w-28 text-sm bg-transparent outline-none ml-2 text-gray-700 placeholder-gray-400"
                                placeholder="Tag name..."
                                value={newTagLabel}
                                onChange={(e) => setNewTagLabel(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSaveTag()}
                            />
                            <div className="flex gap-1 border-l border-gray-100 pl-2">
                                {TAG_COLORS.slice(0,7).map(c => (
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
                            <button onClick={() => setIsAddingTag(true)} className="flex-shrink-0 h-10 px-4 bg-white/60 hover:bg-white rounded-full text-xs font-bold text-gray-500 border border-gray-200/50 shadow-sm flex items-center transition-all">
                                + Tag
                            </button>
                        )}
                    </div>
                )}

                <div className="h-px w-full mt-2 bg-black/5"></div>

                {/* Color & Delete Row */}
                <div className="px-5 py-3 flex justify-between items-center">
                    <div className="flex gap-2">
                        {PASTEL_COLORS.map(c => (
                            <button
                                key={c}
                                onClick={() => setColor(c)}
                                className={`w-6 h-6 rounded-full border border-black/5 shadow-sm transition-transform ${color === c ? 'scale-125 ring-2 ring-gray-400 ring-offset-1' : 'hover:scale-110'}`}
                                style={{ backgroundColor: c }}
                            />
                        ))}
                    </div>

                    {initialNote?.id && onDelete && (
                        <button 
                            onClick={handleDelete}
                            className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors active:scale-90 active:bg-red-100"
                        >
                            <Trash2 size={20} />
                        </button>
                    )}
                </div>
              </div>
            )}
            
            {/* Simple Delete for Text Mode */}
            {isTextMode && initialNote?.id && onDelete && (
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                        onClick={handleDelete}
                        className="text-red-400 hover:text-red-600 bg-white/50 hover:bg-red-50 p-2 rounded-full transition-colors active:scale-90"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            )}
        </div>
      </motion.div>
    </div>
  );
};

import React, { useRef, useState, useEffect } from 'react';
import { Note } from '../types';
import { motion } from 'framer-motion';
import { NoteEditor } from './NoteEditor';
import { ZoomSlider } from './ZoomSlider';
import { Type, StickyNote, X, Pencil, Check } from 'lucide-react';
import { generateId } from '../utils';

interface BoardViewProps {
  notes: Note[];
  onUpdateNote: (note: Note) => void;
  onToggleEditor: (isOpen: boolean) => void;
  onAddNote?: (note: Note) => void; 
  onDeleteNote?: (noteId: string) => void;
  onEditModeChange?: (isEdit: boolean) => void;
}

export const BoardView: React.FC<BoardViewProps> = ({ notes, onUpdateNote, onToggleEditor, onAddNote, onDeleteNote, onEditModeChange }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  
  // Canvas Viewport State
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  
  // Edit Mode State
  const [isEditMode, setIsEditMode] = useState(false);
  
  // Dragging State
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 }); 
  const lastMousePos = useRef<{ x: number, y: number } | null>(null);

  useEffect(() => {
    onEditModeChange?.(isEditMode);
  }, [isEditMode, onEditModeChange]);

  // Zoom to Fit on Enter Edit Mode
  useEffect(() => {
    if (isEditMode && notes.length > 0 && containerRef.current) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        notes.forEach(note => {
            minX = Math.min(minX, note.boardX);
            minY = Math.min(minY, note.boardY);
            const w = note.variant === 'text' ? 500 : note.variant === 'compact' ? 180 : 256;
            const h = note.variant === 'text' ? 100 : note.variant === 'compact' ? 180 : 256;
            maxX = Math.max(maxX, note.boardX + w);
            maxY = Math.max(maxY, note.boardY + h);
        });

        const padding = 100;
        minX -= padding; minY -= padding;
        maxX += padding; maxY += padding;
        const contentWidth = maxX - minX;
        const contentHeight = maxY - minY;
        const { width: cW, height: cH } = containerRef.current.getBoundingClientRect();

        const scaleX = cW / contentWidth;
        const scaleY = cH / contentHeight;
        const newScale = Math.min(Math.max(0.5, Math.min(scaleX, scaleY)), 2); 

        const newX = (cW - contentWidth * newScale) / 2 - minX * newScale;
        const newY = (cH - contentHeight * newScale) / 2 - minY * newScale;

        setTransform({ x: newX, y: newY, scale: newScale });
    }
  }, [isEditMode, notes]);

  const closeEditor = () => {
    setEditingNote(null);
    onToggleEditor(false);
  };

  const createNoteAtCenter = (variant: 'text' | 'compact') => {
     if (!containerRef.current) return;
     const { width, height } = containerRef.current.getBoundingClientRect();
     
     // Base center in world coordinates
     const centerX = (width / 2 - transform.x) / transform.scale;
     const centerY = (height / 2 - transform.y) / transform.scale;

     let spawnX = centerX - (variant === 'compact' ? 90 : 250);
     let spawnY = centerY - (variant === 'compact' ? 90 : 50);

     if (notes.length > 0) {
        const lastNote = [...notes].sort((a,b) => b.createdAt - a.createdAt)[0];
        if (lastNote) {
            spawnX = lastNote.boardX + 30;
            spawnY = lastNote.boardY + 30;
        }
     }

     const newNote: Note = {
         id: generateId(),
         createdAt: Date.now(),
         coords: { lat: 0, lng: 0 },
         emoji: '', // No emoji for board notes
         text: '',
         fontSize: 3,
         images: [],
         tags: [],
         boardX: spawnX, 
         boardY: spawnY,
         variant: variant,
         color: '#FFFDF5'
     };
     setEditingNote(newNote);
     onToggleEditor(true);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const zoomSensitivity = 0.001;
        const delta = -e.deltaY * zoomSensitivity;
        const newScale = Math.min(Math.max(0.2, transform.scale + delta), 4);
        setTransform(prev => ({ ...prev, scale: newScale }));
    } else {
        setTransform(prev => ({
            ...prev,
            x: prev.x - e.deltaX,
            y: prev.y - e.deltaY
        }));
    }
  };

  const handleBoardPointerDown = (e: React.PointerEvent) => {
      if (e.button === 0 && !draggingNoteId) { 
          setIsPanning(true);
          lastMousePos.current = { x: e.clientX, y: e.clientY };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }
  };

  const handleBoardPointerMove = (e: React.PointerEvent) => {
      if (!isPanning || !lastMousePos.current) return;
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleBoardPointerUp = (e: React.PointerEvent) => {
      if (isPanning) {
          setIsPanning(false);
          lastMousePos.current = null;
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      }
  };

  const handleNotePointerDown = (e: React.PointerEvent, noteId: string) => {
      e.stopPropagation();
      
      if (!isEditMode) return; 

      e.preventDefault();
      setDraggingNoteId(noteId);
      setDragOffset({ x: 0, y: 0 });
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleNotePointerMove = (e: React.PointerEvent) => {
      if (!draggingNoteId || !lastMousePos.current) return;
      e.stopPropagation();
      
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      const worldDx = dx / transform.scale;
      const worldDy = dy / transform.scale;

      setDragOffset(prev => ({ x: prev.x + worldDx, y: prev.y + worldDy }));
      lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleNotePointerUp = (e: React.PointerEvent, note: Note) => {
      if (draggingNoteId === note.id) {
          e.stopPropagation();
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

          if (dragOffset.x !== 0 || dragOffset.y !== 0) {
              onUpdateNote({
                  ...note,
                  boardX: note.boardX + dragOffset.x,
                  boardY: note.boardY + dragOffset.y
              });
          }
          setDraggingNoteId(null);
          setDragOffset({ x: 0, y: 0 });
          lastMousePos.current = null;
      }
  };

  const handleNoteClick = (e: React.MouseEvent, note: Note) => {
      e.stopPropagation(); 
      if (!isEditMode) {
        setEditingNote(note);
        onToggleEditor(true);
      }
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      // Directly delete without confirmation as requested
      onDeleteNote?.(id);
  };

  // Visuals
  const gridSize = 40 * transform.scale;
  const dotSize = 3 * transform.scale;

  return (
    <motion.div 
        id="board-view-container"
        layout
        className={`w-full h-full relative overflow-hidden transition-all duration-300`}
        style={{
            boxShadow: isEditMode 
                ? 'inset 0 0 0 6px #FACC15, inset 0 0 60px rgba(250,204,21,0.5)' 
                : 'none'
        }}
    >
      <div 
        ref={containerRef}
        className={`w-full h-full overflow-hidden bg-gray-50 relative touch-none select-none ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
        onWheel={handleWheel}
        onPointerDown={handleBoardPointerDown}
        onPointerMove={handleBoardPointerMove}
        onPointerUp={handleBoardPointerUp}
      >
        {/* Background */}
        <div 
          className="absolute inset-0 pointer-events-none z-0"
          style={{
              backgroundImage: `radial-gradient(#FDE047 ${dotSize}px, transparent ${dotSize + 0.5}px)`,
              backgroundPosition: `${transform.x}px ${transform.y}px`,
              backgroundSize: `${gridSize}px ${gridSize}px`,
              opacity: 0.8
          }}
        />

        {/* Canvas Content */}
        <div 
          className="absolute top-0 left-0 w-full h-full origin-top-left pointer-events-none"
          style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}
        >
          {notes.map((note) => {
              const isDragging = draggingNoteId === note.id;
              const currentX = note.boardX + (isDragging ? dragOffset.x : 0);
              const currentY = note.boardY + (isDragging ? dragOffset.y : 0);
              
              const isText = note.variant === 'text';
              const isCompact = note.variant === 'compact';

              const noteWidth = isText ? '500px' : isCompact ? '180px' : '256px';
              const noteHeight = isText ? 'auto' : isCompact ? '180px' : '256px';

              // Determine line clamp based on font size to ensure it fits the box
              // Compact/Standard notes have fixed height.
              let clampClass = '';
              if (!isText) {
                  if (note.fontSize >= 4) clampClass = 'line-clamp-1';
                  else if (note.fontSize === 3) clampClass = 'line-clamp-2';
                  else if (note.fontSize === 2) clampClass = 'line-clamp-3';
                  else clampClass = 'line-clamp-4';
              }

              return (
                <motion.div
                  key={note.id}
                  initial={false}
                  style={{ 
                      position: 'absolute', 
                      left: currentX, 
                      top: currentY,
                      zIndex: isDragging ? 100 : 1,
                      width: noteWidth,
                      height: noteHeight,
                  }}
                  className={`pointer-events-auto ${isEditMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer hover:scale-105 transition-transform'}`}
                  onPointerDown={(e) => handleNotePointerDown(e, note.id)}
                  onPointerMove={handleNotePointerMove}
                  onPointerUp={(e) => handleNotePointerUp(e, note)}
                  onClick={(e) => handleNoteClick(e, note)}
                >
                  {isEditMode && (
                      <button 
                        onClick={(e) => handleDeleteClick(e, note.id)}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="absolute -top-3 -right-3 z-50 bg-red-500 text-white rounded-full p-1.5 shadow-md hover:scale-110 transition-transform"
                      >
                        <X size={14} />
                      </button>
                  )}

                  {isText ? (
                      <div className={`p-2 rounded-lg border-2 ${isDragging ? 'border-yellow-400 bg-white shadow-lg' : 'border-transparent'}`}>
                          <p 
                            className={`text-gray-800 leading-none whitespace-pre-wrap break-words ${note.isBold ? 'font-bold' : 'font-medium'}`} 
                            style={{ 
                              // Text Note: 3.2rem - 10rem (Aligned better with sticky notes)
                              fontSize: note.fontSize === 1 ? '3.2rem' : note.fontSize === 2 ? '4.8rem' : note.fontSize === 3 ? '6.4rem' : note.fontSize === 4 ? '8rem' : '10rem',
                              textShadow: '0 2px 4px rgba(0,0,0,0.05)'
                            }}
                          >
                              {note.text}
                          </p>
                      </div>
                  ) : (
                      <div 
                          className={`w-full h-full shadow-xl flex flex-col overflow-hidden group rounded-sm transition-shadow ${isDragging ? 'shadow-2xl ring-4 ring-yellow-400' : ''}`}
                          style={{
                              transform: `rotate(${(parseInt(note.id.slice(-2), 36) % 6) - 3}deg)`,
                              backgroundColor: note.color || '#FFFDF5'
                          }}
                      >
                          <div className={`w-full h-full flex flex-col relative ${isCompact ? 'p-4 gap-1' : 'p-6 gap-2'}`}>
                              {!isCompact && (note.sketch || (note.images && note.images.length > 0)) && (
                                  <div className="absolute inset-0 opacity-20 pointer-events-none z-0">
                                      <img 
                                          src={note.sketch || note.images[0]} 
                                          className="w-full h-full object-cover grayscale opacity-50" 
                                          alt="bg" 
                                      />
                                  </div>
                              )}
                              <div className="relative z-10 pointer-events-none flex flex-col h-full">
                                  {!isCompact && <div className={`${isCompact ? 'text-2xl mb-1' : 'text-3xl mb-2'} drop-shadow-sm`}>{note.emoji}</div>}
                                  <p 
                                    className={`text-gray-800 leading-none flex-1 overflow-hidden break-words ${clampClass} ${note.isBold ? 'font-bold' : 'font-medium'}`} 
                                    style={{ 
                                        // Sticky Note: 3.2rem to 7.2rem (Doubled)
                                        fontSize: note.fontSize === 1 ? '3.2rem' : note.fontSize === 2 ? '4rem' : note.fontSize === 3 ? '5rem' : note.fontSize === 4 ? '6rem' : '7.2rem'
                                    }}
                                  >
                                      {note.text || <span className="text-gray-400 italic font-normal text-base">Empty...</span>}
                                  </p>
                                  {!isCompact && (
                                    <div className="mt-auto flex flex-wrap gap-1">
                                        {note.tags.map(t => (
                                            <span key={t.id} className="text-[9px] px-1.5 py-0.5 rounded-full text-white font-bold tracking-wide shadow-sm" style={{ backgroundColor: t.color }}>#{t.label}</span>
                                        ))}
                                    </div>
                                  )}
                              </div>
                          </div>
                      </div>
                  )}
                </motion.div>
              );
          })}
        </div>

        {/* ZoomSlider - Always Visible */}
        <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute bottom-24 left-4 z-[500] pointer-events-auto"
          >
            <ZoomSlider value={transform.scale} min={0.2} max={3.0} step={0.1} onChange={(val) => setTransform(prev => ({ ...prev, scale: val }))} />
        </motion.div>

        <div className="absolute top-8 right-8 z-[500] flex gap-3 pointer-events-auto" onPointerDown={(e) => e.stopPropagation()}>
          {isEditMode ? (
              <button onClick={() => setIsEditMode(false)} className="flex items-center gap-2 px-6 py-2 bg-yellow-400 text-yellow-950 rounded-xl shadow-lg hover:bg-yellow-300 font-bold">
                  <Check size={18} /> Done
              </button>
          ) : (
              <button onClick={() => setIsEditMode(true)} className="flex items-center gap-2 px-6 py-2 bg-white text-gray-700 rounded-xl shadow-lg hover:bg-gray-50 font-bold border border-gray-100">
                  <Pencil size={18} /> Edit
              </button>
          )}
        </div>

        {/* Edit Toolbar: Unified White Buttons at Top Left */}
        {isEditMode && (
            <div 
                className="absolute top-8 left-8 z-[500] pointer-events-auto animate-in slide-in-from-left-4 fade-in"
                onPointerDown={(e) => e.stopPropagation()} 
            >
                <div className="bg-white p-1.5 rounded-xl shadow-lg border border-gray-100 flex gap-2">
                    <button
                        onClick={() => createNoteAtCenter('text')}
                        className="w-12 h-12 rounded-lg bg-gray-50 hover:bg-yellow-50 text-gray-700 hover:text-yellow-700 flex items-center justify-center transition-colors active:scale-95"
                        title="Add Text"
                    >
                        <Type size={24} />
                    </button>
                    <button
                        onClick={() => createNoteAtCenter('compact')}
                        className="w-12 h-12 rounded-lg bg-gray-50 hover:bg-yellow-50 text-gray-700 hover:text-yellow-700 flex items-center justify-center transition-colors active:scale-95"
                        title="Add Sticky Note"
                    >
                        <StickyNote size={24} />
                    </button>
                </div>
            </div>
        )}

        {editingNote && (
          <NoteEditor 
              isOpen={!!editingNote}
              onClose={closeEditor}
              initialNote={editingNote}
              onDelete={onDeleteNote}
              onSave={(updated) => {
                  if (!updated.text && updated.variant === 'text') return;
                  if (updated.id && notes.some(n => n.id === updated.id)) {
                      onUpdateNote(updated as Note);
                  } else if (onAddNote && updated.id) {
                      onAddNote(updated as Note);
                  }
              }}
          />
        )}
      </div>
    </motion.div>
  );
};
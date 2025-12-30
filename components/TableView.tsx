import React, { useState, useMemo } from 'react';
import { Note, Project, Frame } from '../types';
import { GripVertical, Edit2, Check, Plus, X, ExternalLink } from 'lucide-react';
import { TAG_COLORS } from '../constants';
import { generateId } from '../utils';
import { NoteEditor } from './NoteEditor';

interface TableViewProps {
  project: Project;
  onUpdateNote: (note: Note) => void;
  onUpdateFrames?: (frames: Frame[]) => void;
  onSwitchToBoardView?: (coords?: { x: number; y: number }) => void;
  themeColor: string;
}

export const TableView: React.FC<TableViewProps> = ({ project, onUpdateNote, onUpdateFrames, onSwitchToBoardView, themeColor }) => {
  const [tableLevel, setTableLevel] = useState<'Primary' | 'Secondary'>('Primary');
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [draggedOverGroup, setDraggedOverGroup] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [editingFrameId, setEditingFrameId] = useState<string | null>(null);
  const [editingFrameName, setEditingFrameName] = useState('');
  const [addingTagNoteId, setAddingTagNoteId] = useState<string | null>(null);
  const [editingTagId, setEditingTagId] = useState<{ noteId: string; tagId: string } | null>(null);
  const [newTagLabel, setNewTagLabel] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [editorNoteId, setEditorNoteId] = useState<string | null>(null);

  // Only show standard notes (exclude compact and image)
  const standardNotes = useMemo(() => 
    project.notes.filter(note => note.variant === 'standard'),
    [project.notes]
  );

  // Compact notes
  const compactNotes = useMemo(() => 
    project.notes.filter(note => note.variant === 'compact'),
    [project.notes]
  );

  // Group compact notes
  const groupedCompactNotes = useMemo(() => {
    const groups: { [key: string]: { notes: Note[], frameId?: string } } = {};
    
    compactNotes.forEach(note => {
      const groupName = note.groupName || 'Ungrouped';
      if (!groups[groupName]) {
        groups[groupName] = { notes: [], frameId: note.groupId };
      }
      groups[groupName].notes.push(note);
    });
    
    // Sort by creation time
    Object.keys(groups).forEach(key => {
      groups[key].notes.sort((a, b) => a.createdAt - b.createdAt);
    });
    
    // Put ungrouped first
    const sortedGroupNames = Object.keys(groups).sort((a, b) => {
      if (a === 'Ungrouped') return -1;
      if (b === 'Ungrouped') return 1;
      return 0;
    });
    
    return sortedGroupNames.map(name => ({
      name,
      notes: groups[name].notes,
      frameId: groups[name].frameId
    }));
  }, [compactNotes]);

  // Group notes (支持多frame归属，一个note可以出现在多个分组中)
  const groupedNotes = useMemo(() => {
    const groups: { [key: string]: { notes: Note[], frameId?: string } } = {};
    
    standardNotes.forEach(note => {
      // 获取所有frame名称（支持多frame）
      const groupNames = note.groupNames || (note.groupName ? [note.groupName] : []);
      const groupIds = note.groupIds || (note.groupId ? [note.groupId] : []);
      
      if (groupNames.length > 0) {
        // 将note添加到所有相关的分组中
        // 确保groupIds和groupNames长度一致，取较小值避免索引越界
        const minLength = Math.min(groupNames.length, groupIds.length);
        for (let index = 0; index < minLength; index++) {
          const groupName = groupNames[index];
          const frameId = groupIds[index];
          if (!groups[groupName]) {
            groups[groupName] = { notes: [], frameId: frameId };
          }
          // 检查是否已经添加过（避免重复）
          if (!groups[groupName].notes.find(n => n.id === note.id)) {
            groups[groupName].notes.push(note);
          }
        }
      } else {
        // Ungrouped notes
        const groupName = 'Ungrouped';
        if (!groups[groupName]) {
          groups[groupName] = { notes: [], frameId: undefined };
        }
        groups[groupName].notes.push(note);
      }
    });
    
    // Sort by creation time
    Object.keys(groups).forEach(key => {
      groups[key].notes.sort((a, b) => a.createdAt - b.createdAt);
    });
    
    // Put ungrouped first
    const sortedGroupNames = Object.keys(groups).sort((a, b) => {
      if (a === 'Ungrouped') return -1;
      if (b === 'Ungrouped') return 1;
      return 0;
    });
    
    return sortedGroupNames.map(name => ({
      name,
      notes: groups[name].notes,
      frameId: groups[name].frameId
    }));
  }, [standardNotes]);

  const handleDragStart = (e: React.DragEvent, noteId: string) => {
    setDraggedNoteId(noteId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, groupName: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDraggedOverGroup(groupName);
  };

  const handleDrop = (e: React.DragEvent, groupName: string, targetIndex: number) => {
    e.preventDefault();
    if (!draggedNoteId) return;
    
    const draggedNote = standardNotes.find(n => n.id === draggedNoteId);
    if (!draggedNote) return;
    
    const targetGroup = groupedNotes.find(g => g.name === groupName);
    if (!targetGroup) return;
    
    // Reorder within the same group
    if (draggedNote.groupName === groupName || (!draggedNote.groupName && groupName === 'Ungrouped')) {
      const groupNotes = targetGroup.notes;
      const currentIndex = groupNotes.findIndex(n => n.id === draggedNoteId);
      
      if (currentIndex !== -1 && currentIndex !== targetIndex) {
        // Recalculate createdAt to adjust order
        const sortedNotes = [...groupNotes];
        const [removed] = sortedNotes.splice(currentIndex, 1);
        sortedNotes.splice(targetIndex, 0, removed);
        
        // Update createdAt for all affected notes
        sortedNotes.forEach((note, index) => {
          onUpdateNote({ ...note, createdAt: Date.now() + index });
        });
      }
    }
    
    setDraggedNoteId(null);
    setDraggedOverGroup(null);
  };

  const handleTextEdit = (note: Note) => {
    setEditingNoteId(note.id);
    setEditingText(note.text);
  };

  const handleTextSave = (note: Note) => {
    onUpdateNote({ ...note, text: editingText });
    setEditingNoteId(null);
  };

  const handleFrameEdit = (frameId: string, frameName: string) => {
    setEditingFrameId(frameId);
    setEditingFrameName(frameName);
  };

  const handleFrameSave = () => {
    if (!editingFrameId || !onUpdateFrames || !project.frames) return;
    
    const updatedFrames = project.frames.map(frame => 
      frame.id === editingFrameId ? { ...frame, title: editingFrameName } : frame
    );
    
    onUpdateFrames(updatedFrames);
    
    // Update groupName for all notes in this Frame
    const notesToUpdate = standardNotes.filter(note => note.groupId === editingFrameId);
    notesToUpdate.forEach(note => {
      onUpdateNote({ ...note, groupName: editingFrameName });
    });
    
    setEditingFrameId(null);
  };

  const handleAddTag = (note: Note) => {
    if (!newTagLabel.trim()) {
      // If no text entered, cancel adding
      setNewTagLabel('');
      setNewTagColor(TAG_COLORS[0]);
      setAddingTagNoteId(null);
      setEditingTagId(null);
      return;
    }
    
    if (editingTagId && editingTagId.noteId === note.id) {
      // Update existing tag
      const updatedTags = note.tags.map(t => 
        t.id === editingTagId.tagId 
          ? { ...t, label: newTagLabel.trim(), color: newTagColor }
          : t
      );
      onUpdateNote({ ...note, tags: updatedTags });
      setEditingTagId(null);
    } else {
      // Create new tag
      const newTag = {
        id: generateId(),
        label: newTagLabel.trim(),
        color: newTagColor
      };
      onUpdateNote({ ...note, tags: [...note.tags, newTag] });
    }
    
    setNewTagLabel('');
    setNewTagColor(TAG_COLORS[0]);
    setAddingTagNoteId(null);
  };

  const handleEditTag = (note: Note, tagId: string) => {
    const tag = note.tags.find(t => t.id === tagId);
    if (tag) {
      setEditingTagId({ noteId: note.id, tagId: tag.id });
      setNewTagLabel(tag.label);
      setNewTagColor(tag.color);
      setAddingTagNoteId(null);
    }
  };

  const handleCancelTagEdit = () => {
    setNewTagLabel('');
    setNewTagColor(TAG_COLORS[0]);
    setAddingTagNoteId(null);
    setEditingTagId(null);
  };

  const handleRemoveTag = (note: Note, tagId: string) => {
    onUpdateNote({ ...note, tags: note.tags.filter(t => t.id !== tagId) });
  };

  return (
    <div className="h-full bg-gray-50 flex flex-col">
        {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-900">Table</h1>
        </div>
          
          {/* Table level toggle */}
        <div className="flex gap-1 rounded-lg p-0.5">
            <button
              onClick={() => setTableLevel('Primary')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                tableLevel === 'Primary'
                ? 'text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            style={tableLevel === 'Primary' ? { backgroundColor: themeColor } : undefined}
            >
              Primary ({standardNotes.length})
            </button>
            <button
              onClick={() => setTableLevel('Secondary')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                tableLevel === 'Secondary'
                ? 'text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            style={tableLevel === 'Secondary' ? { backgroundColor: themeColor } : undefined}
            >
              Secondary ({compactNotes.length})
            </button>
          </div>
        </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {tableLevel === 'Primary' ? (
          // Primary table: standard notes
          groupedNotes.map((group) => (
          <div key={group.name} className="mb-8">
            <h3 className="text-base font-bold text-gray-700 mb-3 flex items-center gap-2">
              {editingFrameId === group.frameId ? (
                <>
                  <input
                    autoFocus
                    type="text"
                    value={editingFrameName}
                    onChange={(e) => setEditingFrameName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleFrameSave();
                      if (e.key === 'Escape') setEditingFrameId(null);
                    }}
                    className="bg-white px-3 py-1 rounded-lg border-2 outline-none text-sm"
                    style={{ borderColor: THEME_COLOR }}
                  />
                  <button
                    onClick={handleFrameSave}
                    className="p-1 hover:text-yellow-600 transition-colors"
                    style={{ color: THEME_COLOR }}
                  >
                    <Check size={16} />
                  </button>
                </>
              ) : (
                <>
                  <span className="bg-gray-200 px-3 py-1 rounded-lg flex items-center gap-2 text-sm">
                    {group.name}
                    {group.frameId && group.name !== 'Ungrouped' && (
                      <button
                        onClick={() => handleFrameEdit(group.frameId!, group.name)}
                        className="p-0.5 text-gray-400 transition-colors flex-shrink-0"
                        onMouseEnter={(e) => e.currentTarget.style.color = THEME_COLOR}
                        onMouseLeave={(e) => e.currentTarget.style.color = ''}
                      >
                        <Edit2 size={14} />
                      </button>
                    )}
                  </span>
                </>
              )}
              <span className="text-sm text-gray-400">({group.notes.length})</span>
            </h3>
            
            <div 
              className="bg-white rounded-2xl shadow-sm overflow-hidden w-full"
            >
              <div className="w-full">
                <div onDragOver={(e) => handleDragOver(e, group.name)} style={{ width: '100%' }}>
                  {/* Table Header */}
                  <div className="flex gap-2 sm:gap-4 px-2 sm:px-4 py-2 bg-gray-100 font-bold text-sm text-gray-600 border-b border-gray-200 box-border" style={{ width: '100%' }}>
                    <div className="flex-1 box-border">Text Content</div>
                    <div className="tag-header-column flex-shrink-0">Tags</div>
                  </div>
                  
                  {/* Table Rows */}
                  {group.notes.map((note, index) => (
                <div
                  key={note.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, note.id)}
                  onDragOver={(e) => handleDragOver(e, group.name)}
                  onDrop={(e) => handleDrop(e, group.name, index)}
                  className={`flex gap-2 sm:gap-4 px-2 sm:px-4 py-2 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-move box-border ${
                    draggedNoteId === note.id ? 'opacity-50' : ''
                  } ${draggedOverGroup === group.name ? 'bg-yellow-50' : ''}`}
                  style={{ width: '100%' }}
                >
                  {/* Text Content */}
                  <div className="flex-1 flex items-center gap-2 box-border overflow-hidden">
                    <GripVertical size={16} className="text-gray-400 flex-shrink-0" />
                    {editingNoteId === note.id ? (
                      <div className="flex-1 flex items-center gap-2">
                        <textarea
                          autoFocus
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          onBlur={() => handleTextSave(note)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleTextSave(note);
                            }
                          }}
                          className="flex-1 p-1 border rounded-lg outline-none resize-none"
                          style={{ borderColor: THEME_COLOR }}
                          rows={2}
                        />
                        <button
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditorNoteId(note.id);
                          }}
                          className="flex-shrink-0 p-1.5 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                          title="打开标签编辑器"
                        >
                          <ExternalLink size={16} />
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => handleTextEdit(note)}
                        className="flex-1 text-gray-800 cursor-pointer hover:bg-yellow-50 p-1 rounded-lg transition-colors whitespace-nowrap overflow-hidden text-ellipsis"
                      >
                        {note.text || <span className="text-gray-400 italic">Click to edit...</span>}
                      </div>
                    )}
                  </div>
                  
                  {/* Tags */}
                  <div className="tag-content-column flex gap-2 flex-nowrap items-center overflow-hidden flex-shrink-0">
                    <div className="flex gap-2 flex-nowrap items-center overflow-x-auto scrollbar-hide" style={{ width: '100%', maxWidth: '100%' }}>
                      {note.tags.map(tag => (
                        editingTagId && editingTagId.noteId === note.id && editingTagId.tagId === tag.id ? (
                          <div key={tag.id} className="flex items-center gap-0.5 bg-white rounded-full shadow-sm p-0.5 pr-1 h-8 flex-shrink-0" style={{ maxWidth: '100%', overflow: 'hidden' }}>
                            <input
                              autoFocus
                              className="text-xs bg-transparent outline-none ml-1.5 text-gray-700 placeholder-gray-400 flex-shrink-0"
                              style={{ width: '40px', minWidth: '40px' }}
                              placeholder="Tag"
                              value={newTagLabel}
                              onChange={(e) => setNewTagLabel(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleAddTag(note);
                                if (e.key === 'Escape') handleCancelTagEdit();
                              }}
                            />
                            <div className="flex gap-0.5 pl-0.5 flex-shrink-0">
                              {TAG_COLORS.slice(0, 5).map(c => (
                                <button
                                  key={c}
                                  onClick={() => setNewTagColor(c)}
                                  style={{ backgroundColor: c }}
                                  className={`w-3 h-3 rounded-full transition-transform flex-shrink-0 ${newTagColor === c ? 'ring-1 ring-gray-300' : ''}`}
                                />
                              ))}
                            </div>
                            <button 
                              onClick={() => handleAddTag(note)} 
                              className="ml-0.5 text-green-500 hover:text-green-600 active:scale-90 transition-transform flex-shrink-0"
                            >
                              <Check size={14} />
                            </button>
                          </div>
                        ) : (
                          <span
                            key={tag.id}
                            onClick={() => handleEditTag(note, tag.id)}
                            className="flex-shrink-0 h-6 px-2.5 rounded-full text-xs font-bold text-white shadow-sm flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
                            style={{ backgroundColor: tag.color }}
                          >
                            {tag.label}
                            <button onClick={(e) => { e.stopPropagation(); handleRemoveTag(note, tag.id); }}>
                              <X size={10} />
                            </button>
                          </span>
                        )
                      ))}
                      {addingTagNoteId === note.id && !editingTagId ? (
                        <div className="flex items-center gap-0.5 bg-white rounded-full shadow-sm p-0.5 pr-1 h-8 flex-shrink-0" style={{ maxWidth: '100%', overflow: 'hidden' }}>
                          <input
                            autoFocus
                            className="text-xs bg-transparent outline-none ml-1.5 text-gray-700 placeholder-gray-400 flex-shrink-0"
                            style={{ width: '40px', minWidth: '40px' }}
                            placeholder="Tag"
                            value={newTagLabel}
                            onChange={(e) => setNewTagLabel(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAddTag(note);
                              if (e.key === 'Escape') handleCancelTagEdit();
                            }}
                          />
                          <div className="flex gap-0.5 pl-0.5 flex-shrink-0">
                            {TAG_COLORS.slice(0, 5).map(c => (
                              <button
                                key={c}
                                onClick={() => setNewTagColor(c)}
                                style={{ backgroundColor: c }}
                                className={`w-3 h-3 rounded-full transition-transform flex-shrink-0 ${newTagColor === c ? 'ring-1 ring-gray-300' : ''}`}
                              />
                            ))}
                          </div>
                          <button 
                            onClick={() => handleAddTag(note)} 
                            className="ml-0.5 text-green-500 hover:text-green-600 active:scale-90 transition-transform flex-shrink-0"
                          >
                            <Check size={14} />
                          </button>
                        </div>
                      ) : !editingTagId ? (
                        <button
                          onClick={() => { setAddingTagNoteId(note.id); setNewTagColor(TAG_COLORS[0]); }}
                          className="flex-shrink-0 h-6 px-2 bg-white/60 hover:bg-white rounded-full text-xs font-bold text-gray-500 shadow-sm flex items-center transition-all"
                        >
                          + Tag
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
              
              {group.notes.length === 0 && (
                <div className="p-8 text-center text-gray-400 italic">
                  No data in this group
                </div>
              )}
                </div>
              </div>
            </div>
          </div>
          ))
        ) : (
          // Secondary table: compact notes (grouped)
          groupedCompactNotes.map((group) => (
            <div key={group.name} className="mb-8">
              <h3 className="text-base font-bold text-gray-700 mb-3 flex items-center gap-2">
                <span className="bg-gray-200 px-3 py-1 rounded-lg text-sm">
                  {group.name}
                </span>
                <span className="text-sm text-gray-400">({group.notes.length})</span>
              </h3>
              
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden w-full">
                <div className="w-full">
                  {/* Table Header */}
                  <div className="flex px-4 py-2 bg-gray-100 font-bold text-sm text-gray-600 border-b border-gray-200">
                    <div className="flex-1">Text Content</div>
                  </div>
                  
                  {/* Table Rows */}
                  {group.notes.length > 0 ? (
                    group.notes.map((note) => (
                      <div
                        key={note.id}
                        className="flex px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex-1 text-gray-800 whitespace-pre-wrap break-words">
                          {note.text || <span className="text-gray-400 italic">Empty note</span>}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-gray-400 italic">
                      No data in this group
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        
        {tableLevel === 'Primary' && groupedNotes.length === 0 && (
          <div className="text-center text-gray-400 italic py-12">
            No standard note data
          </div>
        )}
        
        {tableLevel === 'Secondary' && groupedCompactNotes.length === 0 && (
          <div className="text-center text-gray-400 italic py-12">
            No compact note data
          </div>
        )}
      
      {/* Note Editor */}
      {editorNoteId && (
        <NoteEditor
          initialNote={project.notes.find(n => n.id === editorNoteId)}
          isOpen={true}
          onClose={() => setEditorNoteId(null)}
          onSave={(updatedNote) => {
            if (editorNoteId) {
              const existingNote = project.notes.find(n => n.id === editorNoteId);
              if (existingNote) {
                onUpdateNote({ ...existingNote, ...updatedNote });
              }
            }
            setEditorNoteId(null);
          }}
          onSwitchToBoardView={onSwitchToBoardView}
        />
      )}
      </div>
    </div>
  );
};


import React, { useState, useMemo, useCallback } from 'react';
import { Note, Project, Frame, Connection } from '../types';
import { GripVertical, Edit2, Check, Pencil, Trash2 } from 'lucide-react';
import { connectionToGraphDirection } from '../utils/graph/graphData';
import { TAG_COLORS } from '../constants';
import { generateId, parseNoteContent } from '../utils';
import { NoteEditor } from './NoteEditor';
import { NoteTimeRangeControl } from './note-editor/NoteTimeRangeControl';
import { TagChip } from './ui/TagChip';
import { DeleteConfirmDialog } from './ui/DeleteConfirmDialog';
import { SettingsPanel } from './SettingsPanel';
import { TableTopLeftSettingsButton } from './table/TableTopLeftSettingsButton';
import { TableTopRightDownloadButton } from './table/TableTopRightDownloadButton';
import { TableBottomSubViewBar } from './table/TableBottomSubViewBar';
import { GraphTopCenterConnectionButton } from './graph/GraphTopCenterConnectionButton';
import { GraphConnectionPanel, type ConnectionDraft } from './graph/GraphConnectionPanel';

interface TableViewProps {
  project: Project;
  /** 写入 Graph Style 等到项目 */
  projectId?: string;
  onUpdateProject?: (projectOrId: Project | string, updates?: Partial<Project>) => void | Promise<void>;
  onUpdateNote: (note: Note) => void;
  onDeleteNote?: (noteId: string) => void | Promise<void>;
  onUpdateFrames?: (frames: Frame[]) => void;
  onUpdateConnections?: (connections: Connection[]) => void | Promise<void>;
  onSwitchToBoardView?: (coords?: { x: number; y: number }) => void;
  themeColor: string;
  panelChromeStyle?: React.CSSProperties;
  isUIVisible?: boolean;
  chromeHoverBackground?: string;
  onThemeColorChange?: (color: string) => void;
  mapUiChromeOpacity?: number;
  onMapUiChromeOpacityChange?: (opacity: number) => void;
  mapUiChromeBlurPx?: number;
  onMapUiChromeBlurPxChange?: (blurPx: number) => void;
  mapStyleId?: string;
  onMapStyleChange?: (styleId: string) => void;
}

type PendingTableDelete =
  | { kind: 'note'; noteId: string; titleHint: string }
  | { kind: 'connection'; connectionId: string };

type TableSubView = 'points' | 'edges';

function noteRowTitle(note: Note | undefined): string {
  if (!note) return '（便签已删除）';
  return parseNoteContent(note.text || '').title || '无标题';
}

function edgeDirectionHint(c: Connection): string {
  const d = connectionToGraphDirection(c);
  if (d === 'forward') return '→';
  if (d === 'backward') return '←';
  if (d === 'both') return '↔';
  return '—';
}

/** 与 graph 视图保持一致：从存储的 Connection 还原面板草稿 */
function connectionToPanelDraft(c: Connection): ConnectionDraft {
  const fromArrow: 'arrow' | 'none' =
    c.fromArrow != null ? c.fromArrow : c.arrow === 'reverse' ? 'arrow' : 'none';
  const toArrow: 'arrow' | 'none' =
    c.toArrow != null ? c.toArrow : c.arrow === 'forward' ? 'arrow' : 'none';
  return {
    fromNoteId: c.fromNoteId,
    toNoteId: c.toNoteId,
    label: c.label || '',
    fromArrow,
    toArrow
  };
}

function sanitizeFilenamePart(s: string): string {
  const t = s.trim().replace(/[/\\?%*:|"<>]/g, '_');
  return t.slice(0, 80) || 'table';
}

function csvEscapeCell(v: string | number | undefined | null): string {
  const s = v === undefined || v === null ? '' : String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(rows: (string | number | undefined | null)[][]): string {
  const lines = rows.map((row) => row.map(csvEscapeCell).join(','));
  return `\uFEFF${lines.join('\r\n')}`;
}

function triggerDownloadCsv(filename: string, csvBody: string) {
  const blob = new Blob([csvBody], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatNoteYearRange(note: Note): string {
  const { startYear, endYear } = note;
  if (startYear != null && endYear != null) return `${startYear}-${endYear}`;
  if (startYear != null) return String(startYear);
  if (endYear != null) return String(endYear);
  return '';
}

export const TableView: React.FC<TableViewProps> = ({
  project,
  projectId = '',
  onUpdateProject,
  onUpdateNote,
  onDeleteNote,
  onUpdateFrames,
  onUpdateConnections,
  onSwitchToBoardView,
  themeColor,
  panelChromeStyle,
  isUIVisible = true,
  chromeHoverBackground,
  onThemeColorChange,
  mapUiChromeOpacity = 0.9,
  onMapUiChromeOpacityChange,
  mapUiChromeBlurPx = 8,
  onMapUiChromeBlurPxChange,
  mapStyleId = 'carto-light-nolabels',
  onMapStyleChange,
}) => {
  const ch = panelChromeStyle;
  const chHover = chromeHoverBackground;
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [subView, setSubView] = useState<TableSubView>('points');
  const [pendingDelete, setPendingDelete] = useState<PendingTableDelete | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
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
  const [showConnectionPanel, setShowConnectionPanel] = useState(false);
  const [panelEditingKey, setPanelEditingKey] = useState<string | 'new'>('new');
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft>({
    fromNoteId: '',
    toNoteId: '',
    label: '',
    fromArrow: 'none',
    toArrow: 'arrow'
  });
  const [pickTarget, setPickTarget] = useState<'from' | 'to' | null>(null);

  const textNotes = useMemo(
    () => project.notes.filter(note => note.variant !== 'image'),
    [project.notes]
  );

  const connections = project.connections ?? [];
  const noteById = useMemo(() => {
    const m = new Map<string, Note>();
    project.notes.forEach((n) => m.set(n.id, n));
    return m;
  }, [project.notes]);

  // Group notes (支持多frame归属，一个note可以出现在多个分组中)
  const groupedNotes = useMemo(() => {
    const groups: { [key: string]: { notes: Note[], frameId?: string } } = {};
    
    textNotes.forEach(note => {
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
  }, [textNotes]);

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
    
    const draggedNote = textNotes.find(n => n.id === draggedNoteId);
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
    const notesToUpdate = textNotes.filter(note => note.groupId === editingFrameId);
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

  const confirmPendingDelete = async () => {
    if (!pendingDelete || deleteSubmitting) return;
    setDeleteSubmitting(true);
    try {
      if (pendingDelete.kind === 'note' && onDeleteNote) {
        await onDeleteNote(pendingDelete.noteId);
      } else if (pendingDelete.kind === 'connection' && onUpdateConnections) {
        await onUpdateConnections(connections.filter((c) => c.id !== pendingDelete.connectionId));
      }
      setPendingDelete(null);
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const downloadCurrentTable = useCallback(() => {
    const base = sanitizeFilenamePart(project.name);
    const ts = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '').replace('T', '_');
    if (subView === 'points') {
      const header = ['分组', '节点ID', '标题', '正文', '时间段', '标签'];
      const rows: (string | number | undefined | null)[][] = [header];
      for (const group of groupedNotes) {
        for (const note of group.notes) {
          rows.push([
            group.name,
            note.id,
            noteRowTitle(note),
            note.text || '',
            formatNoteYearRange(note),
            note.tags.map((t) => t.label).join('; '),
          ]);
        }
      }
      triggerDownloadCsv(`${base}_节点表_${ts}.csv`, buildCsv(rows));
      return;
    }
    const header = ['起点ID', '起点标题', '方向', '终点ID', '终点标题', '关系说明', '连接ID'];
    const rows: (string | number | undefined | null)[][] = [header];
    for (const c of connections) {
      const fromNote = noteById.get(c.fromNoteId);
      const toNote = noteById.get(c.toNoteId);
      rows.push([
        c.fromNoteId,
        noteRowTitle(fromNote),
        edgeDirectionHint(c),
        c.toNoteId,
        noteRowTitle(toNote),
        c.label || '',
        c.id,
      ]);
    }
    triggerDownloadCsv(`${base}_关联表_${ts}.csv`, buildCsv(rows));
  }, [subView, groupedNotes, connections, noteById, project.name]);

  const rowTrashBtn =
    'opacity-0 pointer-events-none transition-all group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50';

  const toggleConnectionPanel = useCallback(() => {
    setShowConnectionPanel((open) => !open);
  }, []);

  const handleNewConnection = useCallback(() => {
    setPanelEditingKey('new');
    setConnectionDraft({
      fromNoteId: '',
      toNoteId: '',
      label: '',
      fromArrow: 'none',
      toArrow: 'arrow'
    });
    setPickTarget(null);
  }, []);

  const openConnectionEditor = useCallback((connection: Connection) => {
    setPanelEditingKey(connection.id);
    setConnectionDraft(connectionToPanelDraft(connection));
    setPickTarget(null);
    setShowConnectionPanel(true);
  }, []);

  const commitConnectionDraft = useCallback(() => {
    if (!onUpdateConnections) return;
    const { fromNoteId, toNoteId, label, fromArrow, toArrow } = connectionDraft;
    if (!fromNoteId || !toNoteId) {
      window.alert('请选择起点和终点后再保存。');
      return;
    }
    if (fromNoteId === toNoteId) {
      window.alert('起点与终点不能是同一便签。');
      return;
    }
    const trimmedLabel = label.trim();
    const arrow: Connection['arrow'] =
      toArrow === 'arrow' && fromArrow === 'none'
        ? 'forward'
        : fromArrow === 'arrow' && toArrow === 'none'
          ? 'reverse'
          : 'none';
    if (panelEditingKey === 'new') {
      const newConn: Connection = {
        id: generateId(),
        fromNoteId,
        toNoteId,
        fromSide: 'bottom',
        toSide: 'top',
        label: trimmedLabel || undefined,
        fromArrow,
        toArrow,
        arrow
      };
      void onUpdateConnections([...connections, newConn]);
    } else {
      const existing = connections.find((c) => c.id === panelEditingKey);
      if (!existing) {
        window.alert('当前编辑的连线已不存在，请关闭面板后重试。');
        return;
      }
      void onUpdateConnections(
        connections.map((c) =>
          c.id === panelEditingKey
            ? {
                ...c,
                fromNoteId,
                toNoteId,
                label: trimmedLabel || undefined,
                fromArrow,
                toArrow,
                arrow
              }
            : c
        )
      );
    }
    setShowConnectionPanel(false);
    setPickTarget(null);
  }, [connectionDraft, connections, onUpdateConnections, panelEditingKey]);

  const handleDeleteConnectionByPanel = useCallback(() => {
    if (!onUpdateConnections || panelEditingKey === 'new') return;
    void onUpdateConnections(connections.filter((c) => c.id !== panelEditingKey));
    setShowConnectionPanel(false);
    setPickTarget(null);
    setPanelEditingKey('new');
  }, [connections, onUpdateConnections, panelEditingKey]);

  /** 与 GraphView 关联面板一致：行末减号需可清草稿并退出点选（无画布时仅改 state） */
  const clearTableConnectionPanelGraphAndDraft = useCallback(() => {
    setPickTarget(null);
    if (panelEditingKey === 'new') {
      setConnectionDraft((d) => ({ ...d, fromNoteId: '', toNoteId: '' }));
    } else {
      setPanelEditingKey('new');
      setConnectionDraft({
        fromNoteId: '',
        toNoteId: '',
        label: '',
        fromArrow: 'none',
        toArrow: 'arrow'
      });
    }
  }, [panelEditingKey]);

  const clearTableConnectionFromOnly = useCallback(() => {
    setPickTarget(null);
    setPanelEditingKey('new');
    setConnectionDraft((d) => ({ ...d, fromNoteId: '' }));
  }, []);

  const clearTableConnectionToOnly = useCallback(() => {
    setPickTarget(null);
    setPanelEditingKey('new');
    setConnectionDraft((d) => ({ ...d, toNoteId: '' }));
  }, []);

  /** 与左上角设置、系统状态栏错开，避免分组标题紧贴视口顶 */
  const tableScrollTopPad =
    'max(5.5rem, calc(env(safe-area-inset-top, 0px) + 3.25rem))';

  return (
    <div className="relative h-full bg-gray-50 flex flex-col min-h-0">
      <TableTopLeftSettingsButton
        isUIVisible={isUIVisible}
        chromeSurfaceStyle={ch}
        chromeHoverBackground={chHover}
        onOpenSettings={() => setShowSettingsPanel(true)}
      />
      <TableTopRightDownloadButton
        isUIVisible={isUIVisible}
        chromeSurfaceStyle={ch}
        chromeHoverBackground={chHover}
        onDownload={downloadCurrentTable}
        subView={subView}
      />
      <GraphTopCenterConnectionButton
        visible={isUIVisible && subView === 'edges' && !!onUpdateConnections}
        chromeSurfaceStyle={ch}
        chromeHoverBackground={chHover}
        showConnectionPanel={showConnectionPanel}
        onToggleConnectionPanel={toggleConnectionPanel}
      />
      <div
        className="flex-1 min-h-0 overflow-auto pl-4 pb-28 box-border pr-16 sm:pr-[4.5rem]"
        style={{ paddingTop: tableScrollTopPad }}
      >
        {subView === 'points' ? (
          <>
          {groupedNotes.map((group) => (
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
                    style={{ borderColor: themeColor }}
                  />
                  <button
                    onClick={handleFrameSave}
                    className="p-1 hover:text-yellow-600 transition-colors"
                    style={{ color: themeColor }}
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
                        onMouseEnter={(e) => e.currentTarget.style.color = themeColor}
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
              className="bg-white rounded-2xl shadow-sm w-full"
            >
              <div className="w-full">
                <div onDragOver={(e) => handleDragOver(e, group.name)} style={{ width: '100%' }}>
                  {/* Table Header（字号与关联表一致：text-sm） */}
                  <div className="flex gap-2 px-3 sm:px-4 py-2 bg-gray-100 font-bold text-sm text-gray-600 border-b border-gray-200 box-border" style={{ width: '100%' }}>
                    <div className="flex-1 box-border min-w-0">Text Content</div>
                    <div className="w-20 sm:w-24 flex-shrink-0">时间</div>
                    <div className="tag-header-column flex-shrink-0 min-w-0">Tags</div>
                    {onDeleteNote ? <div className="w-10 flex-shrink-0" aria-hidden /> : null}
                  </div>
                  
                  {/* Table Rows */}
                  {group.notes.map((note, index) => (
                <div
                  key={note.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, note.id)}
                  onDragOver={(e) => handleDragOver(e, group.name)}
                  onDrop={(e) => handleDrop(e, group.name, index)}
                  className={`group flex gap-2 px-3 sm:px-4 py-2.5 border-b border-gray-100 text-sm hover:bg-gray-50 transition-colors cursor-move box-border ${
                    draggedNoteId === note.id ? 'opacity-50' : ''
                  } ${draggedOverGroup === group.name ? 'bg-yellow-50' : ''}`}
                  style={{ width: '100%' }}
                >
                  {/* Text Content */}
                  <div className="flex-1 flex items-center gap-2 box-border min-w-0 overflow-hidden">
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
                          className="flex-1 p-1 border rounded-lg outline-none resize-none text-sm"
                          style={{ borderColor: themeColor }}
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
                          title="打开编辑器"
                        >
                          <Pencil size={16} />
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => handleTextEdit(note)}
                        className="flex-1 text-sm text-gray-800 cursor-pointer hover:bg-yellow-50 p-1 rounded-lg transition-colors whitespace-nowrap overflow-hidden text-ellipsis"
                      >
                        {parseNoteContent(note.text || '').title || <span className="text-gray-400 italic">Click to edit...</span>}
                      </div>
                    )}
                  </div>
                  
                  <div
                    className="w-24 sm:w-28 flex-shrink-0 flex items-center text-sm text-gray-600 tabular-nums"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <NoteTimeRangeControl
                      startYear={note.startYear}
                      endYear={note.endYear}
                      onChange={(next) =>
                        onUpdateNote({
                          ...note,
                          startYear: next.startYear,
                          endYear: next.endYear
                        })
                      }
                      themeColor={themeColor}
                      panelChromeStyle={panelChromeStyle}
                    />
                  </div>
                  
                  {/* Tags：内层横向滚动 + 内边距，避免 shadow 被 overflow 裁切 */}
                  <div className="tag-content-column flex min-h-[2.25rem] flex-nowrap items-center flex-shrink-0">
                    <div className="flex min-w-0 flex-1 gap-2 flex-nowrap items-center overflow-x-auto scrollbar-hide px-1 py-1.5">
                      {note.tags.map(tag => (
                        editingTagId && editingTagId.noteId === note.id && editingTagId.tagId === tag.id ? (
                          <div key={tag.id} className="flex items-center gap-0.5 bg-white rounded-full shadow-sm p-0.5 pr-1 h-8 flex-shrink-0" style={{ maxWidth: '100%', overflow: 'hidden' }}>
                            <input
                              autoFocus
                              className="text-xs bg-transparent outline-none ml-1.5 text-gray-700 flex-shrink-0"
                              style={{ width: '40px', minWidth: '40px' }}
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
                                  className={`w-3 h-3 rounded-full transition-transform flex-shrink-0 ${newTagColor === c ? 'scale-125' : ''}`}
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
                          <TagChip
                            key={tag.id}
                            label={tag.label}
                            color={tag.color}
                            onClick={() => handleEditTag(note, tag.id)}
                            onRemove={() => handleRemoveTag(note, tag.id)}
                          />
                        )
                      ))}
                      {addingTagNoteId === note.id && !editingTagId ? (
                        <div className="flex items-center gap-0.5 bg-white rounded-full shadow-sm p-0.5 pr-1 h-8 flex-shrink-0" style={{ maxWidth: '100%', overflow: 'hidden' }}>
                          <input
                            autoFocus
                            className="text-xs bg-transparent outline-none ml-1.5 text-gray-700 flex-shrink-0"
                            style={{ width: '40px', minWidth: '40px' }}
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
                                className={`w-3 h-3 rounded-full transition-transform flex-shrink-0 ${newTagColor === c ? 'scale-125' : ''}`}
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
                  {onDeleteNote ? (
                    <div className="w-10 flex-shrink-0 flex items-center justify-end">
                      <button
                        type="button"
                        title="删除便签"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPendingDelete({
                            kind: 'note',
                            noteId: note.id,
                            titleHint: noteRowTitle(note)
                          });
                        }}
                        className={rowTrashBtn}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ) : null}
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
          ))}

        {groupedNotes.length === 0 && (
          <div className="text-center text-gray-400 italic py-12">
            暂无便签数据
          </div>
        )}
          </>
        ) : (
          <div className="mb-8">
            <h3 className="text-base font-bold text-gray-700 mb-3">关联表</h3>
            <div className="bg-white rounded-2xl shadow-sm w-full overflow-hidden">
              <div className="overflow-x-auto">
                <div className="min-w-[36rem]">
                  <div className="flex gap-2 px-3 sm:px-4 py-2 bg-gray-100 font-bold text-sm text-gray-600 border-b border-gray-200">
                    <div className="flex-1 min-w-[7rem]">起点（节点）</div>
                    <div className="w-8 flex-shrink-0 text-center text-gray-400" title="方向">
                      向
                    </div>
                    <div className="flex-1 min-w-[7rem]">终点（节点）</div>
                    <div className="w-[min(12rem,30%)] flex-shrink-0">标签</div>
                    <div className="w-10 flex-shrink-0 text-right"> </div>
                  </div>
                  {connections.map((c) => {
                    const fromNote = noteById.get(c.fromNoteId);
                    const toNote = noteById.get(c.toNoteId);
                    return (
                      <div
                        key={c.id}
                        className="group flex gap-2 items-center px-3 sm:px-4 py-2.5 border-b border-gray-100 text-sm cursor-pointer hover:bg-gray-50"
                        onClick={() => openConnectionEditor(c)}
                      >
                        <div className="flex-1 min-w-[7rem] text-gray-800 whitespace-nowrap overflow-hidden text-ellipsis" title={noteRowTitle(fromNote)}>
                          {noteRowTitle(fromNote)}
                        </div>
                        <div className="w-8 flex-shrink-0 text-center text-gray-500 font-mono" title="与关系图一致的箭头方向">
                          {edgeDirectionHint(c)}
                        </div>
                        <div className="flex-1 min-w-[7rem] text-gray-800 whitespace-nowrap overflow-hidden text-ellipsis" title={noteRowTitle(toNote)}>
                          {noteRowTitle(toNote)}
                        </div>
                        <div className="w-[min(12rem,30%)] flex-shrink-0">
                          {onUpdateConnections ? (
                            <input
                              key={`${c.id}-${c.label ?? ''}`}
                              defaultValue={c.label || ''}
                              onBlur={(e) => {
                                const v = e.target.value;
                                if (v === (c.label || '')) return;
                                onUpdateConnections(
                                  connections.map((x) => (x.id === c.id ? { ...x, label: v } : x))
                                );
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full px-2 py-1.5 rounded-lg border border-gray-200/80 bg-white text-xs outline-none focus:ring-2 focus:ring-offset-0"
                              style={{ ['--tw-ring-color' as string]: themeColor }}
                            />
                          ) : (
                            <span className="text-gray-600 text-xs">{c.label || '—'}</span>
                          )}
                        </div>
                        <div className="w-10 flex-shrink-0 flex justify-end">
                          {onUpdateConnections ? (
                            <button
                              type="button"
                              title="删除关联"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                setPendingDelete({ kind: 'connection', connectionId: c.id });
                              }}
                              className={rowTrashBtn}
                            >
                              <Trash2 size={16} />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                  {connections.length === 0 && (
                    <div className="p-8 text-center text-gray-400 italic">暂无关联，可在看板连接便签后在此查看</div>
                  )}
                </div>
              </div>
            </div>
            {!onUpdateConnections && connections.length > 0 ? (
              <p className="mt-2 text-xs text-gray-500">当前为只读列表；完整编辑请在看板或图谱中操作。</p>
            ) : null}
          </div>
        )}

      {showConnectionPanel && onUpdateConnections && isUIVisible && (
        <GraphConnectionPanel
          isOpen
          themeColor={themeColor}
          panelChromeStyle={panelChromeStyle}
          notes={project.notes}
          draft={connectionDraft}
          onDraftChange={(patch) => setConnectionDraft((d) => ({ ...d, ...patch }))}
          panelEditingKey={panelEditingKey}
          pickTarget={pickTarget}
          onPickTargetChange={setPickTarget}
          onCommit={commitConnectionDraft}
          onDelete={handleDeleteConnectionByPanel}
          onNewConnection={handleNewConnection}
          onBeginEndpointEdit={handleNewConnection}
          disableGraphPick
          graphPickDisabledHint="请到 GraphView 选点"
          onClearGraphAndDraftSelection={clearTableConnectionPanelGraphAndDraft}
          onClearFromSelection={clearTableConnectionFromOnly}
          onClearToSelection={clearTableConnectionToOnly}
          showClearSelection={
            !!pickTarget || !!connectionDraft.fromNoteId || !!connectionDraft.toNoteId
          }
          onClose={() => {
            setShowConnectionPanel(false);
            setPickTarget(null);
          }}
        />
      )}

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
          themeColor={themeColor}
          panelChromeStyle={panelChromeStyle}
        />
      )}
      </div>

      <TableBottomSubViewBar
        panelChromeStyle={panelChromeStyle}
        themeColor={themeColor}
        subView={subView}
        onChangeSubView={setSubView}
      />

      <SettingsPanel
        isOpen={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
        settingsContextView="table"
        themeColor={themeColor}
        onThemeColorChange={onThemeColorChange ?? (() => {})}
        mapUiChromeOpacity={mapUiChromeOpacity}
        onMapUiChromeOpacityChange={onMapUiChromeOpacityChange ?? (() => {})}
        mapUiChromeBlurPx={mapUiChromeBlurPx}
        onMapUiChromeBlurPxChange={onMapUiChromeBlurPxChange ?? (() => {})}
        currentMapStyle={mapStyleId}
        onMapStyleChange={onMapStyleChange ?? (() => {})}
        graphProject={project}
        onGraphProjectPatch={
          onUpdateProject && projectId
            ? (patch) => void onUpdateProject(projectId, patch)
            : undefined
        }
      />

      <DeleteConfirmDialog
        open={!!pendingDelete}
        variant={pendingDelete?.kind === 'connection' ? 'connection' : 'note'}
        titleHint={pendingDelete?.kind === 'note' ? pendingDelete.titleHint : undefined}
        confirming={deleteSubmitting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmPendingDelete}
        themeColor={themeColor}
        panelChromeStyle={panelChromeStyle}
      />
    </div>
  );
};


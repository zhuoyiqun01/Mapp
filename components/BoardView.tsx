import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { Note, Frame, Connection } from '../types';
import { motion } from 'framer-motion';
import { NoteEditor } from './NoteEditor';
import { ZoomSlider } from './ZoomSlider';
import { Square, StickyNote, X, Pencil, Check, Minus, Move, ArrowUp, Hash, Plus, Image as ImageIcon, FileJson, Locate, Layers, GitBranch } from 'lucide-react';
import exifr from 'exifr';
import { generateId, fileToBase64 } from '../utils';
import { DEFAULT_THEME_COLOR } from '../constants';
import { saveImage, saveSketch, loadNoteImages, getViewPositionCache } from '../utils/storage';

// 常量定义
const CONNECTION_OFFSET = 40; // 连接线从连接点延伸的距离
const CONNECTION_POINT_SIZE = 6; // 连接点的大小（宽高，单位：像素）
const CONNECTION_POINT_DETECT_RADIUS = 20; // 连接点检测半径
const CONNECTION_LINE_WIDTH = 4; // 连接线宽度
const CONNECTION_LINE_CLICKABLE_WIDTH = 40; // 连接线可点击区域宽度（手机端友好）
const CONNECTION_LINE_CORNER_RADIUS = 32; // 连接线转角圆角半径
const SVG_OVERFLOW_PADDING = 500; // SVG 容器的溢出边距
const LONG_PRESS_DURATION = 1500; // 长按触发时间（毫秒）
const VIBRATION_SHORT = 10; // 短振动时间（毫秒）
const VIBRATION_MEDIUM = 15; // 中等振动时间（毫秒）
const VIBRATION_LONG = 20; // 长振动时间（毫秒）

interface BoardViewProps {
  notes: Note[];
  onUpdateNote: (note: Note) => void;
  onToggleEditor: (isOpen: boolean) => void;
  onAddNote?: (note: Note) => void; 
  onDeleteNote?: (noteId: string) => void;
  onEditModeChange?: (isEdit: boolean) => void;
  connections?: Connection[];
  onUpdateConnections?: (connections: Connection[]) => void;
  frames?: Frame[];
  onUpdateFrames?: (frames: Frame[]) => void;
  project?: { notes: Note[]; standardSizeScale?: number };
  onUpdateProject?: (project: { notes: Note[]; standardSizeScale?: number }) => void;
  onSwitchToMapView?: (coords?: { lat: number; lng: number }) => void;
  onSwitchToBoardView?: (coords?: { x: number; y: number }) => void;
  navigateToCoords?: { x: number; y: number } | null;
  projectId?: string;
  onNavigateComplete?: () => void;
  onTransformChange?: (x: number, y: number, scale: number) => void;
  mapViewFileInputRef?: React.RefObject<HTMLInputElement>;
  themeColor?: string;
}

const BoardViewComponent: React.FC<BoardViewProps> = ({ notes, onUpdateNote, onToggleEditor, onAddNote, onDeleteNote, onEditModeChange, connections = [], onUpdateConnections, frames = [], onUpdateFrames, project, onUpdateProject, onSwitchToMapView, onSwitchToBoardView, navigateToCoords, projectId, onNavigateComplete, onTransformChange, mapViewFileInputRef, themeColor = DEFAULT_THEME_COLOR }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  
  // Calculate initial transform: cache -> fit all objects -> default
  const calculateInitialTransform = useCallback(() => {
    if (!containerRef.current) return { x: 0, y: 0, scale: 1 };
    
    // 1. Check cache first
    if (projectId) {
      const cached = getViewPositionCache(projectId, 'board');
      if (cached?.x !== undefined && cached?.y !== undefined && cached?.scale !== undefined) {
        return { x: cached.x, y: cached.y, scale: cached.scale };
      }
    }
    
    // 2. Calculate to fit all objects
    if (notes.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      notes.forEach(note => {
        minX = Math.min(minX, note.boardX);
        minY = Math.min(minY, note.boardY);
        const w = note.variant === 'compact' ? 180 : 256;
        const h = note.variant === 'compact' ? 180 : 256;
        maxX = Math.max(maxX, note.boardX + w);
        maxY = Math.max(maxY, note.boardY + h);
      });
      
      const padding = 100;
      minX -= padding;
      minY -= padding;
      maxX += padding;
      maxY += padding;
      const contentWidth = maxX - minX;
      const contentHeight = maxY - minY;
      const { width: cW, height: cH } = containerRef.current.getBoundingClientRect();
      
      const scaleX = cW / contentWidth;
      const scaleY = cH / contentHeight;
      const newScale = Math.min(Math.max(0.2, Math.min(scaleX, scaleY) * 0.9), 4);
      
      const newX = (cW - contentWidth * newScale) / 2 - minX * newScale;
      const newY = (cH - contentHeight * newScale) / 2 - minY * newScale;
      
      return { x: newX, y: newY, scale: newScale };
    }
    
    // 3. Default
    return { x: 0, y: 0, scale: 1 };
  }, [notes, projectId]);
  
  // Canvas Viewport State - initialize with calculated transform
  const [transform, setTransform] = useState(() => {
    // This will be recalculated when container is ready
    return { x: 0, y: 0, scale: 1 };
  });
  const [isPanning, setIsPanning] = useState(false);
  
  // Edit Mode State
  const [isEditMode, setIsEditMode] = useState(false);
  
  // Note position selection state
  const [isSelectingNotePosition, setIsSelectingNotePosition] = useState(false);
  const [notePositionPreview, setNotePositionPreview] = useState<{ x: number; y: number } | null>(null);
  
  // 当编辑模式切换时，清除过滤状态
  useEffect(() => {
    if (isEditMode) {
      setFilterFrameIds(new Set());
    } else {
      // 退出编辑模式时，也退出位置选择模式
      setIsSelectingNotePosition(false);
      setNotePositionPreview(null);
    }
  }, [isEditMode]);
  
  // 当退出位置选择模式时，清除预览
  useEffect(() => {
    if (!isSelectingNotePosition) {
      setNotePositionPreview(null);
    }
  }, [isSelectingNotePosition]);
  
  // Layer Visibility State
  const [layerVisibility, setLayerVisibility] = useState({
    frame: true,
    primary: true,
    image: true,
    secondary: true,
    connects: true,
  });
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  // Layout state: global standard size scale is stored in project.standardSizeScale
  
  // Dragging State
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 }); 
  const lastMousePos = useRef<{ x: number, y: number } | null>(null);
  const panStartPos = useRef<{ x: number, y: number } | null>(null);
  
  // Long press state for notes
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressNoteIdRef = useRef<string | null>(null);
  const notePressStartPosRef = useRef<{ x: number, y: number } | null>(null);
  // 专门用于跟踪当前按下的 note ID，不会被移动逻辑清空，只在 pointerUp 时清空
  const currentNotePressIdRef = useRef<string | null>(null);
  // 保存长按时的 pointerId 和元素引用，用于长按触发后捕获指针
  const longPressPointerIdRef = useRef<number | null>(null);
  const longPressElementRef = useRef<HTMLElement | null>(null);
  
  // Blank click count for exit logic
  const blankClickCountRef = useRef<number>(0);
  const blankClickResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Connection state
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set()); // Multi-select state
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  
  // Multi-select state
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [isMultiSelectDragging, setIsMultiSelectDragging] = useState(false);
  const [multiSelectDragOffset, setMultiSelectDragOffset] = useState({ x: 0, y: 0 });
  
  // Box selection state
  const [isBoxSelecting, setIsBoxSelecting] = useState(false);
  const [boxSelectStart, setBoxSelectStart] = useState<{ x: number; y: number } | null>(null);
  const [boxSelectEnd, setBoxSelectEnd] = useState<{ x: number; y: number } | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<{ noteId: string; side: 'top' | 'right' | 'bottom' | 'left' } | null>(null);
  const [connectingTo, setConnectingTo] = useState<{ x: number; y: number } | null>(null);
  const [hoveringConnectionPoint, setHoveringConnectionPoint] = useState<{ noteId: string; side: 'top' | 'right' | 'bottom' | 'left' } | null>(null);
  
  // Frame state
  const [isDrawingFrame, setIsDrawingFrame] = useState(false);
  const [drawingFrameStart, setDrawingFrameStart] = useState<{ x: number; y: number } | null>(null);
  const [drawingFrameEnd, setDrawingFrameEnd] = useState<{ x: number; y: number } | null>(null);
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const [resizingImage, setResizingImage] = useState<{
    id: string;
    corner: 'tl' | 'tr' | 'bl' | 'br';
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startBoardX: number;
    startBoardY: number;
    aspect: number;
  } | null>(null);
  // 在非编辑模式下选中的frames用于过滤显示（支持多frame）
  const [filterFrameIds, setFilterFrameIds] = useState<Set<string>>(new Set());
  const [editingFrameId, setEditingFrameId] = useState<string | null>(null);
  const [editingFrameTitle, setEditingFrameTitle] = useState('');
  const frameTitleInputRef = useRef<HTMLInputElement | null>(null);
  const frameTitleSaveButtonRef = useRef<HTMLButtonElement | null>(null);
  const [resizingFrame, setResizingFrame] = useState<{ id: string; corner: 'tl' | 'tr' | 'bl' | 'br'; startX: number; startY: number; originalFrame: Frame } | null>(null);
  const [draggingFrameId, setDraggingFrameId] = useState<string | null>(null);
  const [draggingFrameOffset, setDraggingFrameOffset] = useState<{ x: number; y: number } | null>(null);
  
  // Import state
  const [showImportMenu, setShowImportMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dataImportInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // Image import preview state
  const [importPreview, setImportPreview] = useState<Array<{
    file: File;
    imageUrl: string;
    lat: number;
    lng: number;
    error?: string;
    isDuplicate?: boolean;
    imageFingerprint?: string;
  }>>([]);
  
  // Image fingerprint: GPS coordinates + 3 sampled pixels (top-left, bottom-left, bottom-right)
  // Format: lat_lng_topLeftPixel_bottomLeftPixel_bottomRightPixel
  const calculateImageFingerprint = async (file: File, imageUrl: string, lat: number | null, lng: number | null): Promise<string> => {
    try {
      // Load image
      const img = new Image();
      img.src = imageUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      
      // Sample 3 pixels: top-left, bottom-left, bottom-right
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        // Fallback: return GPS only if available
        return lat !== null && lng !== null ? `${lat.toFixed(6)}_${lng.toFixed(6)}` : 'no_gps';
      }
      
      // Draw image
      ctx.drawImage(img, 0, 0, width, height);
      
      // Sample top-left pixel (0, 0)
      const topLeftData = ctx.getImageData(0, 0, 1, 1).data;
      const topLeft = topLeftData.length >= 3 
        ? `${topLeftData[0]},${topLeftData[1]},${topLeftData[2]}` 
        : '0,0,0';
      
      // Sample bottom-left pixel (0, height-1)
      const bottomLeftData = ctx.getImageData(0, height - 1, 1, 1).data;
      const bottomLeft = bottomLeftData.length >= 3 
        ? `${bottomLeftData[0]},${bottomLeftData[1]},${bottomLeftData[2]}` 
        : '0,0,0';
      
      // Sample bottom-right pixel (width-1, height-1)
      const bottomRightData = ctx.getImageData(width - 1, height - 1, 1, 1).data;
      const bottomRight = bottomRightData.length >= 3 
        ? `${bottomRightData[0]},${bottomRightData[1]},${bottomRightData[2]}` 
        : '0,0,0';
      
      // Create fingerprint: lat_lng_topLeft_bottomLeft_bottomRight
      const gpsPart = lat !== null && lng !== null 
        ? `${lat.toFixed(6)}_${lng.toFixed(6)}` 
        : 'no_gps';
      return `${gpsPart}_${topLeft}_${bottomLeft}_${bottomRight}`;
    } catch (error) {
      console.error('Error calculating image fingerprint:', error);
      return lat !== null && lng !== null ? `${lat.toFixed(6)}_${lng.toFixed(6)}` : 'unknown';
    }
  };
  
  // Fingerprint from base64 image (extract GPS from note if available)
  const calculateFingerprintFromBase64 = async (base64Image: string, note?: Note): Promise<string> => {
    try {
      // Extract GPS from note if available
      const lat = note?.coords?.lat ?? null;
      const lng = note?.coords?.lng ?? null;
      
      const img = new Image();
      img.src = base64Image;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      
      // Sample 3 pixels: top-left, bottom-left, bottom-right
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        // Fallback: return GPS only if available
        return lat !== null && lng !== null ? `${lat.toFixed(6)}_${lng.toFixed(6)}` : 'no_gps';
      }
      
      // Draw image
      ctx.drawImage(img, 0, 0, width, height);
      
      // Sample top-left pixel (0, 0)
      const topLeftData = ctx.getImageData(0, 0, 1, 1).data;
      const topLeft = topLeftData.length >= 3 
        ? `${topLeftData[0]},${topLeftData[1]},${topLeftData[2]}` 
        : '0,0,0';
      
      // Sample bottom-left pixel (0, height-1)
      const bottomLeftData = ctx.getImageData(0, height - 1, 1, 1).data;
      const bottomLeft = bottomLeftData.length >= 3 
        ? `${bottomLeftData[0]},${bottomLeftData[1]},${bottomLeftData[2]}` 
        : '0,0,0';
      
      // Sample bottom-right pixel (width-1, height-1)
      const bottomRightData = ctx.getImageData(width - 1, height - 1, 1, 1).data;
      const bottomRight = bottomRightData.length >= 3 
        ? `${bottomRightData[0]},${bottomRightData[1]},${bottomRightData[2]}` 
        : '0,0,0';
      
      // Create fingerprint: lat_lng_topLeft_bottomLeft_bottomRight
      const gpsPart = lat !== null && lng !== null 
        ? `${lat.toFixed(6)}_${lng.toFixed(6)}` 
        : 'no_gps';
      return `${gpsPart}_${topLeft}_${bottomLeft}_${bottomRight}`;
    } catch (error) {
      console.error('Error calculating fingerprint from base64:', error);
      const lat = note?.coords?.lat ?? null;
      const lng = note?.coords?.lng ?? null;
      return lat !== null && lng !== null ? `${lat.toFixed(6)}_${lng.toFixed(6)}` : 'unknown';
    }
  };
  
  const [showImportDialog, setShowImportDialog] = useState(false);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  
  // Text measurement refs removed (text variant removed)

  // 重置空白点击计数
  const resetBlankClickCount = () => {
    blankClickCountRef.current = 0;
    if (blankClickResetTimerRef.current) {
      clearTimeout(blankClickResetTimerRef.current);
      blankClickResetTimerRef.current = null;
    }
  };

  // Keyboard shift key support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(true);
      }
      // Close import dialog on ESC key
      if (e.key === 'Escape' && showImportDialog) {
        handleCancelImport();
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isEditMode, showImportDialog]);

  useEffect(() => {
    onEditModeChange?.(isEditMode);
    
    // Layout scale is now managed globally via project.standardSizeScale
    
    // 退出编辑模式时清除所有连接相关状态和长按状态
    if (!isEditMode) {
      setConnectingFrom(null);
      setConnectingTo(null);
      setHoveringConnectionPoint(null);
      setSelectedConnectionId(null);
      setSelectedFrameId(null); // 清除frame选中状态
      setSelectedNoteIds(new Set()); // Clear multi-select
      setIsShiftPressed(false);
      // 清空长按相关状态，确保下次单击可以正常打开编辑器
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      longPressNoteIdRef.current = null;
      currentNotePressIdRef.current = null;
      notePressStartPosRef.current = null;
    }
  }, [isEditMode, onEditModeChange]);

  // 计算Note的中心点是否在Frame内
  const isNoteInFrame = (note: Note, frame: Frame): boolean => {
    const isCompact = note.variant === 'compact';
    const width = isCompact ? 180 : 256;
    const height = isCompact ? 180 : 256;
    
    const centerX = note.boardX + width / 2;
    const centerY = note.boardY + height / 2;
    
    return centerX >= frame.x && 
           centerX <= frame.x + frame.width && 
           centerY >= frame.y && 
           centerY <= frame.y + frame.height;
  };

  // 更新所有Note的分组信息（支持多frame归属）
  const updateNoteGroups = () => {
    const updatedNotes = notes.map(note => {
      // 找到所有包含此Note的Frames
      const containingFrames = frames.filter(frame => isNoteInFrame(note, frame));
      
      if (containingFrames.length > 0) {
        const groupIds = containingFrames.map(f => f.id);
        const groupNames = containingFrames.map(f => f.title);
        // 保持向后兼容：如果只有一个frame，也设置groupId和groupName
        const singleFrame = containingFrames[0];
        return {
          ...note,
          groupIds,
          groupNames,
          groupId: singleFrame.id, // 向后兼容
          groupName: singleFrame.title // 向后兼容
        };
      } else {
        // 不在任何Frame中，清除分组信息
        return {
          ...note,
          groupIds: undefined,
          groupNames: undefined,
          groupId: undefined,
          groupName: undefined
        };
      }
    });
    
    // 只在有变化时更新
    const hasChanges = updatedNotes.some((note, index) => {
      const oldNote = notes[index];
      const oldGroupIds = oldNote.groupIds || (oldNote.groupId ? [oldNote.groupId] : []);
      const newGroupIds = note.groupIds || (note.groupId ? [note.groupId] : []);
      return JSON.stringify(oldGroupIds.sort()) !== JSON.stringify(newGroupIds.sort());
    });
    
    if (hasChanges) {
      updatedNotes.forEach(note => onUpdateNote(note));
    }
  };

  // 确保便签图片数据已加载
  const ensureNoteImagesLoaded = async (note: Note): Promise<Note> => {
    // 检查便签是否已经有加载的图片数据
    const hasImages = note.images && note.images.length > 0;
    const hasLoadedImages = hasImages && note.images!.some(img => img.startsWith('data:'));

    // 如果已经有加载的图片数据，直接返回
    if (hasLoadedImages) {
      return note;
    }

    // 否则从 IndexedDB 加载图片数据
    try {
      const loadedNote = await loadNoteImages(note);
      return loadedNote;
    } catch (error) {
      console.error('Failed to load note images:', error);
      return note; // 返回原始便签，如果加载失败
    }
  };

  // 当Frame变化时更新分组
  useEffect(() => {
    updateNoteGroups();
  }, [frames]);

  // 获取连接点位置
  const getConnectionPoint = (note: Note, side: 'top' | 'right' | 'bottom' | 'left', isDragging: boolean, dragOffset: { x: number; y: number }) => {
    const x = note.boardX + (isDragging ? dragOffset.x : 0);
    const y = note.boardY + (isDragging ? dragOffset.y : 0);
    const isCompact = note.variant === 'compact';
    const isImage = note.variant === 'image';
    
    // For compact/standard/image notes, use respective dimensions
    const width = isImage ? (note.imageWidth || 256) : (isCompact ? 180 : 256);
    const height = isImage ? (note.imageHeight || 256) : (isCompact ? 180 : 256);
    
    switch (side) {
      case 'top':
        return { x: x + width / 2, y: y - 8 };
      case 'right':
        return { x: x + width + 8, y: y + height / 2 };
      case 'bottom':
        return { x: x + width / 2, y: y + height + 8 };
      case 'left':
        return { x: x - 8, y: y + height / 2 };
    }
  };

  // 生成带圆角的连接线路径（使用二次贝塞尔曲线）
  const createRoundedPath = (points: {x: number, y: number}[], radius: number): string => {
    if (points.length < 2) return '';
    
    let path = `M ${points[0].x + SVG_OVERFLOW_PADDING} ${points[0].y + SVG_OVERFLOW_PADDING}`;
    
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];
      
      // 计算到当前点的距离
      const distPrev = Math.sqrt(Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2));
      const distNext = Math.sqrt(Math.pow(next.x - curr.x, 2) + Math.pow(next.y - curr.y, 2));
      
      // 自适应圆角半径：优先使用指定半径，如果线段太短则降级为6px，再短就直线
      let actualRadius = radius;
      if (distPrev < radius * 2 || distNext < radius * 2) {
        // 线段太短，降级使用6px圆角
        actualRadius = 6;
      }
      
      // 如果连6px圆角都放不下，使用直线连接
      if (distPrev < actualRadius * 2 || distNext < actualRadius * 2) {
        path += ` L ${curr.x + SVG_OVERFLOW_PADDING} ${curr.y + SVG_OVERFLOW_PADDING}`;
        continue;
      }
      
      // 计算圆角前的点
      const ratioP = actualRadius / distPrev;
      const beforeX = curr.x - (curr.x - prev.x) * ratioP;
      const beforeY = curr.y - (curr.y - prev.y) * ratioP;
      
      // 计算圆角后的点
      const ratioN = actualRadius / distNext;
      const afterX = curr.x + (next.x - curr.x) * ratioN;
      const afterY = curr.y + (next.y - curr.y) * ratioN;
      
      // 直线到圆角前
      path += ` L ${beforeX + SVG_OVERFLOW_PADDING} ${beforeY + SVG_OVERFLOW_PADDING}`;
      // 二次贝塞尔曲线形成圆角
      path += ` Q ${curr.x + SVG_OVERFLOW_PADDING} ${curr.y + SVG_OVERFLOW_PADDING}, ${afterX + SVG_OVERFLOW_PADDING} ${afterY + SVG_OVERFLOW_PADDING}`;
    }
    
    // 最后一段直线
    const last = points[points.length - 1];
    path += ` L ${last.x + SVG_OVERFLOW_PADDING} ${last.y + SVG_OVERFLOW_PADDING}`;
    
    return path;
  };

  // 计算连接线路径的辅助函数（参考流程图库的正交路由算法，优化短距离路径）
  const calculateConnectionPath = (
    fromPoint: { x: number; y: number },
    toPoint: { x: number; y: number },
    fromSide: 'top' | 'right' | 'bottom' | 'left',
    toSide: 'top' | 'right' | 'bottom' | 'left'
  ): string => {
    const offset = CONNECTION_OFFSET;
    
    // 计算从起点延伸后的点（向外延伸）
    let fromExtendX = fromPoint.x, fromExtendY = fromPoint.y;
    if (fromSide === 'right') fromExtendX += offset;
    else if (fromSide === 'left') fromExtendX -= offset;
    else if (fromSide === 'bottom') fromExtendY += offset;
    else if (fromSide === 'top') fromExtendY -= offset;
    
    // 计算垂直接入终点前的点（向外延伸）
    let toExtendX = toPoint.x, toExtendY = toPoint.y;
    if (toSide === 'right') toExtendX += offset;
    else if (toSide === 'left') toExtendX -= offset;
    else if (toSide === 'bottom') toExtendY += offset;
    else if (toSide === 'top') toExtendY -= offset;
    
    // 计算曼哈顿距离，用于判断是否使用简化路径
    const manhattanDist = Math.abs(fromPoint.x - toPoint.x) + Math.abs(fromPoint.y - toPoint.y);
    const isShortDistance = manhattanDist < offset * 3; // 短距离阈值
    
    let points: {x: number, y: number}[] = [];
    
    const fromIsHorizontal = fromSide === 'left' || fromSide === 'right';
    const toIsHorizontal = toSide === 'left' || toSide === 'right';
    
    // 情况1: 水平 → 垂直（L形，最优）
    if (fromIsHorizontal && !toIsHorizontal) {
      // 短距离时，直接连接，减少转折
      if (isShortDistance && Math.abs(fromExtendX - toExtendX) < offset * 2) {
        points = [fromPoint, {x: fromExtendX, y: toExtendY}, toPoint];
      } else {
        // 标准L形路径
        points = [
          fromPoint,
          {x: fromExtendX, y: fromPoint.y},
          {x: toExtendX, y: fromPoint.y},
          {x: toExtendX, y: toExtendY},
          toPoint
        ];
      }
    }
    // 情况2: 垂直 → 水平（L形，最优）
    else if (!fromIsHorizontal && toIsHorizontal) {
      // 短距离时，直接连接
      if (isShortDistance && Math.abs(fromExtendY - toExtendY) < offset * 2) {
        points = [fromPoint, {x: toExtendX, y: fromExtendY}, toPoint];
      } else {
        // 标准L形路径
        points = [
          fromPoint,
          {x: fromPoint.x, y: fromExtendY},
          {x: toExtendX, y: fromExtendY},
          {x: toExtendX, y: toPoint.y},
          toPoint
        ];
      }
    }
    // 情况3: 水平 → 水平
    else if (fromIsHorizontal && toIsHorizontal) {
      const sameDirection = (fromSide === 'right' && toSide === 'right') || 
                           (fromSide === 'left' && toSide === 'left');
      
      if (sameDirection) {
        // 同向：直接连接，使用L形路径（2个转折点）
        // 对于"左连左"或"右连右"，路径应该是：向外延伸 -> 水平移动 -> 垂直移动到目标 -> 向内连接
        if (fromSide === 'left') {
          // 左连左：两个点都在左侧，路径应该在左侧外部
          // 使用更左侧的点作为水平移动的X坐标
          const horizontalX = Math.min(fromExtendX, toExtendX);
          points = [
            fromPoint,
            {x: fromExtendX, y: fromPoint.y},
            {x: horizontalX, y: fromPoint.y}, // 水平移动到更左侧
            {x: horizontalX, y: toPoint.y},   // 垂直移动到目标Y
            {x: toExtendX, y: toPoint.y},
            toPoint
          ];
        } else {
          // 右连右：两个点都在右侧，路径应该在右侧外部
          // 使用更右侧的点作为水平移动的X坐标
          const horizontalX = Math.max(fromExtendX, toExtendX);
          points = [
            fromPoint,
            {x: fromExtendX, y: fromPoint.y},
            {x: horizontalX, y: fromPoint.y}, // 水平移动到更右侧
            {x: horizontalX, y: toPoint.y},   // 垂直移动到目标Y
            {x: toExtendX, y: toPoint.y},
            toPoint
          ];
        }
      } else {
        // 反向：Z形路径，短距离时简化
        if (isShortDistance) {
          // 短距离：直接使用中点，减少转折
          const midY = (fromPoint.y + toPoint.y) / 2;
          points = [
            fromPoint,
            {x: fromExtendX, y: fromPoint.y},
            {x: fromExtendX, y: midY},
            {x: toExtendX, y: midY},
            {x: toExtendX, y: toPoint.y},
            toPoint
          ];
        } else {
          // 长距离：标准Z形
          const midY = (fromPoint.y + toPoint.y) / 2;
          const safeMidY = Math.abs(midY - fromPoint.y) < offset ? 
            (fromPoint.y < toPoint.y ? fromPoint.y - offset : fromPoint.y + offset) : midY;
          points = [
            fromPoint,
            {x: fromExtendX, y: fromPoint.y},
            {x: fromExtendX, y: safeMidY},
            {x: toExtendX, y: safeMidY},
            {x: toExtendX, y: toPoint.y},
            toPoint
          ];
        }
      }
    }
    // 情况4: 垂直 → 垂直
    else {
      const sameDirection = (fromSide === 'bottom' && toSide === 'bottom') || 
                           (fromSide === 'top' && toSide === 'top');
      
      if (sameDirection) {
        // 同向：直接连接，使用L形路径（2个转折点）
        // 对于"上连上"或"下连下"，路径应该是：向外延伸 -> 垂直移动 -> 水平移动到目标 -> 向内连接
        if (fromSide === 'top') {
          // 上连上：两个点都在上方，路径应该在上方外部
          // 使用更上方的点作为垂直移动的Y坐标
          const verticalY = Math.min(fromExtendY, toExtendY);
          points = [
            fromPoint,
            {x: fromPoint.x, y: fromExtendY},
            {x: fromPoint.x, y: verticalY},  // 垂直移动到更上方
            {x: toPoint.x, y: verticalY},    // 水平移动到目标X
            {x: toPoint.x, y: toExtendY},
            toPoint
          ];
        } else {
          // 下连下：两个点都在下方，路径应该在下方外部
          // 使用更下方的点作为垂直移动的Y坐标
          const verticalY = Math.max(fromExtendY, toExtendY);
          points = [
            fromPoint,
            {x: fromPoint.x, y: fromExtendY},
            {x: fromPoint.x, y: verticalY},  // 垂直移动到更下方
            {x: toPoint.x, y: verticalY},    // 水平移动到目标X
            {x: toPoint.x, y: toExtendY},
            toPoint
          ];
        }
      } else {
        // 反向：Z形路径，短距离时简化
        if (isShortDistance) {
          // 短距离：直接使用中点
          const midX = (fromPoint.x + toPoint.x) / 2;
          points = [
            fromPoint,
            {x: fromPoint.x, y: fromExtendY},
            {x: midX, y: fromExtendY},
            {x: midX, y: toExtendY},
            {x: toPoint.x, y: toExtendY},
            toPoint
          ];
        } else {
          // 长距离：标准Z形
          const midX = (fromPoint.x + toPoint.x) / 2;
          const safeMidX = Math.abs(midX - fromPoint.x) < offset ? 
            (fromPoint.x < toPoint.x ? fromPoint.x - offset : fromPoint.x + offset) : midX;
          points = [
            fromPoint,
            {x: fromPoint.x, y: fromExtendY},
            {x: safeMidX, y: fromExtendY},
            {x: safeMidX, y: toExtendY},
            {x: toPoint.x, y: toExtendY},
            toPoint
          ];
        }
      }
    }
    
    // 智能路径优化：移除不必要的中间点
    const optimizedPoints: {x: number, y: number}[] = [points[0]];
    
    for (let i = 1; i < points.length - 1; i++) {
      const prev = optimizedPoints[optimizedPoints.length - 1];
      const curr = points[i];
      const next = points[i + 1];
      
      // 计算三个点形成的角度
      const dx1 = curr.x - prev.x;
      const dy1 = curr.y - prev.y;
      const dx2 = next.x - curr.x;
      const dy2 = next.y - curr.y;
      
      // 如果三个点几乎在一条直线上（角度接近180度），跳过中间点
      const dot = dx1 * dx2 + dy1 * dy2;
      const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
      const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
      const cosAngle = dot / (len1 * len2);
      
      // 如果角度接近180度（cos接近-1），说明是直线，可以跳过中间点
      if (cosAngle < -0.99 && len1 > 1 && len2 > 1) {
        // 跳过这个中间点
        continue;
      }
      
      // 检查距离，太近的点合并
      const dist = Math.sqrt(Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2));
      if (dist < 2) {
        continue;
      }
      
      optimizedPoints.push(curr);
    }
    
    // 添加终点
    optimizedPoints.push(points[points.length - 1]);
    
    // 最终清理：移除重复的连续点
    const cleanedPoints: {x: number, y: number}[] = [];
    for (let i = 0; i < optimizedPoints.length; i++) {
      const curr = optimizedPoints[i];
      if (cleanedPoints.length === 0) {
        cleanedPoints.push(curr);
        continue;
      }
      
      const prev = cleanedPoints[cleanedPoints.length - 1];
      const dist = Math.sqrt(Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2));
      if (dist > 1) {
        cleanedPoints.push(curr);
      }
    }
    
    // 确保至少有两个点
    if (cleanedPoints.length < 2) {
      cleanedPoints.push(toPoint);
    }
    
    return createRoundedPath(cleanedPoints, CONNECTION_LINE_CORNER_RADIUS);
  };

  // 使用 useMemo 缓存连接线路径计算
  const connectionPaths = useMemo(() => {
    return connections.map(conn => {
      const fromNote = notes.find(n => n.id === conn.fromNoteId);
      const toNote = notes.find(n => n.id === conn.toNoteId);
      if (!fromNote || !toNote) return null;
      
      const fromIsDragging = draggingNoteId === conn.fromNoteId;
      const toIsDragging = draggingNoteId === conn.toNoteId;
      const fromPoint = getConnectionPoint(fromNote, conn.fromSide, fromIsDragging, dragOffset);
      const toPoint = getConnectionPoint(toNote, conn.toSide, toIsDragging, dragOffset);
      
      const pathD = calculateConnectionPath(fromPoint, toPoint, conn.fromSide, conn.toSide);
      
      return {
        id: conn.id,
        pathD
      };
    }).filter(p => p !== null);
  }, [connections, notes, draggingNoteId, dragOffset]);

  // Apply initial transform when container is ready
  useEffect(() => {
    if (!containerRef.current) return;
    const initial = calculateInitialTransform();
    // Only set if different to avoid unnecessary updates
    setTransform(prev => {
      if (Math.abs(prev.x - initial.x) > 0.01 ||
          Math.abs(prev.y - initial.y) > 0.01 ||
          Math.abs(prev.scale - initial.scale) > 0.001) {
        return initial;
      }
      return prev;
    });
  }, [calculateInitialTransform]);

  // Initial zoom to fit all notes on mount (deprecated - now handled by calculateInitialTransform)
  useEffect(() => {
    if (notes.length > 0 && containerRef.current && !isEditMode) {
        // 使用setTimeout确保容器尺寸已计算
        const timer = setTimeout(() => {
            if (!containerRef.current) return;
            
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        notes.forEach(note => {
            minX = Math.min(minX, note.boardX);
            minY = Math.min(minY, note.boardY);
            const w = note.variant === 'compact' ? 180 : 256;
            const h = note.variant === 'compact' ? 180 : 256;
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
            const newScale = Math.min(Math.max(0.2, Math.min(scaleX, scaleY) * 0.9), 4); // 90%缩放以留出边距

        const newX = (cW - contentWidth * newScale) / 2 - minX * newScale;
        const newY = (cH - contentHeight * newScale) / 2 - minY * newScale;

            // 使用动画过渡，避免突然跳跃
            const startTransform = { ...transform };
            const endTransform = { x: newX, y: newY, scale: newScale };
            const duration = 400; // 400ms 动画
            const startTime = Date.now();
            
            const animate = () => {
              const elapsed = Date.now() - startTime;
              const progress = Math.min(elapsed / duration, 1);
              // 使用 easeOutCubic 缓动函数
              const eased = 1 - Math.pow(1 - progress, 3);
              
              setTransform({
                x: startTransform.x + (endTransform.x - startTransform.x) * eased,
                y: startTransform.y + (endTransform.y - startTransform.y) * eased,
                scale: startTransform.scale + (endTransform.scale - startTransform.scale) * eased
              });
              
              if (progress < 1) {
                requestAnimationFrame(animate);
              }
            };
            
            requestAnimationFrame(animate);
        }, 100);
        
        return () => clearTimeout(timer);
    }
  }, [notes.length, isEditMode]); // 只在notes数量变化或退出编辑模式时触发

  // Zoom to Fit on Enter Edit Mode with animation
  useEffect(() => {
    if (isEditMode && notes.length > 0 && containerRef.current) {
        // Wait for DOM to render and measure text notes
        const calculateBounds = () => {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            notes.forEach(note => {
                let w: number, h: number;
                
                if (note.variant === 'compact') {
                    w = 180;
                    h = 180;
                } else {
                    w = 256;
                    h = 256;
                }
                
                minX = Math.min(minX, note.boardX);
                minY = Math.min(minY, note.boardY);
                maxX = Math.max(maxX, note.boardX + w);
                maxY = Math.max(maxY, note.boardY + h);
            });

            const padding = 100;
            minX -= padding; 
            minY -= padding;
            maxX += padding; 
            maxY += padding;
            const contentWidth = maxX - minX;
            const contentHeight = maxY - minY;
            const { width: cW, height: cH } = containerRef.current.getBoundingClientRect();

            const scaleX = cW / contentWidth;
            const scaleY = cH / contentHeight;
            // Remove min/max constraints to fit exactly
            const newScale = Math.min(scaleX, scaleY);

            const newX = (cW - contentWidth * newScale) / 2 - minX * newScale;
            const newY = (cH - contentHeight * newScale) / 2 - minY * newScale;

            // 使用动画过渡
            const startTransform = { ...transform };
            const endTransform = { x: newX, y: newY, scale: newScale };
            const duration = 400; // 400ms 动画
            const startTime = Date.now();
            
            const animate = () => {
              const elapsed = Date.now() - startTime;
              const progress = Math.min(elapsed / duration, 1);
              // 使用 easeOutCubic 缓动函数
              const eased = 1 - Math.pow(1 - progress, 3);
              
              setTransform({
                x: startTransform.x + (endTransform.x - startTransform.x) * eased,
                y: startTransform.y + (endTransform.y - startTransform.y) * eased,
                scale: startTransform.scale + (endTransform.scale - startTransform.scale) * eased
              });
              
              if (progress < 1) {
                requestAnimationFrame(animate);
              }
            };
            
            requestAnimationFrame(animate);
        };

        // Wait a frame for DOM to render text notes
        requestAnimationFrame(() => {
            // Give text notes time to measure
            setTimeout(calculateBounds, 50);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode]);

  // Track transform changes and notify parent (only when transform actually changes)
  const prevTransformRef = useRef<{ x: number, y: number, scale: number }>(transform);
  const isRestoringRef = useRef(false);
  
  useEffect(() => {
    // Only call onTransformChange if transform actually changed and we're not restoring
    if (onTransformChange && !isRestoringRef.current) {
      const prev = prevTransformRef.current;
      if (Math.abs(prev.x - transform.x) > 0.01 || 
          Math.abs(prev.y - transform.y) > 0.01 || 
          Math.abs(prev.scale - transform.scale) > 0.001) {
        onTransformChange(transform.x, transform.y, transform.scale);
        prevTransformRef.current = { ...transform };
      }
    } else if (isRestoringRef.current) {
      // Update ref after restoration
      prevTransformRef.current = { ...transform };
      isRestoringRef.current = false;
    }
  }, [transform, onTransformChange]);

  // Navigate to specific coordinates when navigateToCoords is set, or restore saved transform
  useEffect(() => {
    if (!containerRef.current) return;
    
    if (navigateToCoords) {
      const { width, height } = containerRef.current.getBoundingClientRect();
      const targetX = navigateToCoords.x;
      const targetY = navigateToCoords.y;
      
      // Calculate scale to fit the target note (assuming 256x256 note size)
      const noteSize = 256;
      const padding = 100;
      const targetScale = Math.min(
        (width - padding * 2) / noteSize,
        (height - padding * 2) / noteSize,
        2 // Max scale
      );
      
      // Center the target note in view
      const newX = width / 2 - targetX * targetScale;
      const newY = height / 2 - targetY * targetScale;
      
      // Animate to target position
      const startTransform = { ...transform };
      const endTransform = { x: newX, y: newY, scale: targetScale };
      const duration = 400;
      const startTime = Date.now();
      
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        
        setTransform({
          x: startTransform.x + (endTransform.x - startTransform.x) * eased,
          y: startTransform.y + (endTransform.y - startTransform.y) * eased,
          scale: startTransform.scale + (endTransform.scale - startTransform.scale) * eased
        });
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          onNavigateComplete?.();
        }
      };
      
      requestAnimationFrame(animate);
    } else if (!navigateToCoords && containerRef.current) {
      // If no navigate coords, use calculated initial transform
      const initial = calculateInitialTransform();
      if (Math.abs(initial.x - transform.x) > 0.01 || 
          Math.abs(initial.y - transform.y) > 0.01 || 
          Math.abs(initial.scale - transform.scale) > 0.001) {
        isRestoringRef.current = true;
        setTransform(initial);
        onNavigateComplete?.();
      }
    }
  }, [navigateToCoords, containerRef, transform, onNavigateComplete, calculateInitialTransform]);

  const closeEditor = () => {
    // Delay clearing editingNote to ensure any pending state updates are processed
    setTimeout(() => {
    setEditingNote(null);
    }, 100);
    onToggleEditor(false);
  };

  // Handle image import (from photos with GPS) - show preview in BoardView
  const handleImageImport = async (files: FileList | null, showLimitMessage = false) => {
    if (!files || files.length === 0) return;
    
    const fileArray = Array.from(files); // No limit on number of images
    
    const previews: Array<{
      file: File;
      imageUrl: string;
      lat: number;
      lng: number;
      error?: string;
      isDuplicate?: boolean;
      imageFingerprint?: string;
    }> = [];
    
    for (const file of fileArray) {
      try {
        // Read EXIF data with comprehensive options for better compatibility
        // Support multiple phone manufacturers (Xiaomi, OPPO, etc.)
        let exifData = await exifr.parse(file, {
          gps: true,
          translateKeys: false,
          translateValues: false,
          reviveValues: true
        });
        
        // If GPS data not found, try reading all EXIF data without filters
        if (!exifData || (!exifData.latitude && !exifData.GPSLatitude && !exifData.GPS)) {
          console.log('GPS not found in primary parse, trying full EXIF read for:', file.name);
          exifData = await exifr.parse(file, {
            translateKeys: false,
            translateValues: false,
            reviveValues: true
          });
          
          console.log('Full EXIF data for', file.name, ':', exifData);
        }
        
        // Try multiple ways to extract GPS coordinates
        // Different manufacturers may store GPS data in different formats
        let lat = null;
        let lng = null;
        
        if (exifData) {
          // Method 1: Direct latitude/longitude (standard format, most common)
          if (exifData.latitude !== undefined && exifData.longitude !== undefined) {
            lat = Number(exifData.latitude);
            lng = Number(exifData.longitude);
          }
          // Method 2: GPSLatitude/GPSLongitude with ref (Xiaomi, some Android)
          else if (exifData.GPSLatitude !== undefined && exifData.GPSLongitude !== undefined) {
            lat = Number(exifData.GPSLatitude);
            lng = Number(exifData.GPSLongitude);
            // Apply reference (N/S, E/W)
            if (exifData.GPSLatitudeRef === 'S') lat = -lat;
            if (exifData.GPSLongitudeRef === 'W') lng = -lng;
          }
          // Method 3: GPS object (some formats)
          else if (exifData.GPS) {
            if (exifData.GPS.latitude !== undefined && exifData.GPS.longitude !== undefined) {
              lat = Number(exifData.GPS.latitude);
              lng = Number(exifData.GPS.longitude);
            } else if (exifData.GPS.GPSLatitude !== undefined && exifData.GPS.GPSLongitude !== undefined) {
              lat = Number(exifData.GPS.GPSLatitude);
              lng = Number(exifData.GPS.GPSLongitude);
              if (exifData.GPS.GPSLatitudeRef === 'S') lat = -lat;
              if (exifData.GPS.GPSLongitudeRef === 'W') lng = -lng;
            }
          }
          // Method 4: Try to parse from GPS array format [degrees, minutes, seconds]
          // Some manufacturers store GPS as arrays
          else if (exifData.GPSLatitude && Array.isArray(exifData.GPSLatitude)) {
            const latArray = exifData.GPSLatitude;
            const lngArray = exifData.GPSLongitude;
            if (latArray.length >= 3 && lngArray.length >= 3) {
              lat = latArray[0] + latArray[1] / 60 + latArray[2] / 3600;
              lng = lngArray[0] + lngArray[1] / 60 + lngArray[2] / 3600;
              if (exifData.GPSLatitudeRef === 'S') lat = -lat;
              if (exifData.GPSLongitudeRef === 'W') lng = -lng;
            }
          }
          // Method 5: Try alternative key names (case variations)
          else {
            const keys = Object.keys(exifData);
            const latKey = keys.find(k => k.toLowerCase().includes('lat') && !k.toLowerCase().includes('ref'));
            const lngKey = keys.find(k => k.toLowerCase().includes('lng') || (k.toLowerCase().includes('lon') && !k.toLowerCase().includes('ref')));
            
            if (latKey && lngKey) {
              lat = Number(exifData[latKey]);
              lng = Number(exifData[lngKey]);
              // Check for ref keys
              const latRefKey = keys.find(k => k.toLowerCase().includes('lat') && k.toLowerCase().includes('ref'));
              const lngRefKey = keys.find(k => (k.toLowerCase().includes('lng') || k.toLowerCase().includes('lon')) && k.toLowerCase().includes('ref'));
              if (latRefKey && exifData[latRefKey] === 'S') lat = -lat;
              if (lngRefKey && exifData[lngRefKey] === 'W') lng = -lng;
            }
          }
        }
        
        // Validate coordinates
        if (lat === null || lng === null || isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
          console.warn('Could not extract GPS coordinates from:', file.name);
          console.warn('Available EXIF keys:', exifData ? Object.keys(exifData) : 'No EXIF data');
          console.warn('EXIF data sample:', exifData ? JSON.stringify(exifData, null, 2).substring(0, 500) : 'No data');
          previews.push({
            file,
            imageUrl: URL.createObjectURL(file),
            lat: 0,
            lng: 0,
            error: 'Missing location data'
          });
          continue;
        }
        
        // Calculate image fingerprint
        const imageUrl = URL.createObjectURL(file);
        const imageFingerprint = await calculateImageFingerprint(file, imageUrl, lat, lng);
        
        // Check if this image has already been imported (lightweight comparison, no filename)
        let isDuplicate = false;
        
        // Compare with existing images
        for (const note of notes) {
          if (!note.images || note.images.length === 0) continue;
          
          for (const existingImage of note.images) {
            try {
              // Calculate fingerprint for existing image (no filename)
              const existingFingerprint = await calculateFingerprintFromBase64(existingImage);
              
              // Debug: log fingerprints for comparison
              console.log('Comparing fingerprints:', {
                new: imageFingerprint,
                existing: existingFingerprint,
                match: imageFingerprint === existingFingerprint
              });
              
              // Compare fingerprints (exact match)
              if (imageFingerprint === existingFingerprint) {
                isDuplicate = true;
                console.log('Duplicate detected: exact fingerprint match');
                break;
              }
              
              // Fallback: compare by width and height only (without pixel)
              const currentParts = imageFingerprint.split('_');
              const existingParts = existingFingerprint.split('_');
              
              // Fingerprint format: width_height_firstPixel
              // So indices are: [0]=width, [1]=height, [2]=firstPixel
              if (currentParts.length >= 2 && existingParts.length >= 2) {
                // Compare width and height (first 2 parts)
                const currentBase = currentParts.slice(0, 2).join('_');
                const existingBase = existingParts.slice(0, 2).join('_');
                
                if (currentBase === existingBase) {
                  isDuplicate = true;
                  console.log('Duplicate detected: width and height match');
                  break;
                }
              }
            } catch (error) {
              console.error('Error comparing fingerprints:', error);
            }
          }
          if (isDuplicate) break;
        }
        
        previews.push({
          file,
          imageUrl: imageUrl,
          lat: lat,
          lng: lng,
          isDuplicate: isDuplicate,
          imageFingerprint: imageFingerprint
        });
      } catch (error) {
        console.error('Error reading EXIF data from:', file.name, error);
        previews.push({
          file,
          imageUrl: URL.createObjectURL(file),
          lat: 0,
          lng: 0,
          error: 'Unable to read image or location data'
        });
      }
    }
    
    setImportPreview(previews);
    setShowImportDialog(true);
  };
  
  // Confirm import
  const handleConfirmImport = async () => {
    // Filter out errors and duplicates
    const validPreviews = importPreview.filter(p => !p.error && !p.isDuplicate);
    const duplicateCount = importPreview.filter(p => !p.error && p.isDuplicate).length;
    
    if (validPreviews.length === 0) {
      if (duplicateCount > 0) {
        alert(`All images have already been imported. ${duplicateCount} duplicate(s) skipped.`);
      } else {
        alert('No valid images to import');
      }
      return;
    }
    
    // Calculate board position for imported notes (same logic as createNoteAtCenter)
    const boardNotes = notes.filter(n => n.boardX !== undefined && n.boardY !== undefined);
    const noteWidth = 256; // Default width for standard notes
    const noteHeight = 256; // Default height for standard notes
    const spacing = 50;
    const aspectRatioThreshold = 2.5; // If width/height > 2.5, start a new row
    
    let spawnX = 100;
    let spawnY = 100;
    
    if (boardNotes.length > 0) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let sumCenterY = 0;
      let count = 0;
      
      boardNotes.forEach(note => {
        const existingNoteWidth = (note.variant === 'compact') ? 180 : 256;
        const existingNoteHeight = (note.variant === 'compact') ? 180 : 256;
        const noteLeft = note.boardX || 0;
        const noteRight = noteLeft + existingNoteWidth;
        const noteTop = note.boardY || 0;
        const noteBottom = noteTop + existingNoteHeight;
        const noteCenterY = noteTop + existingNoteHeight / 2;
        
        if (noteLeft < minX) minX = noteLeft;
        if (noteTop < minY) minY = noteTop;
        if (noteRight > maxX) maxX = noteRight;
        if (noteBottom > maxY) maxY = noteBottom;
        sumCenterY += noteCenterY;
        count++;
      });
      
      if (maxX !== -Infinity && minY !== Infinity && count > 0) {
        // Check aspect ratio - if too wide, show warning and prevent import
        const contentWidth = maxX - minX;
        const contentHeight = maxY - minY;
        const aspectRatioThreshold = 2.5; // If width/height > 2.5, show warning
        const aspectRatio = contentHeight > 0 ? contentWidth / contentHeight : 0;
        
        if (aspectRatio > aspectRatioThreshold) {
          // Show warning and prevent import
          alert('先整理一下便利贴吧');
          if (onSwitchToBoardView) {
            onSwitchToBoardView();
          }
          // Clean up and return
          setImportPreview([]);
          setIsDragging(false);
          return;
        }
        
        // Continue current row: add to the right, aligned to top
        spawnX = maxX + spacing;
        spawnY = minY;
      }
    }
    
    // Create notes for each valid preview
    for (let i = 0; i < validPreviews.length; i++) {
      const preview = validPreviews[i];
      const newNote: Note = {
        id: generateId(),
        createdAt: Date.now() + i,
        coords: {
          lat: preview.lat,
          lng: preview.lng
        },
        fontSize: 3,
        emoji: '',
        text: '',
        images: [preview.imageUrl],
        tags: [],
        variant: 'standard',
        color: '#FFFDF5',
        boardX: spawnX + (i * (noteWidth + spacing)),
        boardY: spawnY
      };
      
      onAddNote?.(newNote);
    }
    
    // Show message if there were duplicates
    if (duplicateCount > 0) {
      alert(`Successfully imported ${validPreviews.length} new image(s). ${duplicateCount} duplicate(s) were skipped.`);
    }
    
    // Clean up
    importPreview.forEach(p => URL.revokeObjectURL(p.imageUrl));
    setImportPreview([]);
    setShowImportDialog(false);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  // Cancel import
  const handleCancelImport = (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    // Clean up all preview URLs
    importPreview.forEach(p => {
      if (p.imageUrl) {
        URL.revokeObjectURL(p.imageUrl);
      }
    });
    setImportPreview([]);
    setShowImportDialog(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle data import (JSON)
  const handleDataImport = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (!data.project || !data.project.notes) {
        alert('Invalid project file format');
        return;
      }

      const importedNotes = (data.project.notes || []).filter((note: Note) => 
        note.boardX !== undefined && note.boardY !== undefined
      );

      if (importedNotes.length === 0) {
        alert('No notes with board position data found in the imported file');
        return;
      }

      // Check for duplicates and merge
      const existingNotes = notes || [];
      const isDuplicateNote = (note1: Note, note2: Note): boolean => {
        if (note1.boardX === undefined || note2.boardX === undefined) return false;
        if (note1.boardY === undefined || note2.boardY === undefined) return false;
        const xDiff = Math.abs(note1.boardX - note2.boardX);
        const yDiff = Math.abs(note1.boardY - note2.boardY);
        const textMatch = (note1.text || '').trim() === (note2.text || '').trim();
        return xDiff < 5 && yDiff < 5 && textMatch;
      };

      const uniqueImportedNotes = importedNotes.filter((importedNote: Note) => {
        return !existingNotes.some((existingNote: Note) => 
          isDuplicateNote(importedNote, existingNote)
        );
      });

      // Calculate offset to place imported notes to the right
      let offsetX = 0;
      let offsetY = 0;
      if (existingNotes.length > 0) {
        let maxX = -Infinity;
        let minY = Infinity;
        existingNotes.forEach(note => {
          const noteWidth = (note.variant === 'compact') ? 180 : 256;
          const noteRight = (note.boardX || 0) + noteWidth;
          const noteTop = note.boardY || 0;
          if (noteRight > maxX) maxX = noteRight;
          if (noteTop < minY) minY = noteTop;
        });
        offsetX = maxX + 50;
        offsetY = minY;
      }

      // Generate new IDs and offset positions for imported notes
      // Also handle image separation for imported notes
      const newNotes = await Promise.all(uniqueImportedNotes.map(async (note: Note) => {
        // 不要根据内容自动判断 variant，保持原始 variant 或默认为 standard
        const variant: 'standard' | 'compact' | 'image' = note.variant || 'standard';
        
        const processedNote: Note = {
          ...note,
          id: generateId(),
          createdAt: Date.now() + Math.random(),
          boardX: (note.boardX || 0) + offsetX,
          boardY: (note.boardY || 0) + (offsetY - (uniqueImportedNotes[0]?.boardY || 0)),
          variant: variant
        };

        // Process images: convert Base64 to image IDs if needed
        if (note.images && note.images.length > 0) {
          const processedImages: string[] = [];
          for (const imageData of note.images) {
            if (imageData.startsWith('img-')) {
              // Already an image ID, keep it
              processedImages.push(imageData);
            } else {
              // Base64 data, save it and get image ID
              try {
                const imageId = await saveImage(imageData);
                processedImages.push(imageId);
              } catch (error) {
                console.error('Failed to save imported image:', error);
                // Keep original Base64 as fallback
                processedImages.push(imageData);
              }
            }
          }
          processedNote.images = processedImages;
        }

        // Process sketch: convert Base64 to sketch ID if needed
        if (note.sketch) {
          if (note.sketch.startsWith('img-')) {
            // Already a sketch ID, keep it
            processedNote.sketch = note.sketch;
          } else {
            // Base64 data, save it and get sketch ID
            try {
              const sketchId = await saveSketch(note.sketch);
              processedNote.sketch = sketchId;
            } catch (error) {
              console.error('Failed to save imported sketch:', error);
              // Keep original Base64 as fallback
              processedNote.sketch = note.sketch;
            }
          }
        }

        return processedNote;
      }));

      // Add all new notes
      newNotes.forEach(note => onAddNote?.(note));

      const duplicateCount = importedNotes.length - uniqueImportedNotes.length;
      if (duplicateCount > 0) {
        alert(`Successfully imported ${uniqueImportedNotes.length} new notes. ${duplicateCount} duplicate(s) were skipped.`);
      } else {
        alert(`Successfully imported ${uniqueImportedNotes.length} note(s).`);
      }
    } catch (error) {
      console.error('Failed to import data:', error);
      alert('Failed to import data. Please check the file format.');
    }
  };

  // Close import menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowImportMenu(false);
      }
    };
    if (showImportMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showImportMenu]);

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Check if we're actually leaving the container (not just moving to a child element)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    // If the mouse is outside the container bounds, hide the drag overlay
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragging(false);
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    // Always hide drag overlay when drag ends (even if cancelled)
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      // Filter image and JSON files
      const imageFiles: File[] = Array.from(files as FileList).filter((file: File) => {
        if (file.type && file.type.startsWith('image/')) return true;
        const name = file.name.toLowerCase();
        return (
          name.endsWith('.jpg') || name.endsWith('.jpeg') ||
          name.endsWith('.png') || name.endsWith('.webp') ||
          name.endsWith('.gif') || name.endsWith('.bmp') ||
          name.endsWith('.tif') || name.endsWith('.tiff') ||
          name.endsWith('.heic') || name.endsWith('.heif')
        );
      });
      const jsonFiles: File[] = Array.from(files as FileList).filter((file: File) => 
        file.type === 'application/json' || file.name.endsWith('.json')
      );

      if (imageFiles.length > 0) {
        // 编辑模式下（且未打开便签编辑器）拖入图片：新增图片对象
        if (isEditMode && !editingNote) {
          try {
            for (const file of imageFiles) {
              const { base64, width, height } = await compressImageToBase64(file, 512);
              // 计算投放位置（使用鼠标位置）
              const rect = containerRef.current?.getBoundingClientRect();
              let position;
              if (rect) {
                const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
                const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
                position = { x: worldX, y: worldY };
              }
              createImageNote(base64, width, height, position);
            }
          } catch (error) {
            console.error('Failed to add image note:', error);
          }
        } else if (editingNote && editingNote.variant !== 'compact') {
          // 如果正在编辑便签，仍然把图片加到当前便签
          try {
            const newImages: string[] = [];
            for (const file of imageFiles) {
              const base64 = await fileToBase64(file as File);
              newImages.push(base64);
            }
            const updatedNote = {
              ...editingNote,
              images: [...(editingNote.images || []), ...newImages]
            };
            onUpdateNote(updatedNote);
            setEditingNote(updatedNote);
          } catch (error) {
            console.error('Failed to add images to note:', error);
          }
        } else {
          // 非编辑模式保持原有导入逻辑
          const dataTransfer = new DataTransfer();
          imageFiles.forEach((file) => {
            dataTransfer.items.add(file as File);
          });
          handleImageImport(dataTransfer.files, true);
        }
      } else if (jsonFiles.length > 0 && jsonFiles[0]) {
        // For JSON, import directly
        handleDataImport(jsonFiles[0] as File);
      }
    }
  };

const compressImageToBase64 = (file: File, targetShortSide = 512): Promise<{ base64: string; width: number; height: number }> => {
  return new Promise(async (resolve, reject) => {
    try {
      // Check if file is HEIC format
      const isHeic = file.type === 'image/heic' || 
                     file.type === 'image/heif' || 
                     file.name.toLowerCase().endsWith('.heic') ||
                     file.name.toLowerCase().endsWith('.heif');
      
      let processedFile = file;
      
      if (isHeic) {
        try {
          // Dynamically import heic2any to avoid issues with ESM/CommonJS
          const heic2anyModule = await import('heic2any');
          // heic2any can be exported as default or named export
          const heic2anyFn = (heic2anyModule as any).default || heic2anyModule;
          
          // Try multiple conversion methods for better compatibility with iPhone 15 Pro HEIF
          const conversionMethods = [
            { toType: 'image/jpeg', quality: 0.9, extension: '.jpg', mimeType: 'image/jpeg' },
            { toType: 'image/jpeg', quality: 0.8, extension: '.jpg', mimeType: 'image/jpeg' },
            { toType: 'image/png', quality: undefined, extension: '.png', mimeType: 'image/png' }
          ];
          
          let lastError: any = null;
          let converted = false;
          
          for (const method of conversionMethods) {
            try {
              const options: any = {
                blob: file,
                toType: method.toType
              };
              if (method.quality !== undefined) {
                options.quality = method.quality;
              }
              
              const convertedBlob = await heic2anyFn(options);
              
              // heic2any returns an array, get the first item
              const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
              
              if (!blob) {
                throw new Error('Conversion returned empty result');
              }
              
              // Create a new File object from the converted blob
              const newFileName = file.name.replace(/\.(heic|heif)$/i, method.extension);
              processedFile = new File([blob], newFileName, {
                type: method.mimeType,
                lastModified: file.lastModified
              });
              converted = true;
              break;
            } catch (error: any) {
              console.log(`HEIC conversion failed with ${method.toType} (quality: ${method.quality}):`, error);
              lastError = error;
              // Continue to next method
              continue;
            }
          }
          
          if (!converted) {
            // All conversion methods failed
            console.error('All HEIC conversion methods failed. Last error:', lastError);
            const errorMessage = lastError?.message || 'Unknown error';
            
            // Check for specific error types
            if (errorMessage.includes('ERR_LIBHEIF') || errorMessage.includes('format not supported')) {
              const detailedError = `无法转换此 HEIC/HEIF 文件

可能原因：
• iPhone 15 Pro 等新设备使用了更新的 HEIF 格式
• 浏览器端转换库暂不支持此格式

解决方案（推荐按顺序尝试）：
1. 【最简单】在 iPhone 上更改设置：
   设置 > 相机 > 格式 > 选择"兼容性最佳"
   这样新照片会直接保存为 JPEG 格式

2. 使用 Mac 预览应用转换：
   打开图片 > 文件 > 导出 > 选择 JPEG 格式

3. 使用在线转换工具：
   • https://cloudconvert.com/heic-to-jpg
   • https://convertio.co/zh/heic-jpg/
   • https://heictojpeg.com/

4. 使用 App Store 中的转换应用

注意：这是浏览器端转换库的技术限制，不是应用的问题。`;
              reject(new Error(detailedError));
              return;
            }
            
            reject(new Error(`HEIC/HEIF 图片转换失败: ${errorMessage}\n\n请尝试将图片转换为 JPEG/PNG 格式后重试。`));
            return;
          }
        } catch (error: any) {
          console.error('HEIC conversion failed:', error);
          const errorMessage = error?.message || 'Unknown error';
          reject(new Error(`HEIC/HEIF 图片转换失败: ${errorMessage}。请将图片转换为 JPEG/PNG 格式后重试。`));
          return;
        }
      }
      
      const img = new Image();
      img.onload = () => {
        const { width, height } = img;
        const scale = targetShortSide / Math.min(width, height);
        const newWidth = Math.round(width * scale);
        const newHeight = Math.round(height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = newWidth;
        canvas.height = newHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Cannot get canvas context'));
          return;
        }
        ctx.drawImage(img, 0, 0, newWidth, newHeight);
        const base64 = canvas.toDataURL('image/png');
        resolve({ base64, width: newWidth, height: newHeight });
      };
      img.onerror = reject;
      const reader = new FileReader();
      reader.onload = (ev) => {
        img.src = ev.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(processedFile);
    } catch (error) {
      reject(error);
    }
  });
};

  const createImageNote = (base64: string, imgWidth: number, imgHeight: number, position?: { x: number; y: number }) => {
    if (!containerRef.current) return;
    const { width, height } = containerRef.current.getBoundingClientRect();
    const centerX = position ? position.x : (width / 2 - transform.x) / transform.scale;
    const centerY = position ? position.y : (height / 2 - transform.y) / transform.scale;

    const boardWidth = imgWidth;
    const boardHeight = imgHeight;
    const spawnX = centerX - boardWidth / 2;
    const spawnY = centerY - boardHeight / 2;

    const newNote: Note = {
      id: generateId(),
      createdAt: Date.now(),
      coords: { lat: 0, lng: 0 },
      emoji: '',
      text: '',
      fontSize: 3,
      images: [base64],
      tags: [],
      boardX: spawnX,
      boardY: spawnY,
      variant: 'image',
      color: 'transparent',
      imageWidth: boardWidth,
      imageHeight: boardHeight,
    };
    onAddNote?.(newNote);
  };

  const handleImageInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { base64, width, height } = await compressImageToBase64(file, 512);
      createImageNote(base64, width, height);
    } catch (error) {
      console.error('Failed to add image note:', error);
    } finally {
      e.target.value = '';
    }
  };

  const handleAddImageClick = () => {
    if (imageFileInputRef.current) {
      imageFileInputRef.current.click();
    }
  };

  // Create note at specified position (in board coordinates)
  const createNoteAtPosition = (boardX: number, boardY: number, variant: 'compact') => {
    const noteWidth = variant === 'compact' ? 180 : 256;
    const noteHeight = variant === 'compact' ? 180 : 256;
    
    // Adjust position to center the note at the click point
    const spawnX = boardX - noteWidth / 2;
    const spawnY = boardY - noteHeight / 2;

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
    setIsSelectingNotePosition(false); // Exit position selection mode
  };

const createNoteAtCenter = (variant: 'compact') => {
     if (!containerRef.current) return;
     const { width, height } = containerRef.current.getBoundingClientRect();
     
     // Base center in world coordinates
     const centerX = (width / 2 - transform.x) / transform.scale;
     const centerY = (height / 2 - transform.y) / transform.scale;

     // New note dimensions (must match actual rendered sizes)
     // compact: 180px, text/standard: 256px
     const noteWidth = variant === 'compact' ? 180 : 256;
     const noteHeight = variant === 'compact' ? 180 : 256;
     const spacing = 50; // Spacing between new note and existing content (reduced from 100)

     let spawnX = centerX - noteWidth / 2;
     let spawnY = centerY - noteHeight / 2;

     // New logic: detect bounds of existing content, add to the right or start new row if too wide
     if (notes.length > 0) {
        // Calculate bounds of all existing notes
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        
        notes.forEach(note => {
          // Use actual note width based on variant (must match rendered sizes)
          // compact: 180px, text/standard: 256px
          const existingNoteWidth = (note.variant === 'compact') ? 180 : 256;
          const existingNoteHeight = (note.variant === 'compact') ? 180 : 256;
          const noteLeft = note.boardX;
          const noteRight = noteLeft + existingNoteWidth;
          const noteTop = note.boardY;
          const noteBottom = noteTop + existingNoteHeight;
          
          if (noteLeft < minX) minX = noteLeft;
          if (noteTop < minY) minY = noteTop;
          if (noteRight > maxX) maxX = noteRight;
          if (noteBottom > maxY) maxY = noteBottom;
        });
        
        // Ensure we have valid values before using them
        if (maxX !== -Infinity && minY !== Infinity) {
          // Check aspect ratio - if too wide, show warning and prevent note creation
          const contentWidth = maxX - minX;
          const contentHeight = maxY - minY;
          const aspectRatioThreshold = 2.5; // If width/height > 2.5, show warning
          const aspectRatio = contentHeight > 0 ? contentWidth / contentHeight : 0;
          
          if (aspectRatio > aspectRatioThreshold) {
            // Show warning and prevent note creation
            alert('先整理一下便利贴吧');
            if (onSwitchToBoardView) {
              onSwitchToBoardView();
            }
            return; // Don't create the note
          }
          
          // Continue current row: add to the right, aligned to top
          spawnX = maxX + spacing;
          spawnY = minY;
        }
        
        console.log('createNoteAtCenter calculation:', {
          variant,
          noteWidth,
          noteHeight,
          maxX,
          minY,
          spacing,
          spawnX,
          spawnY,
          existingNotesCount: notes.length,
          notesPositions: notes.map(n => ({ 
            id: n.id, 
            boardX: n.boardX, 
            boardY: n.boardY, 
            variant: n.variant,
            calculatedRight: n.boardX + ((n.variant === 'compact') ? 180 : 500)
          }))
        });
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

  // 以视图中心为中心进行缩放
  const zoomAtViewCenter = (newScale: number) => {
    if (!containerRef.current) return;
    
    const { width, height } = containerRef.current.getBoundingClientRect();
    const viewCenterX = width / 2;
    const viewCenterY = height / 2;
    
    // 将视图中心转换为世界坐标
    const worldX = (viewCenterX - transform.x) / transform.scale;
    const worldY = (viewCenterY - transform.y) / transform.scale;
    
    // 计算新的 transform，使得同一个世界坐标点仍然在视图中心
    const newX = viewCenterX - worldX * newScale;
    const newY = viewCenterY - worldY * newScale;
    
    setTransform({ x: newX, y: newY, scale: newScale });
  };

  const handleWheel = (e: WheelEvent) => {
    // 检测 Ctrl/Cmd + 滚轮缩放
    const isZoomGesture = e.ctrlKey || e.metaKey;
    
    if (isZoomGesture) {
        e.preventDefault();
        const zoomSensitivity = 0.001;
        const delta = -e.deltaY * zoomSensitivity;
        const newScale = Math.min(Math.max(0.2, transform.scale + delta), 4);
        zoomAtViewCenter(newScale);
    } else {
        setTransform(prev => ({
            ...prev,
            x: prev.x - e.deltaX,
            y: prev.y - e.deltaY
        }));
    }
  };
  
  // 处理触摸双指缩放
  const touchStartRef = useRef<{ 
    distance: number; 
    scale: number; 
    centerX: number; 
    centerY: number;
    transformX: number;
    transformY: number;
  } | null>(null);
  
  const [isZooming, setIsZooming] = useState(false);
  
  // Use native event listeners for touch events to allow preventDefault
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e: TouchEvent) => {
      // 如果是双指，取消所有长按检测
      if (e.touches.length === 2) {
        e.preventDefault(); // 禁用浏览器的双指缩放
        setIsZooming(true); // 标记正在缩放
        
        // 取消便利贴的长按检测
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        longPressNoteIdRef.current = null;
        
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const distance = Math.sqrt(
          Math.pow(touch2.clientX - touch1.clientX, 2) + 
          Math.pow(touch2.clientY - touch1.clientY, 2)
        );
        // 计算两指中心点（相对于容器）
        const centerX = (touch1.clientX + touch2.clientX) / 2;
        const centerY = (touch1.clientY + touch2.clientY) / 2;
        
        if (container) {
          const rect = container.getBoundingClientRect();
          const relativeCenterX = centerX - rect.left;
          const relativeCenterY = centerY - rect.top;
          
          touchStartRef.current = { 
            distance, 
            scale: transform.scale,
            centerX: relativeCenterX,
            centerY: relativeCenterY,
            transformX: transform.x,
            transformY: transform.y
          };
        }
      }
    };
    
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && touchStartRef.current && container) {
        e.preventDefault();
        // 阻止长按检测
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        longPressNoteIdRef.current = null;
        
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const distance = Math.sqrt(
          Math.pow(touch2.clientX - touch1.clientX, 2) + 
          Math.pow(touch2.clientY - touch1.clientY, 2)
        );
        const scaleRatio = distance / touchStartRef.current.distance;
        const newScale = Math.min(Math.max(0.2, touchStartRef.current.scale * scaleRatio), 4);
        
        // 计算当前两指中心点（相对于容器）
        const currentCenterX = (touch1.clientX + touch2.clientX) / 2;
        const currentCenterY = (touch1.clientY + touch2.clientY) / 2;
        const rect = container.getBoundingClientRect();
        const relativeCenterX = currentCenterX - rect.left;
        const relativeCenterY = currentCenterY - rect.top;
        
        // 将当前两指中心点转换为世界坐标（使用当前的 transform）
        // 这样缩放就会以当前两指中心为中心
        const worldX = (relativeCenterX - transform.x) / transform.scale;
        const worldY = (relativeCenterY - transform.y) / transform.scale;
        
        // 计算新的 transform，使得同一个世界坐标点仍然在当前两指中心位置
        const newX = relativeCenterX - worldX * newScale;
        const newY = relativeCenterY - worldY * newScale;
        
        setTransform({ 
          x: newX, 
          y: newY, 
          scale: newScale 
        });
      }
    };
    
    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        touchStartRef.current = null;
        // 延迟重置缩放状态，防止触发误点击
        setTimeout(() => {
          setIsZooming(false);
        }, 100);
      }
    };

    // Add event listeners with { passive: false } to allow preventDefault
    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [transform, longPressTimerRef, longPressNoteIdRef]);

  // Add wheel event listener with passive: false to allow preventDefault
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const wheelHandler = (e: WheelEvent) => {
      // 检测 Ctrl/Cmd + 滚轮缩放
      const isZoomGesture = e.ctrlKey || e.metaKey;
      
      if (isZoomGesture) {
        e.preventDefault();
        const zoomSensitivity = 0.001;
        const delta = -e.deltaY * zoomSensitivity;
        const currentScale = transform.scale;
        const newScale = Math.min(Math.max(0.2, currentScale + delta), 4);
        zoomAtViewCenter(newScale);
      } else {
        setTransform(prev => ({
          ...prev,
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY
        }));
      }
    };

    container.addEventListener('wheel', wheelHandler, { passive: false });

    return () => {
      container.removeEventListener('wheel', wheelHandler);
    };
  }, [transform, zoomAtViewCenter]);

  const handleBoardPointerDown = (e: React.PointerEvent) => {
      // 阻止浏览器默认长按菜单
      e.preventDefault();
      
      // 如果在Frame绘制模式
      if (isDrawingFrame) {
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          // 坐标转换：从屏幕坐标转换为世界坐标
          // 使用与拖动frame相同的公式，确保一致性
          const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
          const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
          setDrawingFrameStart({ x: worldX, y: worldY });
          setDrawingFrameEnd({ x: worldX, y: worldY });
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          return;
      }
      
      // 检查事件目标是否是 note 元素
      // 如果目标是 note，不清空长按计时器，让 note 自己处理
      const target = e.target as HTMLElement;
      const isNoteClick = target.closest('[data-is-note]') !== null;
      
      // 只有当目标不是 note 时，才取消长按检测和单击检测
      if (!isNoteClick) {
        // 取消任何进行中的长按检测
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        longPressNoteIdRef.current = null;
        // 注意：不清空 currentNotePressIdRef，因为用户可能在note上按下，然后移动鼠标到背景上
        // currentNotePressIdRef 会在 handleNotePointerUp 中根据移动距离判断是否清空
      }
      
      // Box selection mode (when box select mode is active and in edit mode)
      if (e.button === 0 && isBoxSelecting && isEditMode && !draggingNoteId && !resizingFrame && !draggingFrameId && !isNoteClick && !resizingImage) {
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
          const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
          setBoxSelectStart({ x: worldX, y: worldY });
          setBoxSelectEnd({ x: worldX, y: worldY });
          // If Shift is pressed, preserve existing selection; otherwise replace
          if (!isShiftPressed) {
              setSelectedNoteIds(new Set());
              setSelectedNoteId(null);
          }
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          return;
      }
      
      // Allow panning in both edit and non-edit modes, but not when dragging notes or frames
      if (e.button === 0 && !draggingNoteId && !resizingFrame && !draggingFrameId) { 
          setIsPanning(true);
          const startPos = { x: e.clientX, y: e.clientY };
          panStartPos.current = startPos; // Save the initial pan position
          lastMousePos.current = startPos;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }
  };

  const handleBoardPointerMove = (e: React.PointerEvent) => {
      // 如果处于位置选择模式，更新预览位置
      if (isSelectingNotePosition && containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const boardX = (e.clientX - rect.left - transform.x) / transform.scale;
          const boardY = (e.clientY - rect.top - transform.y) / transform.scale;
          setNotePositionPreview({ x: boardX, y: boardY });
      }
      
      // 如果正在拖动Frame
      if (draggingFrameId && draggingFrameOffset) {
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
          const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
          
          onUpdateFrames?.(frames.map(f => 
              f.id === draggingFrameId ? { ...f, x: worldX - draggingFrameOffset.x, y: worldY - draggingFrameOffset.y } : f
          ));
          return;
      }
      
      // 如果正在调整图片大小（等比例缩放）
      if (resizingImage) {
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
          const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
          
          const dx = worldX - resizingImage.startX;
          const dy = worldY - resizingImage.startY;
          
          // 计算距离中心点的距离变化（用于等比例缩放）
          const centerX = resizingImage.startBoardX + resizingImage.startWidth / 2;
          const centerY = resizingImage.startBoardY + resizingImage.startHeight / 2;
          
          let distanceX = 0, distanceY = 0;
          switch (resizingImage.corner) {
              case 'tl':
                  distanceX = centerX - worldX;
                  distanceY = centerY - worldY;
                  break;
              case 'tr':
                  distanceX = worldX - centerX;
                  distanceY = centerY - worldY;
                  break;
              case 'bl':
                  distanceX = centerX - worldX;
                  distanceY = worldY - centerY;
                  break;
              case 'br':
                  distanceX = worldX - centerX;
                  distanceY = worldY - centerY;
                  break;
          }
          
          // 使用较大的距离变化来保持等比例
          const distance = Math.max(Math.abs(distanceX), Math.abs(distanceY));
          const scale = distance / (Math.min(resizingImage.startWidth, resizingImage.startHeight) / 2);
          
          // 保持宽高比
          const newWidth = Math.max(50, resizingImage.startWidth * scale);
          const newHeight = Math.max(50, resizingImage.startHeight * scale);
          
          // 计算新的位置（保持中心点不变）
          const newBoardX = centerX - newWidth / 2;
          const newBoardY = centerY - newHeight / 2;
          
          const note = notes.find(n => n.id === resizingImage.id);
          if (note) {
              onUpdateNote({
                  ...note,
                  boardX: newBoardX,
                  boardY: newBoardY,
                  imageWidth: newWidth,
                  imageHeight: newHeight
              });
          }
          return;
      }
      
      // 如果正在调整Frame大小
      if (resizingFrame) {
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
          const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
          
          const dx = worldX - resizingFrame.startX;
          const dy = worldY - resizingFrame.startY;
          
          const original = resizingFrame.originalFrame;
          let newX = original.x;
          let newY = original.y;
          let newWidth = original.width;
          let newHeight = original.height;
          
          switch (resizingFrame.corner) {
              case 'tl':
                  newX = original.x + dx;
                  newY = original.y + dy;
                  newWidth = original.width - dx;
                  newHeight = original.height - dy;
                  break;
              case 'tr':
                  newY = original.y + dy;
                  newWidth = original.width + dx;
                  newHeight = original.height - dy;
                  break;
              case 'bl':
                  newX = original.x + dx;
                  newWidth = original.width - dx;
                  newHeight = original.height + dy;
                  break;
              case 'br':
                  newWidth = original.width + dx;
                  newHeight = original.height + dy;
                  break;
          }
          
          // 最小尺寸限制
          if (newWidth < 100 || newHeight < 100) return;
          
          // Update frames using the original frame from resizingFrame state to avoid dependency on props
          onUpdateFrames?.(frames.map(f => 
              f.id === resizingFrame.id ? { ...original, x: newX, y: newY, width: newWidth, height: newHeight } : f
          ));
          return;
      }
      
      // 如果正在绘制Frame
      if (isDrawingFrame && drawingFrameStart) {
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          // 坐标转换：从屏幕坐标转换为世界坐标
          // 使用与拖动frame相同的公式，确保一致性
          const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
          const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
          setDrawingFrameEnd({ x: worldX, y: worldY });
          return;
      }
      
      // 如果正在框选
      if (isBoxSelecting && boxSelectStart) {
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
          const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
          setBoxSelectEnd({ x: worldX, y: worldY });
          
          // 计算框选区域
          const minX = Math.min(boxSelectStart.x, worldX);
          const maxX = Math.max(boxSelectStart.x, worldX);
          const minY = Math.min(boxSelectStart.y, worldY);
          const maxY = Math.max(boxSelectStart.y, worldY);
          
          // 找到所有在框选区域内的notes
          // When Shift is pressed, add to existing selection; otherwise replace selection
          const selectedIds = new Set<string>(isShiftPressed ? selectedNoteIds : new Set());
          notes.forEach(note => {
              const isImage = note.variant === 'image';
              const isCompact = note.variant === 'compact';
              const noteWidth = isImage ? (note.imageWidth || 256) : (isCompact ? 180 : 256);
              const noteHeight = isImage ? (note.imageHeight || 256) : (isCompact ? 180 : 256);
              const noteRight = note.boardX + noteWidth;
              const noteBottom = note.boardY + noteHeight;
              
              // 检查note是否与框选区域相交
              if (note.boardX < maxX && noteRight > minX && note.boardY < maxY && noteBottom > minY) {
                  selectedIds.add(note.id);
              } else if (!isShiftPressed) {
                  // 如果不按住shift，移除不在框选区域内的notes
                  selectedIds.delete(note.id);
              }
          });
          setSelectedNoteIds(selectedIds);
          return;
      }
      
      // 如果正在连接，处理连接线移动
      if (connectingFrom) {
        handleConnectionPointMove(e);
        return;
      }
      
      if (!isPanning || !lastMousePos.current) return;
      e.preventDefault(); // 阻止浏览器默认行为
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleBoardPointerUp = (e: React.PointerEvent) => {
      // 优先处理需要释放状态的操作，避免提前返回导致状态未释放
      
      // 如果正在调整Frame大小，结束调整
      if (resizingFrame) {
          setResizingFrame(null);
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
          return;
      }
      
      // 如果正在调整图片大小，结束调整
      if (resizingImage) {
          setResizingImage(null);
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
          return;
      }
      
      // 如果正在拖动Frame，结束拖动
      if (draggingFrameId) {
          setDraggingFrameId(null);
          setDraggingFrameOffset(null);
          return;
      }
      
      // 如果正在框选，结束当前框选操作（但保持框选模式）
      if (isBoxSelecting && boxSelectStart) {
          // Clear box select start/end but keep box select mode active
          setBoxSelectStart(null);
          setBoxSelectEnd(null);
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
          return;
      }
      
      // 检查是否点击了UI元素（按钮、面板等）
      const target = e.target as HTMLElement;
      if (target) {
          // 检查是否是交互元素
          const interactiveTags = ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A'];
          if (interactiveTags.includes(target.tagName)) {
              resetBlankClickCount();
              return;
          }
          
          // 检查是否在UI容器内（通过检查z-index或特定类名）
          let current: HTMLElement | null = target;
          while (current) {
              const zIndex = window.getComputedStyle(current).zIndex;
              if (zIndex && (zIndex === '500' || parseInt(zIndex) >= 500)) {
                  resetBlankClickCount();
                  return;
              }
              if (current.classList.contains('pointer-events-auto') && 
                  (current.classList.contains('fixed') || current.classList.contains('absolute'))) {
                  resetBlankClickCount();
                  return;
              }
              current = current.parentElement;
          }
      }
      
      // 检查是否有实际移动（点击 vs 拖动）
      // 使用拖动开始时的位置来计算总移动距离
      let hasMoved = false;
      
      if (isPanning && panStartPos.current) {
          const dx = e.clientX - panStartPos.current.x;
          const dy = e.clientY - panStartPos.current.y;
          const totalMoveDistance = Math.sqrt(dx * dx + dy * dy);
          hasMoved = totalMoveDistance > 5; // 如果总移动距离超过5px，认为是拖动
      }
      
      // 结束panning状态
      if (isPanning) {
          setIsPanning(false);
          lastMousePos.current = null;
          panStartPos.current = null; // Clear pan start position
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      }
      
      // 点击空白处的退出逻辑（只在非拖动/非缩放状态下触发）
      // 如果发生了拖动，不应该触发点击计数
      // 但如果是在多选拖动后，不要清除多选状态
      if (hasMoved) {
          resetBlankClickCount();
          // 如果是多选拖动，不清除多选状态
          if (isMultiSelectDragging) {
              return;
          }
          return;
      }
      
      // 如果正在绘制Frame，完成绘制（优先处理，不进行退出编辑模式的计数）
      if (isDrawingFrame && drawingFrameStart && drawingFrameEnd) {
          const minWidth = 100;
          const minHeight = 100;
          const x = Math.min(drawingFrameStart.x, drawingFrameEnd.x);
          const y = Math.min(drawingFrameStart.y, drawingFrameEnd.y);
          const width = Math.max(Math.abs(drawingFrameEnd.x - drawingFrameStart.x), minWidth);
          const height = Math.max(Math.abs(drawingFrameEnd.y - drawingFrameStart.y), minHeight);
          
          const newFrame: Frame = {
              id: generateId(),
              title: 'Frame',
              x,
              y,
              width,
              height,
              color: 'rgba(255, 255, 255, 0.5)'
          };
          
          onUpdateFrames?.([...frames, newFrame]);
          setIsDrawingFrame(false);
          setDrawingFrameStart(null);
          setDrawingFrameEnd(null);
          setSelectedFrameId(newFrame.id);
          setEditingFrameId(newFrame.id);
          setEditingFrameTitle('Frame');
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
          return;
      }
      
      // 只有在没有拖动（点击）且没有缩放时才执行退出逻辑
      if (!hasMoved && !isZooming) {
          // 0. 如果处于位置选择模式，在点击位置创建便签（最优先处理）
          if (isSelectingNotePosition && containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect();
              const boardX = (e.clientX - rect.left - transform.x) / transform.scale;
              const boardY = (e.clientY - rect.top - transform.y) / transform.scale;
              createNoteAtPosition(boardX, boardY, 'compact');
              (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
              return;
          }
          
          // 0. 如果处于框选模式或frame创建模式，点击空白处退出这些模式（优先处理）
          if (isBoxSelecting || isDrawingFrame) {
              setIsBoxSelecting(false);
              setIsDrawingFrame(false);
              setBoxSelectStart(null);
              setBoxSelectEnd(null);
              setDrawingFrameStart(null);
              setDrawingFrameEnd(null);
              resetBlankClickCount();
              return;
          }
          
          // 1. 如果有编辑中的Frame标题，先退出标题编辑
          if (editingFrameId) {
              setEditingFrameId(null);
              resetBlankClickCount();
              return;
          }
          
          // 2. 如果有选中状态，取消选中（Frame、Note或Connection）
          // 但如果按住 Shift 键且有多选，不清空多选
          // 如果正在拖动页面（isPanning），不清空多选
          // 如果刚刚完成多选拖动，不清空多选状态
          if (selectedFrameId || selectedNoteId || selectedConnectionId || (selectedNoteIds.size > 0 && !isShiftPressed && !e.shiftKey && !isPanning && !isMultiSelectDragging)) {
              setSelectedFrameId(null);
              setSelectedNoteId(null);
              if (!isShiftPressed && !e.shiftKey && !isPanning && !isMultiSelectDragging) {
                setSelectedNoteIds(new Set());
              }
              setSelectedConnectionId(null);
              resetBlankClickCount();
              return;
          }
          
          // 3. 非编辑模式下，点击空白处清除过滤
          if (!isEditMode && filterFrameIds.size > 0) {
              setFilterFrameIds(new Set());
              return;
          }
          
          // 4. 如果在编辑模式，需要点击两次空白处才退出（但不在绘制frame时计数）
          if (isEditMode && !isDrawingFrame) {
              blankClickCountRef.current += 1;
              
              // 清除之前的重置定时器
              if (blankClickResetTimerRef.current) {
                  clearTimeout(blankClickResetTimerRef.current);
              }
              
              // 如果点击了两次，退出编辑模式
              if (blankClickCountRef.current >= 2) {
                  setIsEditMode(false);
                  resetBlankClickCount();
              } else {
                  // 设置重置定时器，1秒内没有再次点击则重置计数
                  blankClickResetTimerRef.current = setTimeout(() => {
                      resetBlankClickCount();
                  }, 1000);
              }
              return;
          }
      }
      
      // 如果正在绘制Frame但还没有结束点，不处理（已在上面处理完成情况）
      if (isDrawingFrame) {
          return;
      }
      
      // 如果正在连接，处理连接释放
      if (connectingFrom && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left - transform.x) / transform.scale;
        const y = (e.clientY - rect.top - transform.y) / transform.scale;
        
        const target = findConnectionPointAt(x, y, connectingFrom.noteId);
        if (target) {
          handleConnectionPointUp(e, target.noteId, target.side);
        } else {
          handleConnectionPointUp(e);
        }
        return;
      }
  };

  const handleNotePointerDown = (e: React.PointerEvent, noteId: string, note: Note) => {
      // 如果正在缩放，不响应拖动
      if (isZooming) return;
      
      // 如果在位置选择模式，点击便签时退出位置选择模式
      if (isSelectingNotePosition) {
          setIsSelectingNotePosition(false);
      e.stopPropagation();
          return;
      }
      
      // 如果不在编辑模式，只记录位置信息用于单击检测，不启动长按计时器
      if (!isEditMode) {
          // 阻止默认的长按菜单和事件冒泡，确保note的点击事件被正确处理
          e.preventDefault();
      e.stopPropagation();
      
          // 记录当前按下的 note ID 和位置，用于单击检测
          currentNotePressIdRef.current = noteId;
          lastMousePos.current = { x: e.clientX, y: e.clientY };
          notePressStartPosRef.current = { x: e.clientX, y: e.clientY };
          return;
      }
      
      // 如果已经在编辑模式，检查是否是多选拖动
      e.stopPropagation();
      e.preventDefault();
      
      // Check if this note is part of multi-select
      if (selectedNoteIds.has(noteId) && selectedNoteIds.size > 1) {
        // Start multi-select drag
        setIsMultiSelectDragging(true);
        setMultiSelectDragOffset({ x: 0, y: 0 });
      } else {
        // Single note drag
      setDraggingNoteId(noteId);
      setDragOffset({ x: 0, y: 0 });
      }
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleNotePointerMove = (e: React.PointerEvent) => {
      // 如果正在缩放，不处理移动
      if (isZooming) return;
      
      // 非编辑模式下，检查移动距离，如果移动太多则清空单击检测状态
      if (!isEditMode) {
          if (lastMousePos.current && notePressStartPosRef.current) {
              const dx = e.clientX - notePressStartPosRef.current.x;
              const dy = e.clientY - notePressStartPosRef.current.y;
              const dist = Math.sqrt(dx*dx + dy*dy);
              // 如果移动超过20px，清空单击检测状态，让背景可以滑动
              // 提高阈值，避免轻微移动导致单击失效
              if (dist > 20) {
                  currentNotePressIdRef.current = null;
                  lastMousePos.current = null;
                  notePressStartPosRef.current = null;
              } else {
                  // 更新lastMousePos，用于跟踪移动
                  lastMousePos.current = { x: e.clientX, y: e.clientY };
              }
          }
          return;
      }
      
      // Handle multi-select drag
      if (isMultiSelectDragging && lastMousePos.current) {
        e.stopPropagation();
        e.preventDefault();
        
        const dx = e.clientX - lastMousePos.current.x;
        const dy = e.clientY - lastMousePos.current.y;
        const worldDx = dx / transform.scale;
        const worldDy = dy / transform.scale;

        setMultiSelectDragOffset(prev => ({ x: prev.x + worldDx, y: prev.y + worldDy }));
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        return;
      }
      
      if (!draggingNoteId || !lastMousePos.current) return;
      e.stopPropagation();
      e.preventDefault();
      
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      const worldDx = dx / transform.scale;
      const worldDy = dy / transform.scale;

      setDragOffset(prev => ({ x: prev.x + worldDx, y: prev.y + worldDy }));
      lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleNotePointerUp = (e: React.PointerEvent, note: Note) => {
      // 如果正在连接，检查是否连接到目标
      if (connectingFrom && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left - transform.x) / transform.scale;
        const y = (e.clientY - rect.top - transform.y) / transform.scale;
        
        const target = findConnectionPointAt(x, y, connectingFrom.noteId);
        if (target) {
          handleConnectionPointUp(e, target.noteId, target.side);
        } else {
          handleConnectionPointUp(e);
        }
        // 清理状态
        currentNotePressIdRef.current = null;
        notePressStartPosRef.current = null;
        return;
      }
      
      // Handle multi-select drag end
      if (isMultiSelectDragging && !isZooming && isEditMode) {
        e.stopPropagation();
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        
        if (multiSelectDragOffset.x !== 0 || multiSelectDragOffset.y !== 0) {
          // Update all selected notes
          selectedNoteIds.forEach(id => {
            const selectedNote = notes.find(n => n.id === id);
            if (selectedNote) {
              // 计算新的位置
              const newBoardX = selectedNote.boardX + multiSelectDragOffset.x;
              const newBoardY = selectedNote.boardY + multiSelectDragOffset.y;
              
              // 检查新位置是否在任何frame内
              const isCompact = selectedNote.variant === 'compact';
              const width = isCompact ? 180 : 256;
              const height = isCompact ? 180 : 256;
              
              const centerX = newBoardX + width / 2;
              const centerY = newBoardY + height / 2;
              
              // 找到所有包含新位置的Frames
              const containingFrames = frames.filter(frame => 
                centerX >= frame.x && 
                centerX <= frame.x + frame.width && 
                centerY >= frame.y && 
                centerY <= frame.y + frame.height
              );
              
              // 更新便签，包括位置和frame关系（支持多frame）
              if (containingFrames.length > 0) {
                const groupIds = containingFrames.map(f => f.id);
                const groupNames = containingFrames.map(f => f.title);
                const singleFrame = containingFrames[0];
                onUpdateNote({
                  ...selectedNote,
                  boardX: newBoardX,
                  boardY: newBoardY,
                  groupIds,
                  groupNames,
                  groupId: singleFrame.id, // 向后兼容
                  groupName: singleFrame.title // 向后兼容
                });
              } else {
                onUpdateNote({
                  ...selectedNote,
                  boardX: newBoardX,
                  boardY: newBoardY,
                  groupIds: undefined,
                  groupNames: undefined,
                  groupId: undefined,
                  groupName: undefined
                });
              }
            }
          });
        }
        
        setIsMultiSelectDragging(false);
        setMultiSelectDragOffset({ x: 0, y: 0 });
        lastMousePos.current = null;
        return;
      }
      
      // 先计算移动距离，用于判断是否真的发生了拖动
      let movedDistance = 0;
      if (notePressStartPosRef.current) {
          const dx = e.clientX - notePressStartPosRef.current.x;
          const dy = e.clientY - notePressStartPosRef.current.y;
          movedDistance = Math.sqrt(dx*dx + dy*dy);
      }
      const hasMoved = dragOffset.x !== 0 || dragOffset.y !== 0;
      const hasMovedEnough = movedDistance > 15; // 15px阈值
      const movedTooMuch = movedDistance > 10; // 10px阈值，用于判断短按
      
      // 如果正在拖动（编辑模式下），处理拖动结束
      if (draggingNoteId === note.id && !isZooming && isEditMode) {
          // 如果确实发生了拖动，处理拖动结束
          if (hasMoved || hasMovedEnough) {
          e.stopPropagation();
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

          if (dragOffset.x !== 0 || dragOffset.y !== 0) {
                  // 计算新的位置
                  const newBoardX = note.boardX + dragOffset.x;
                  const newBoardY = note.boardY + dragOffset.y;
                  
                  // 检查新位置是否在任何frame内
                  const isCompact = note.variant === 'compact';
                  const width = isCompact ? 180 : 256;
                  const height = isCompact ? 180 : 256;
                  
                  const centerX = newBoardX + width / 2;
                  const centerY = newBoardY + height / 2;
                  
                  // 找到所有包含新位置的Frames
                  const containingFrames = frames.filter(frame => 
                    centerX >= frame.x && 
                    centerX <= frame.x + frame.width && 
                    centerY >= frame.y && 
                    centerY <= frame.y + frame.height
                  );
                  
                  // 更新便签，包括位置和frame关系（支持多frame）
                  if (containingFrames.length > 0) {
                    const groupIds = containingFrames.map(f => f.id);
                    const groupNames = containingFrames.map(f => f.title);
                    const singleFrame = containingFrames[0];
              onUpdateNote({
                  ...note,
                      boardX: newBoardX,
                      boardY: newBoardY,
                      groupIds,
                      groupNames,
                      groupId: singleFrame.id, // 向后兼容
                      groupName: singleFrame.title // 向后兼容
                    });
                  } else {
                    onUpdateNote({
                      ...note,
                      boardX: newBoardX,
                      boardY: newBoardY,
                      groupIds: undefined,
                      groupNames: undefined,
                      groupId: undefined,
                      groupName: undefined
                    });
                  }
          }
          setDraggingNoteId(null);
          setDragOffset({ x: 0, y: 0 });
          lastMousePos.current = null;
              
              // 清理状态
              currentNotePressIdRef.current = null;
              notePressStartPosRef.current = null;
              return;
          } else {
              // 如果没有真正拖动，清除拖动状态
              setDraggingNoteId(null);
              setDragOffset({ x: 0, y: 0 });
          }
      }
      
      // 如果不在编辑模式，且是短按，打开编辑器
      if (!isEditMode) {
          // 图片对象不应该打开编辑器
          if (note.variant === 'image') {
              currentNotePressIdRef.current = null;
              lastMousePos.current = null;
              notePressStartPosRef.current = null;
              return;
          }
          
          // 检查是否在同一个note上按下和抬起
          const wasOnSameNote = currentNotePressIdRef.current === note.id;
          
          // 判断是否应该打开编辑器：
          // 1. 在同一个note上按下和抬起
          // 2. 移动距离很小（小于15px，说明是单击而不是拖动）
          // 提高阈值，让单击更容易触发
          const isShortClick = wasOnSameNote && movedDistance < 15;
          
          if (isShortClick) {
              e.stopPropagation();
              e.preventDefault();
              // 使用最新的便签数据
              const latestNote = notes.find(n => n.id === note.id) || note;
              ensureNoteImagesLoaded(latestNote).then(loadedNote => {
                setEditingNote(loadedNote);
                onToggleEditor(true);
              });
              
              // 清理状态
              currentNotePressIdRef.current = null;
              lastMousePos.current = null;
              notePressStartPosRef.current = null;
              return;
          }
      }
      
      // 清理状态
      currentNotePressIdRef.current = null;
      notePressStartPosRef.current = null;
  };

  // Track click timing to distinguish single vs double click
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastClickNoteIdRef = useRef<string | null>(null);
  const lastClickTimeRef = useRef<number>(0);

  const handleNoteClick = (e: React.MouseEvent, note: Note) => {
      e.stopPropagation(); 
      
      // 如果正在缩放，不触发点击
      if (isZooming) return;
      
      // 图片对象在非编辑模式下点击后放大预览 - 优先显示照片而不是涂鸦
      if (note.variant === 'image' && !isEditMode) {
        if (note.images && note.images[0]) {
          setPreviewImage(note.images[0]);
          return;
        } else if (note.sketch && note.sketch !== '') {
          setPreviewImage(note.sketch);
          return;
        }
      }
      
      // 图片对象在编辑模式下，单击选中（延迟执行，等待可能的双击）
      if (note.variant === 'image' && isEditMode) {
        const now = Date.now();
        const timeSinceLastClick = now - lastClickTimeRef.current;
        const isSameNote = lastClickNoteIdRef.current === note.id;
        
        // 如果距离上次点击时间很短（小于300ms）且是同一个图片，可能是双击的开始
        if (clickTimerRef.current) {
          clearTimeout(clickTimerRef.current);
        }
        
        // 延迟执行选中逻辑，等待可能的双击
        clickTimerRef.current = setTimeout(() => {
          if (!isShiftPressed && !e.shiftKey) {
            // Single select mode: clear multi-select and select only this note
            setSelectedNoteId(note.id);
            setSelectedNoteIds(new Set([note.id]));
          } else {
            // Multi-select mode: toggle selection
            setSelectedNoteIds(prev => {
              const newSet = new Set(prev);
              if (newSet.has(note.id)) {
                newSet.delete(note.id);
                if (newSet.size === 0) {
                  setSelectedNoteId(null);
                }
              } else {
                newSet.add(note.id);
                setSelectedNoteId(note.id);
              }
              return newSet;
            });
          }
          setConnectingFrom(null);
          setConnectingTo(null);
          setHoveringConnectionPoint(null);
          resetBlankClickCount();
        }, 300); // Wait 300ms to see if it's a double click
        
        lastClickNoteIdRef.current = note.id;
        lastClickTimeRef.current = now;
        return;
      }
      
      if (!isEditMode) {
        // 使用最新的便签数据
        const latestNote = notes.find(n => n.id === note.id) || note;
        ensureNoteImagesLoaded(latestNote).then(loadedNote => {
          setEditingNote(loadedNote);
          onToggleEditor(true);
        });
      } else {
        // 在编辑模式下，单击选中便利贴
        const now = Date.now();
        const timeSinceLastClick = now - lastClickTimeRef.current;
        const isSameNote = lastClickNoteIdRef.current === note.id;
        
        // 如果距离上次点击时间很短（小于300ms）且是同一个便签，可能是双击的开始
        // 但我们先处理单击逻辑，双击会在onDoubleClick中处理
        if (clickTimerRef.current) {
          clearTimeout(clickTimerRef.current);
        }
        
        // 延迟执行单击逻辑，等待可能的双击
        // 捕获当前的shift状态
        const wasShiftPressed = isShiftPressed || e.shiftKey;
        clickTimerRef.current = setTimeout(() => {
          if (wasShiftPressed) {
            // Multi-select mode: toggle selection (add or remove from selection)
            setSelectedNoteIds(prev => {
              const newSet = new Set(prev);
              if (newSet.has(note.id)) {
                newSet.delete(note.id);
                // If removing the last selected note, clear single selection too
                if (newSet.size === 0) {
                  setSelectedNoteId(null);
                } else {
                  // Keep the first remaining note as single selection
                  setSelectedNoteId(Array.from(newSet)[0]);
                }
              } else {
                newSet.add(note.id);
                // Update single selection to the clicked note
                setSelectedNoteId(note.id);
              }
              return newSet;
            });
          } else {
            // Single select mode: clear multi-select and select only this note
            setSelectedNoteId(note.id);
            setSelectedNoteIds(new Set([note.id]));
          }
          setConnectingFrom(null);
          setConnectingTo(null);
          setHoveringConnectionPoint(null);
          resetBlankClickCount();
        }, 300); // Wait 300ms to see if it's a double click
        
        lastClickNoteIdRef.current = note.id;
        lastClickTimeRef.current = now;
      }
  };

  const handleNoteDoubleClick = (e: React.MouseEvent, note: Note) => {
      e.stopPropagation();
      
      // 如果正在缩放，不触发点击
      if (isZooming) return;
      
      // 图片对象双击打开预览
      if (note.variant === 'image') {
        // 清除单击的延迟执行
        if (clickTimerRef.current) {
          clearTimeout(clickTimerRef.current);
          clickTimerRef.current = null;
        }
        // 优先显示照片
        if (note.images && note.images[0]) {
          setPreviewImage(note.images[0]);
          return;
        } else if (note.sketch && note.sketch !== '') {
          setPreviewImage(note.sketch);
          return;
        }
      }
      
      // 清除单击的延迟执行
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      
      // 在编辑模式下，双击打开编辑器
      if (isEditMode) {
        // 使用最新的便签数据
        const latestNote = notes.find(n => n.id === note.id) || note;
        ensureNoteImagesLoaded(latestNote).then(loadedNote => {
          setEditingNote(loadedNote);
          onToggleEditor(true);
        });
      }
  };
  
  // 获取连接点的位置
  // 处理连接点点击
  const handleConnectionPointDown = (e: React.PointerEvent, noteId: string, side: 'top' | 'right' | 'bottom' | 'left') => {
    e.stopPropagation();
    e.preventDefault();
    
    // 缩放时不触发连接
    if (isZooming) return;
    
    // 振动反馈
    if (navigator.vibrate) {
      navigator.vibrate(VIBRATION_SHORT);
    }
    
    setSelectedNoteId(noteId);
    setConnectingFrom({ noteId, side });
    resetBlankClickCount();
    
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - transform.x) / transform.scale;
      const y = (e.clientY - rect.top - transform.y) / transform.scale;
      setConnectingTo({ x, y });
    }
  };
  
  // 处理连接点移动
  const handleConnectionPointMove = (e: React.PointerEvent) => {
    if (!connectingFrom || !containerRef.current) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - transform.x) / transform.scale;
    const y = (e.clientY - rect.top - transform.y) / transform.scale;
    
    setConnectingTo({ x, y });
    
    // 检查是否悬停在连接点附近
    const target = findConnectionPointAt(x, y, connectingFrom.noteId);
    if (target) {
      setHoveringConnectionPoint({ noteId: target.noteId, side: target.side });
    } else {
      setHoveringConnectionPoint(null);
    }
  };
  
  // 处理连接点释放
  const handleConnectionPointUp = (e: React.PointerEvent, targetNoteId?: string, targetSide?: 'top' | 'right' | 'bottom' | 'left') => {
    if (!connectingFrom) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    // 释放指针捕获
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    
    if (targetNoteId && targetSide && targetNoteId !== connectingFrom.noteId) {
      // 创建连接成功，振动反馈
      if (navigator.vibrate) {
        navigator.vibrate(VIBRATION_LONG);
      }
      
      // 创建连接
      const newConnection = {
        id: generateId(),
        fromNoteId: connectingFrom.noteId,
        toNoteId: targetNoteId,
        fromSide: connectingFrom.side,
        toSide: targetSide,
        arrow: 'forward' as const // 默认正向箭头
      };
      
      const updatedConnections = [...connections, newConnection];
      onUpdateConnections?.(updatedConnections);
    }
    
    setConnectingFrom(null);
    setConnectingTo(null);
    setHoveringConnectionPoint(null);
  };
  
  // 检查点是否在连接点附近
  const findConnectionPointAt = (x: number, y: number, excludeNoteId?: string) => {
    for (const note of notes) {
      if (note.id === excludeNoteId) continue;
      
      const isDragging = draggingNoteId === note.id;
      for (const side of ['top', 'right', 'bottom', 'left'] as const) {
        const point = getConnectionPoint(note, side, isDragging, dragOffset);
        const dist = Math.sqrt(Math.pow(x - point.x, 2) + Math.pow(y - point.y, 2));
        if (dist < CONNECTION_POINT_DETECT_RADIUS) {
          return { noteId: note.id, side };
        }
      }
    }
    return null;
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      e.preventDefault();
      // Reset blank click count to prevent exiting edit mode
      resetBlankClickCount();
      
      // If multiple notes are selected, delete all selected notes
      if (selectedNoteIds.size > 1 && selectedNoteIds.has(id)) {
        selectedNoteIds.forEach(selectedId => onDeleteNote?.(selectedId));
        setSelectedNoteIds(new Set());
        setSelectedNoteId(null);
      } else {
        // Single note deletion
      onDeleteNote?.(id);
        // Also remove from selection if it was selected
        if (selectedNoteIds.has(id)) {
          const newSet = new Set(selectedNoteIds);
          newSet.delete(id);
          setSelectedNoteIds(newSet);
          if (selectedNoteId === id) {
            setSelectedNoteId(newSet.size > 0 ? Array.from(newSet)[0] : null);
          }
        }
      }
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
                ? `inset 0 0 0 8px ${themeColor}, inset 0 0 0 12px ${themeColor}4D, inset 0 0 80px ${themeColor}26` 
                : 'none'
        }}
    >
      <div 
        ref={containerRef}
        className={`w-full h-full overflow-hidden bg-gray-50 relative touch-none select-none ${
          isPanning 
            ? 'cursor-grabbing' 
            : 'cursor-grab'
        }`}
        style={isDragging ? { boxShadow: `0 0 0 4px ${themeColor}` } : undefined}
        onPointerDown={handleBoardPointerDown}
        onPointerMove={handleBoardPointerMove}
        onPointerLeave={(e) => {
            // 当鼠标离开画布时，清除位置预览
            if (isSelectingNotePosition) {
                setNotePositionPreview(null);
            }
        }}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
        onPointerUp={handleBoardPointerUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        {isDragging && (
          <div 
            className="absolute inset-0 z-[4000] backdrop-blur-sm flex items-center justify-center pointer-events-auto"
            style={{ backgroundColor: `${themeColor}33` }}
            onClick={(e) => {
              // 点击外部区域关闭
              if (e.target === e.currentTarget) {
                setIsDragging(false);
              }
            }}
          >
            <div 
              className="bg-white rounded-2xl shadow-2xl p-8 border-4 relative"
              style={{ borderColor: themeColor }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setIsDragging(false)}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
                title="取消"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
              <div className="text-center">
                <div className="mb-4 flex justify-center">
                  <svg width="64" height="64" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-gray-700">
                    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                    <path d="M8 11V5M5 8l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p className="text-2xl font-bold text-gray-800">Drop images or JSON files here to import</p>
              </div>
            </div>
          </div>
        )}
        <input
          type="file"
          accept="image/*"
          ref={imageFileInputRef}
          className="hidden"
          onChange={handleImageInputChange}
        />
        {/* Background */}
        <div 
          className="absolute inset-0 pointer-events-none z-0"
          style={{
              backgroundImage: `radial-gradient(${themeColor} ${dotSize}px, transparent ${dotSize + 0.5}px)`,
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
          {/* Note Position Preview - Theme color box indicator */}
          {isSelectingNotePosition && notePositionPreview && (
            <div
              className="absolute pointer-events-none z-[3000]"
              style={{
                left: `${notePositionPreview.x - 90}px`, // Center the 180px box
                top: `${notePositionPreview.y - 90}px`,
                width: '180px',
                height: '180px',
                border: `4px solid ${themeColor}`,
                borderRadius: '4px',
                boxShadow: `0 0 0 1px ${themeColor}4D`,
              }}
            />
          )}
          
          {/* Render connections */}
          {/* Frames Layer - Below everything */}
          {/* Box Selection Preview */}
          {isBoxSelecting && boxSelectStart && boxSelectEnd && (
            <div
              className="absolute pointer-events-none z-[3000]"
              style={{
                left: `${Math.min(boxSelectStart.x, boxSelectEnd.x)}px`,
                top: `${Math.min(boxSelectStart.y, boxSelectEnd.y)}px`,
                width: `${Math.abs(boxSelectEnd.x - boxSelectStart.x)}px`,
                height: `${Math.abs(boxSelectEnd.y - boxSelectStart.y)}px`,
                backgroundColor: `${themeColor}20`,
                border: `2px solid ${themeColor}`,
                borderRadius: '4px'
              }}
            />
          )}
          
          {/* Drawing Frame Preview */}
          {isDrawingFrame && drawingFrameStart && drawingFrameEnd && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: `${Math.min(drawingFrameStart.x, drawingFrameEnd.x)}px`,
                top: `${Math.min(drawingFrameStart.y, drawingFrameEnd.y)}px`,
                width: `${Math.abs(drawingFrameEnd.x - drawingFrameStart.x)}px`,
                height: `${Math.abs(drawingFrameEnd.y - drawingFrameStart.y)}px`,
                backgroundColor: 'rgba(255, 255, 255, 1)',
                border: '2px dashed rgba(156, 163, 175, 0.8)',
                borderRadius: '12px',
                zIndex: 10,
              }}
            />
          )}
          
          {layerVisibility.frame && frames.map((frame) => {
              // 如果有过滤，只显示选中的frames的框体，但标题始终显示
              const shouldShowFrame = filterFrameIds.size === 0 || filterFrameIds.has(frame.id);
              if (!shouldShowFrame) return null;
              
              return (
                <div
                  key={frame.id}
                  className="absolute transition-colors"
                  style={{
                left: `${frame.x}px`,
                top: `${frame.y}px`,
                width: `${frame.width}px`,
                height: `${frame.height}px`,
                backgroundColor: selectedFrameId === frame.id ? 'rgba(255, 221, 0, 0.2)' : frame.color,
                borderRadius: '12px',
                zIndex: selectedFrameId === frame.id ? 1000 : 10,
                pointerEvents: 'none',
              }}
            >
              {/* Fixed border that doesn't scale */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  border: selectedFrameId === frame.id ? `2px solid ${themeColor}` : '2px solid rgba(156, 163, 175, 0.3)',
                  borderRadius: '12px',
                  transform: `scale(${1 / transform.scale})`,
                  transformOrigin: 'top left',
                  width: `${frame.width * transform.scale}px`,
                  height: `${frame.height * transform.scale}px`,
                }}
              />
              {/* Frame中间区域，也当作空白处 - 让事件冒泡到背景 */}
              <div
                className="absolute pointer-events-auto"
                style={{
                  left: '10px',
                  top: '10px',
                  right: '10px',
                  bottom: '10px',
                  cursor: 'default',
                }}
                onClick={(e) => {
                  // 不阻止事件冒泡，让事件传递到背景，使用背景的计数逻辑
                }}
              />
              {/* 可交互的边框区域 - 使用4个边框div覆盖边框部分 */}
              {/* 上边框 */}
              <div
                className="absolute pointer-events-auto"
                style={{
                  left: '0',
                  top: '0',
                  right: '0',
                  height: '10px',
                  cursor: draggingFrameId === frame.id ? 'grabbing' : 'grab',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isZooming || !isEditMode) return;
                  setSelectedFrameId(frame.id);
                  setSelectedNoteId(null);
                  resetBlankClickCount();
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (!isEditMode || isZooming) return;
                  const rect = containerRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
                  const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
                  setDraggingFrameId(frame.id);
                  setDraggingFrameOffset({ x: worldX - frame.x, y: worldY - frame.y });
                  setSelectedFrameId(frame.id);
                  setSelectedNoteId(null);
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  if (draggingFrameId === frame.id) {
                    setDraggingFrameId(null);
                    setDraggingFrameOffset(null);
                    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                  }
                }}
              />
              {/* 下边框 */}
              <div
                className="absolute pointer-events-auto"
                style={{
                  left: '0',
                  bottom: '0',
                  right: '0',
                  height: '10px',
                  cursor: draggingFrameId === frame.id ? 'grabbing' : 'grab',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isZooming || !isEditMode) return;
                  setSelectedFrameId(frame.id);
                  setSelectedNoteId(null);
                  resetBlankClickCount();
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (!isEditMode || isZooming) return;
                  const rect = containerRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
                  const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
                  setDraggingFrameId(frame.id);
                  setDraggingFrameOffset({ x: worldX - frame.x, y: worldY - frame.y });
                  setSelectedFrameId(frame.id);
                  setSelectedNoteId(null);
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  if (draggingFrameId === frame.id) {
                    setDraggingFrameId(null);
                    setDraggingFrameOffset(null);
                    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                  }
                }}
              />
              {/* 左边框 */}
              <div
                className="absolute pointer-events-auto"
                style={{
                  left: '0',
                  top: '10px',
                  bottom: '10px',
                  width: '10px',
                  cursor: draggingFrameId === frame.id ? 'grabbing' : 'grab',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isZooming || !isEditMode) return;
                  setSelectedFrameId(frame.id);
                  setSelectedNoteId(null);
                  resetBlankClickCount();
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (!isEditMode || isZooming) return;
                  const rect = containerRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
                  const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
                  setDraggingFrameId(frame.id);
                  setDraggingFrameOffset({ x: worldX - frame.x, y: worldY - frame.y });
                  setSelectedFrameId(frame.id);
                  setSelectedNoteId(null);
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  if (draggingFrameId === frame.id) {
                    setDraggingFrameId(null);
                    setDraggingFrameOffset(null);
                    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                  }
                }}
              />
              {/* 右边框 */}
              <div
                className="absolute pointer-events-auto"
                style={{
                  right: '0',
                  top: '10px',
                  bottom: '10px',
                  width: '10px',
                  cursor: draggingFrameId === frame.id ? 'grabbing' : 'grab',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isZooming || !isEditMode) return;
                  setSelectedFrameId(frame.id);
                  setSelectedNoteId(null);
                  resetBlankClickCount();
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (!isEditMode || isZooming) return;
                  const rect = containerRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
                  const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
                  setDraggingFrameId(frame.id);
                  setDraggingFrameOffset({ x: worldX - frame.x, y: worldY - frame.y });
                  setSelectedFrameId(frame.id);
                  setSelectedNoteId(null);
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  if (draggingFrameId === frame.id) {
                    setDraggingFrameId(null);
                    setDraggingFrameOffset(null);
                    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                  }
                }}
              />
              
              {/* Resize Handles - 只在编辑模式且选中时显示 */}
              {isEditMode && selectedFrameId === frame.id && (
                <>
                  {/* Top Left */}
                  <div
                    className="absolute cursor-nwse-resize pointer-events-auto"
                    style={{
                      left: '-6px',
                      top: '-6px',
                      width: '12px',
                      height: '12px',
                      backgroundColor: 'white',
                      border: `2px solid ${themeColor}`,
                      borderRadius: '2px',
                      transform: `scale(${1 / transform.scale})`,
                      transformOrigin: 'top left',
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      const rect = containerRef.current?.getBoundingClientRect();
                      if (!rect) return;
                      const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
                      const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
                      setResizingFrame({ id: frame.id, corner: 'tl', startX: worldX, startY: worldY, originalFrame: frame });
                      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    }}
                  />
                  
                  {/* Top Right */}
                  <div
                    className="absolute cursor-nesw-resize pointer-events-auto"
                    style={{
                      right: '-6px',
                      top: '-6px',
                      width: '12px',
                      height: '12px',
                      backgroundColor: 'white',
                      border: `2px solid ${themeColor}`,
                      borderRadius: '2px',
                      transform: `scale(${1 / transform.scale})`,
                      transformOrigin: 'top right',
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      const rect = containerRef.current?.getBoundingClientRect();
                      if (!rect) return;
                      const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
                      const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
                      setResizingFrame({ id: frame.id, corner: 'tr', startX: worldX, startY: worldY, originalFrame: frame });
                      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    }}
                  />
                  
                  {/* Bottom Left */}
                  <div
                    className="absolute cursor-nesw-resize pointer-events-auto"
                    style={{
                      left: '-6px',
                      bottom: '-6px',
                      width: '12px',
                      height: '12px',
                      backgroundColor: 'white',
                      border: `2px solid ${themeColor}`,
                      borderRadius: '2px',
                      transform: `scale(${1 / transform.scale})`,
                      transformOrigin: 'bottom left',
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      const rect = containerRef.current?.getBoundingClientRect();
                      if (!rect) return;
                      const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
                      const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
                      setResizingFrame({ id: frame.id, corner: 'bl', startX: worldX, startY: worldY, originalFrame: frame });
                      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    }}
                  />
                  
                  {/* Bottom Right */}
                  <div
                    className="absolute cursor-nwse-resize pointer-events-auto"
                    style={{
                      right: '-6px',
                      bottom: '-6px',
                      width: '12px',
                      height: '12px',
                      backgroundColor: 'white',
                      border: `2px solid ${themeColor}`,
                      borderRadius: '2px',
                      transform: `scale(${1 / transform.scale})`,
                      transformOrigin: 'bottom right',
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      const rect = containerRef.current?.getBoundingClientRect();
                      if (!rect) return;
                      const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
                      const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
                      setResizingFrame({ id: frame.id, corner: 'br', startX: worldX, startY: worldY, originalFrame: frame });
                      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    }}
                  />
                </>
              )}
            </div>
              );
            })}
          
          {/* Frame Titles Layer - Above Notes - 标题始终显示以便多选 */}
          {layerVisibility.frame && frames.map((frame) => (
            <React.Fragment key={frame.id}>
              {/* Frame border in title layer with 5% opacity - 只在frame框体显示时显示边框 */}
              {(filterFrameIds.size === 0 || filterFrameIds.has(frame.id)) && (
                <div
                  key={`frame-border-title-${frame.id}`}
                  className="absolute pointer-events-none"
                  style={{
                    left: `${frame.x}px`,
                    top: `${frame.y}px`,
                    width: `${frame.width * transform.scale}px`,
                    height: `${frame.height * transform.scale}px`,
                    border: '2px solid rgba(0, 0, 0, 0.05)',
                    borderRadius: '12px',
                    zIndex: selectedFrameId === frame.id ? 1001 : 200,
                    transform: `scale(${1 / transform.scale})`,
                    transformOrigin: 'top left',
                  }}
                />
              )}
              <div
                key={`title-${frame.id}`}
                className={`absolute -top-8 left-0 px-3 py-1 text-white text-sm font-bold rounded-lg shadow-md flex items-center gap-2 pointer-events-auto whitespace-nowrap ${
                  filterFrameIds.has(frame.id) ? '' : 'bg-gray-500/50'
                }`}
                style={{ 
                  left: `${frame.x}px`,
                  top: `${frame.y - 32}px`,
                  zIndex: selectedFrameId === frame.id ? 1002 : 201,
                  cursor: draggingFrameId === frame.id ? 'grabbing' : 'grab',
                  transform: `scale(${1 / transform.scale})`,
                  transformOrigin: 'top left',
                  wordBreak: 'keep-all',
                  opacity: filterFrameIds.size > 0 && !filterFrameIds.has(frame.id) ? 0.3 : 1,
                  backgroundColor: filterFrameIds.has(frame.id) ? themeColor : (selectedFrameId === frame.id ? themeColor : undefined)
                }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingFrameId(frame.id);
                setEditingFrameTitle(frame.title);
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (isZooming) return;
                if (isEditMode) {
                  setSelectedFrameId(frame.id);
                  setSelectedNoteId(null);
                  resetBlankClickCount();
                } else {
                  // 非编辑模式下，点击frame标题进行过滤（支持shift多选）
                  const newFilterFrameIds = new Set(filterFrameIds);
                  if (isShiftPressed) {
                    // Shift+点击：切换该frame的选中状态
                    if (newFilterFrameIds.has(frame.id)) {
                      newFilterFrameIds.delete(frame.id);
                    } else {
                      newFilterFrameIds.add(frame.id);
                    }
                  } else {
                    // 普通点击：如果已选中则取消，否则只选中这一个
                    if (newFilterFrameIds.has(frame.id)) {
                      // 如果已选中，则取消选中
                      newFilterFrameIds.delete(frame.id);
                    } else {
                      // 如果未选中，则只选中这一个
                      newFilterFrameIds.clear();
                      newFilterFrameIds.add(frame.id);
                    }
                  }
                  setFilterFrameIds(newFilterFrameIds);
                }
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (!isEditMode || editingFrameId === frame.id || isZooming) return;
                const rect = containerRef.current?.getBoundingClientRect();
                if (!rect) return;
                const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
                const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
                setDraggingFrameId(frame.id);
                setDraggingFrameOffset({ x: worldX - frame.x, y: worldY - frame.y });
                setSelectedFrameId(frame.id);
                setSelectedNoteId(null);
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              }}
              onPointerUp={(e) => {
                e.stopPropagation(); // 阻止传播到背景
                // 结束拖拽
                if (draggingFrameId === frame.id) {
                  setDraggingFrameId(null);
                  setDraggingFrameOffset(null);
                  (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                }
              }}
            >
              {editingFrameId === frame.id ? (
                <>
                  <input
                    ref={(input) => {
                      frameTitleInputRef.current = input;
                      // Auto focus when editing starts
                      if (input && editingFrameId === frame.id) {
                        setTimeout(() => input.focus(), 0);
                      }
                    }}
                    value={editingFrameTitle}
                    onChange={(e) => setEditingFrameTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        // Save title
                        const saveTitle = () => {
                          onUpdateFrames?.(frames.map(f => 
                            f.id === frame.id ? { ...f, title: editingFrameTitle || 'Frame' } : f
                          ));
                          setEditingFrameId(null);
                        };
                        saveTitle();
                      } else if (e.key === 'Escape') {
                        // Cancel editing, restore original title
                        setEditingFrameTitle(frame.title);
                        setEditingFrameId(null);
                      }
                    }}
                    onBlur={(e) => {
                      // Save title when clicking outside, but not when clicking the save button
                      const relatedTarget = e.relatedTarget as HTMLElement;
                      if (!relatedTarget || !frameTitleSaveButtonRef.current?.contains(relatedTarget)) {
                        // Use setTimeout to allow button click to process first
                        setTimeout(() => {
                          if (editingFrameId === frame.id) {
                            onUpdateFrames?.(frames.map(f => 
                              f.id === frame.id ? { ...f, title: editingFrameTitle || 'Frame' } : f
                            ));
                            setEditingFrameId(null);
                          }
                        }, 200);
                      }
                    }}
                    className="bg-transparent text-white px-2 py-0.5 rounded outline-none text-sm"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                  <button
                    ref={(button) => {
                      frameTitleSaveButtonRef.current = button;
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => {
                      e.preventDefault(); // Prevent input blur
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      // Save title
                      onUpdateFrames?.(frames.map(f => 
                        f.id === frame.id ? { ...f, title: editingFrameTitle || 'Frame' } : f
                      ));
                      setEditingFrameId(null);
                    }}
                    className="hover:bg-green-600 rounded p-0.5 transition-colors"
                  >
                    <Check size={14} />
                  </button>
                </>
              ) : (
                <span className="whitespace-nowrap" style={{ wordBreak: 'keep-all' }}>{frame.title}</span>
              )}
              {isEditMode && selectedFrameId === frame.id && editingFrameId !== frame.id && (
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (isZooming) return;
                    console.log('Deleting frame:', frame.id);
                    const newFrames = frames.filter(f => f.id !== frame.id);
                    onUpdateFrames?.(newFrames);
                    setSelectedFrameId(null);
                  }}
                  className="hover:bg-red-600 rounded p-0.5 transition-colors"
                >
                  <Minus size={14} />
                </button>
              )}
            </div>
            </React.Fragment>
          ))}

          {layerVisibility.connects && (
          <svg 
            className="absolute pointer-events-none" 
            style={{ 
              left: `-${SVG_OVERFLOW_PADDING}px`,
              top: `-${SVG_OVERFLOW_PADDING}px`,
              width: `calc(100% + ${SVG_OVERFLOW_PADDING * 2}px)`,
              height: `calc(100% + ${SVG_OVERFLOW_PADDING * 2}px)`,
              zIndex: 100,
              overflow: 'visible'
            }}
          >
            {/* 直角箭头标记定义和投影滤镜 */}
            <defs>
              {/* 投影滤镜 */}
              <filter id="connectionShadow" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="rgba(0,0,0,0.3)" floodOpacity="1"/>
              </filter>
              <marker
                id="arrowForward"
                markerWidth="36"
                markerHeight="36"
                refX="30"
                refY="18"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                {/* 90度折角箭头 */}
                <path
                  d="M 12 3 L 30 18 L 12 33"
                  stroke={themeColor}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </marker>
              <marker
                id="arrowReverse"
                markerWidth="36"
                markerHeight="36"
                refX="30"
                refY="18"
                orient="auto-start-reverse"
                markerUnits="userSpaceOnUse"
              >
                {/* 90度折角箭头 */}
                <path
                  d="M 12 3 L 30 18 L 12 33"
                  stroke={themeColor}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </marker>
            </defs>
            
            {connectionPaths.map((pathData, index) => {
              if (!pathData) return null;
              const conn = connections[index];
              
              // 如果有过滤frame，只显示起点属于这些frames的连线
              if (filterFrameIds.size > 0) {
                const fromNote = notes.find(n => n.id === conn.fromNoteId);
                if (!fromNote) return null;
                const groupIds = fromNote.groupIds || (fromNote.groupId ? [fromNote.groupId] : []);
                // 检查是否有任何groupIds在filterFrameIds中
                if (!groupIds.some(id => filterFrameIds.has(id))) return null;
              }
              
              const arrowState = conn.arrow || 'forward'; // 默认正向箭头
              
              // 确定箭头标记
              let markerEnd = '';
              let markerStart = '';
              
              if (arrowState === 'forward') {
                markerEnd = 'url(#arrowForward)';
              } else if (arrowState === 'reverse') {
                markerStart = 'url(#arrowReverse)';
              }
              
              // 处理点击：选中 -> forward -> reverse -> none -> delete
              const handleConnectionClick = (e: React.MouseEvent | React.PointerEvent) => {
                e.stopPropagation();
                e.preventDefault();
                if (!isEditMode) return;
                
                // 如果点击的是已选中的连接线，切换箭头状态
                if (selectedConnectionId === conn.id) {
                  let updatedConnections: Connection[];
                  
                  // 根据当前箭头状态切换到下一个状态（使用conn.arrow而不是arrowState）
                  const currentArrow = conn.arrow || 'forward';
                  
                  if (currentArrow === 'forward') {
                    // forward -> reverse
                    updatedConnections = connections.map(c => 
                      c.id === conn.id ? { ...c, arrow: 'reverse' as const } : c
                    );
                    onUpdateConnections?.(updatedConnections);
                  } else if (currentArrow === 'reverse') {
                    // reverse -> none
                    updatedConnections = connections.map(c => 
                      c.id === conn.id ? { ...c, arrow: 'none' as const } : c
                    );
                    onUpdateConnections?.(updatedConnections);
                  } else if (currentArrow === 'none') {
                    // none -> delete
                    updatedConnections = connections.filter(c => c.id !== conn.id);
                    onUpdateConnections?.(updatedConnections);
                    setSelectedConnectionId(null);
                  }
                  
                  if (navigator.vibrate) {
                    navigator.vibrate(VIBRATION_MEDIUM);
                  }
                } else {
                  // 选中连接线，清除其他选中状态
                  setSelectedConnectionId(conn.id);
                  setSelectedNoteId(null);
                  setSelectedFrameId(null);
                  resetBlankClickCount();
                  
                  if (navigator.vibrate) {
                    navigator.vibrate(VIBRATION_SHORT);
                  }
                }
              };
              
              const isSelected = selectedConnectionId === conn.id;
              
              // 在编辑模式下，未选中的连接线透明度减小30%，退出编辑模式后完全不透明
              const getOpacity = () => {
                if (isSelected) return 1;
                if (isEditMode) return 0.2 * 0.7; // 编辑模式下未选中：减小30%（0.2 * 0.7 = 0.14）
                return 1; // 非编辑模式下：完全不透明
              };
              
              return (
                <g key={pathData.id}>
                  {/* 选中时的背景高亮 */}
                  {isSelected && (
                    <path
                      d={pathData.pathD}
                      stroke={`${themeColor}4D`}
                      strokeWidth={CONNECTION_LINE_CLICKABLE_WIDTH / transform.scale}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  )}
                  {/* 连接线 */}
                  <path
                    d={pathData.pathD}
                    stroke={themeColor}
                    strokeWidth={(isSelected ? CONNECTION_LINE_WIDTH + 2 : CONNECTION_LINE_WIDTH) / transform.scale}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    markerEnd={markerEnd}
                    markerStart={markerStart}
                    opacity={getOpacity()}
                    filter="url(#connectionShadow)"
                  />
                  
                  {/* 可点击的透明宽线 */}
                  <path
                    d={pathData.pathD}
                    stroke="transparent"
                    strokeWidth={CONNECTION_LINE_CLICKABLE_WIDTH / transform.scale}
                    fill="none"
                    className="pointer-events-auto cursor-pointer"
                    onClick={handleConnectionClick}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      handleConnectionClick(e);
                    }}
                  />
                </g>
              );
            })}
            
            {/* Temporary connection line while dragging */}
            {connectingFrom && connectingTo && (() => {
              const fromNote = notes.find(n => n.id === connectingFrom.noteId);
              if (!fromNote) return null;
              
              const fromIsDragging = draggingNoteId === connectingFrom.noteId;
              const fromPoint = getConnectionPoint(fromNote, connectingFrom.side, fromIsDragging, dragOffset);
              
              // 检查是否悬停在连接点上
              const target = findConnectionPointAt(connectingTo.x, connectingTo.y, connectingFrom.noteId);
              const strokeOpacity = target ? 1 : 0.5;
              
              // 临时连接线使用直线即可
              const pathD = `M ${fromPoint.x + SVG_OVERFLOW_PADDING} ${fromPoint.y + SVG_OVERFLOW_PADDING} L ${connectingTo.x + SVG_OVERFLOW_PADDING} ${connectingTo.y + SVG_OVERFLOW_PADDING}`;
              
              return (
                <path
                  d={pathD}
                  stroke={themeColor}
                  strokeWidth={CONNECTION_LINE_WIDTH / transform.scale}
                  strokeLinecap="round"
                  strokeOpacity={strokeOpacity}
                  fill="none"
                  filter="url(#connectionShadow)"
                />
              );
            })()}
          </svg>
          )}
          {notes.filter(note => {
              // 如果有过滤frames，只显示属于这些frames的便签
              if (filterFrameIds.size > 0) {
                const groupIds = note.groupIds || (note.groupId ? [note.groupId] : []);
                // 检查是否有任何groupIds在filterFrameIds中
                return groupIds.some(id => filterFrameIds.has(id));
              }
              return true;
            }).map((note) => {
              // Check layer visibility based on note variant
              const isCompact = note.variant === 'compact';
              const isImage = note.variant === 'image';
              const isStandard = !isCompact && !isImage;
              
              // Determine if this note should be visible
              let shouldShow = false;
              if (isCompact && layerVisibility.secondary) shouldShow = true;
              else if (isImage && layerVisibility.image) shouldShow = true;
              else if (isStandard && layerVisibility.primary) shouldShow = true;
              
              if (!shouldShow) return null;
              
              const isDragging = draggingNoteId === note.id;
              const isInMultiSelect = selectedNoteIds.has(note.id);
              const currentX = note.boardX + (isDragging ? dragOffset.x : 0) + (isMultiSelectDragging && isInMultiSelect ? multiSelectDragOffset.x : 0);
              const currentY = note.boardY + (isDragging ? dragOffset.y : 0) + (isMultiSelectDragging && isInMultiSelect ? multiSelectDragOffset.y : 0);
              
              // 检查Note是否在任何Frame内
              const containingFrame = frames.find(frame => isNoteInFrame(note, frame));
              const isInFrame = !!containingFrame;

              // For compact/standard notes, use fixed dimensions
              const noteWidth: number = isImage ? (note.imageWidth || 256) : (isCompact ? 180 : 256);
              const noteHeight: number = isImage ? (note.imageHeight || 256) : (isCompact ? 180 : 256);

              // Determine line clamp based on font size to ensure it fits the box
              // Compact/Standard notes have fixed height.
              let clampClass = '';
              if (!isImage) {
                  // 让预览更宽容，减少在句中出现省略号：
                  // Compact 高度更小，但仍给 2~5 行；Standard 给 3~6 行
                  if (isCompact) {
                    if (note.fontSize >= 4) clampClass = 'line-clamp-2';
                    else if (note.fontSize === 3) clampClass = 'line-clamp-3';
                    else if (note.fontSize === 2) clampClass = 'line-clamp-4';
                    else clampClass = 'line-clamp-5';
                  } else {
                    if (note.fontSize >= 4) clampClass = 'line-clamp-3';
                    else if (note.fontSize === 3) clampClass = 'line-clamp-4';
                    else if (note.fontSize === 2) clampClass = 'line-clamp-5';
                    else clampClass = 'line-clamp-6';
                  }
              }

              // Get global standard size scale, default to 1
              const standardSizeScale = project?.standardSizeScale || 1;

              if (isImage) {
                const standardSizeScale = project?.standardSizeScale || 1;
              return (
                <motion.div
                  key={note.id}
                  initial={false}
                    data-is-note="true"
                  style={{ 
                      position: 'absolute', 
                      left: currentX, 
                      top: currentY,
                        zIndex: (selectedNoteId === note.id || selectedNoteIds.has(note.id) || isDragging || (isMultiSelectDragging && isInMultiSelect))
                          ? 1000
                          : 55,
                      width: noteWidth,
                      height: noteHeight,
                        transform: `scale(${standardSizeScale})`,
                        transformOrigin: 'center',
                  }}
                  className={`pointer-events-auto ${isEditMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer hover:scale-105 transition-transform'}`}
                    onPointerDown={(e) => {
                        lastMousePos.current = { x: e.clientX, y: e.clientY };
                        handleNotePointerDown(e, note.id, note);
                    }}
                  onPointerMove={handleNotePointerMove}
                  onPointerUp={(e) => handleNotePointerUp(e, note)}
                  onClick={(e) => handleNoteClick(e, note)}
                >
                  {isEditMode && (
                      <>
                      <button 
                        onClick={(e) => handleDeleteClick(e, note.id)}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="absolute -top-3 -right-3 z-50 bg-red-500 text-white rounded-full p-1.5 shadow-md hover:scale-110 transition-transform"
                      >
                        <X size={14} />
                      </button>
                        {/* Resize handles for image notes - show when selected */}
                        {((selectedNoteId === note.id || selectedNoteIds.has(note.id)) && !connectingFrom) && (
                          <>
                            {(['tl', 'tr', 'bl', 'br'] as const).map(corner => {
                              const width = noteWidth;
                              const height = noteHeight;
                              
                              let left = 0, top = 0;
                              switch (corner) {
                                case 'tl':
                                  left = 0;
                                  top = 0;
                                  break;
                                case 'tr':
                                  left = width;
                                  top = 0;
                                  break;
                                case 'bl':
                                  left = 0;
                                  top = height;
                                  break;
                                case 'br':
                                  left = width;
                                  top = height;
                                  break;
                              }
                              
                              return (
                                <div
                                  key={corner}
                                  className="absolute z-50 w-4 h-4 -translate-x-1/2 -translate-y-1/2 border-2 border-white rounded-full shadow-lg cursor-nwse-resize transition-transform pointer-events-auto hover:scale-125"
                            style={{ 
                                    backgroundColor: themeColor,
                                    left: `${left}px`, 
                                    top: `${top}px`
                                  }}
                                  onPointerDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    const rect = containerRef.current?.getBoundingClientRect();
                                    if (!rect) return;
                                    const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
                                    const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
                                    setResizingImage({
                                      id: note.id,
                                      corner,
                                      startX: worldX,
                                      startY: worldY,
                                      startWidth: noteWidth,
                                      startHeight: noteHeight,
                                      startBoardX: note.boardX,
                                      startBoardY: note.boardY,
                                      aspect: noteWidth / noteHeight
                                    });
                                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                                  }}
                                />
                              );
                            })}
                          </>
                        )}
                      </>
                    )}
                    <div 
                        className={`w-full h-full shadow-xl flex flex-col overflow-hidden group rounded-sm transition-shadow ${isDragging ? 'shadow-2xl ring-4' : isInFrame ? 'ring-4 ring-[#EEEEEE]' : ''}`}
                            style={{ 
                            boxShadow: isDragging ? `0 0 0 4px ${themeColor}` : undefined,
                            backgroundColor: 'transparent'
                        }}
                    >
                        <div
                          className="w-full h-full relative flex items-center justify-center"
                          style={{ backgroundColor: note.color || '#FFFDF5' }}
                        >
                          {note.images && note.images[0] && (
                            <img
                              src={note.images[0]}
                              className="w-full h-full object-contain pointer-events-none"
                              alt="board-image"
                            />
                          )}
                        </div>
                    </div>
                  </motion.div>
                );
              }

              return (
                <motion.div
                  key={note.id}
                  initial={false}
                  data-is-note="true"
                  style={{ 
                      position: 'absolute', 
                      left: currentX, 
                      top: currentY,
                      zIndex: (selectedNoteId === note.id || selectedNoteIds.has(note.id) || isDragging || (isMultiSelectDragging && isInMultiSelect))
                        ? 1000
                        : isCompact
                          ? 60
                          : isImage
                            ? 55
                            : 50,
                      width: noteWidth,
                      height: noteHeight,
                      transform: `scale(${standardSizeScale})`,
                      transformOrigin: 'center',
                  }}
                  className={`pointer-events-auto ${isEditMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer hover:scale-105 transition-transform'}`}
                  onPointerDown={(e) => {
                      lastMousePos.current = { x: e.clientX, y: e.clientY };
                      handleNotePointerDown(e, note.id, note);
                  }}
                  onPointerMove={handleNotePointerMove}
                  onPointerUp={(e) => handleNotePointerUp(e, note)}
                  onClick={(e) => handleNoteClick(e, note)}
                  onDoubleClick={(e) => handleNoteDoubleClick(e, note)}
                >
                  {isEditMode && (
                      <>
                      <button 
                        onClick={(e) => handleDeleteClick(e, note.id)}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="absolute -top-3 -right-3 z-50 bg-red-500 text-white rounded-full p-1.5 shadow-md hover:scale-110 transition-transform"
                      >
                        <X size={14} />
                      </button>
                        
                        {/* Connection points - show when selected (single or multi) or when connecting, but not for image notes */}
                        {((selectedNoteId === note.id || selectedNoteIds.has(note.id)) || connectingFrom !== null) && !isImage && (
                          <>
                            {(['top', 'right', 'bottom', 'left'] as const).map(side => {
                              const point = getConnectionPoint(note, side, isDragging, dragOffset);
                              const isCompact = note.variant === 'compact';
                              
                              // Use dimensions per variant
                              const width = isCompact ? 180 : 256;
                              const height = isCompact ? 180 : 256;
                              
                              let left = 0, top = 0;
                              switch (side) {
                                case 'top':
                                  left = width / 2;
                                  top = 0;
                                  break;
                                case 'right':
                                  left = width;
                                  top = height / 2;
                                  break;
                                case 'bottom':
                                  left = width / 2;
                                  top = height;
                                  break;
                                case 'left':
                                  left = 0;
                                  top = height / 2;
                                  break;
                              }
                              
                              const isActive = connectingFrom?.noteId === note.id && connectingFrom?.side === side;
                              const isHovering = hoveringConnectionPoint?.noteId === note.id && hoveringConnectionPoint?.side === side;
                              
                              return (
                                <div
                                  key={side}
                                  className={`absolute z-50 w-6 h-6 -translate-x-1/2 -translate-y-1/2 border-2 border-white rounded-full shadow-lg cursor-crosshair transition-transform pointer-events-auto ${
                                    isActive ? 'scale-125' : isHovering ? 'scale-150 ring-4 ring-opacity-50' : 'hover:scale-110'
                                  }`}
                          style={{
                                    backgroundColor: themeColor,
                                    boxShadow: isHovering ? `0 0 0 4px ${themeColor}80` : undefined,
                                    left: `${left}px`, 
                                    top: `${top}px`
                                  }}
                                  onPointerDown={(e) => handleConnectionPointDown(e, note.id, side)}
                                />
                              );
                            })}
                          </>
                        )}
                      </>
                  )}

                  {isCompact ? (
                      <div 
                          className={`w-full h-full shadow-xl flex flex-col overflow-hidden group rounded-sm transition-shadow ${isDragging ? 'shadow-2xl ring-4' : ''}`}
                          style={{
                              boxShadow: isDragging ? `0 0 0 4px ${themeColor}` : undefined,
                              backgroundColor: note.color || '#FFFDF5',
                              border: `5px solid ${themeColor}`,
                              boxSizing: 'border-box'
                          }}
                      >
                          <div className="w-full h-full flex flex-col relative p-4 gap-1">
                              <div className="relative z-10 pointer-events-none flex flex-col h-full">
                                  <p 
                                    className={`text-gray-800 leading-none flex-1 overflow-hidden break-words whitespace-pre-wrap ${clampClass} ${note.isBold ? 'font-bold' : 'font-medium'}`} 
                            style={{ 
                                        fontSize: note.fontSize === 1 ? '1.2rem' : note.fontSize === 2 ? '1.6rem' : note.fontSize === 3 ? '2.2rem' : note.fontSize === 4 ? '2.4rem' : '3.0rem'
                                    }}
                                  >
                                      {note.text || <span className="text-gray-400 italic font-normal text-base">Empty...</span>}
                                  </p>
                                  {isCompact && (
                                    <div className="mt-auto flex items-center justify-end">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                e.preventDefault(); // 阻止默认行为和进一步冒泡
                                                // Upgrade compact note to standard note
                                                const upgradedNote: Note = {
                                                    ...note,
                                                    variant: 'standard' as const,
                                                    // Keep existing coords if available
                                                    coords: note.coords || { lat: 0, lng: 0 }
                                                };
                                                onUpdateNote(upgradedNote);
                                                
                                                // 退出框选模式和frame创建模式
                                                setIsBoxSelecting(false);
                                                setIsDrawingFrame(false);
                                                setBoxSelectStart(null);
                                                setBoxSelectEnd(null);
                                                setDrawingFrameStart(null);
                                                setDrawingFrameEnd(null);
                                                
                                                // 如果正在编辑这个note，更新editingNote并保持编辑模式打开
                                                if (editingNote && editingNote.id === note.id) {
                                                    setEditingNote(upgradedNote);
                                                } else {
                                                    // 如果没有在编辑，打开编辑模式并设置editingNote
                                                    setEditingNote(upgradedNote);
                                                    onToggleEditor(true);
                                                }
                                            }}
                                            className="p-1.5 rounded-full bg-white/80 hover:bg-white shadow-sm transition-colors opacity-0 group-hover:opacity-100 pointer-events-auto"
                                            title="升级为标准便签"
                                        >
                                            <ArrowUp size={14} className="text-gray-700" />
                                        </button>
                                    </div>
                                  )}
                              </div>
                          </div>
                      </div>
                  ) : (
                      <div 
                          className={`w-full h-full shadow-xl flex flex-col overflow-hidden group rounded-sm transition-shadow ${isDragging ? 'shadow-2xl ring-4' : isInFrame ? 'ring-4 ring-[#EEEEEE]' : ''}`}
                          style={{
                              boxShadow: isDragging ? `0 0 0 4px ${themeColor}` : undefined,
                              transform: `rotate(${(parseInt(note.id.slice(-2), 36) % 6) - 3}deg)`,
                              backgroundColor: note.color || '#FFFDF5'
                          }}
                      >
                          <div className="w-full h-full flex flex-col relative p-6 gap-2">
                              {!isCompact && (note.sketch && note.sketch !== '') && (note.images && note.images.length > 0) && (
                                  <div className="absolute inset-0 opacity-35 pointer-events-none z-0">
                                      <img 
                                          src={note.sketch || note.images[0]} 
                                          className="w-full h-full object-cover grayscale opacity-50" 
                                          alt="bg" 
                                      />
                                  </div>
                              )}
                              {!isCompact && (note.sketch && note.sketch !== '') && (!note.images || note.images.length === 0) && (
                                  <div className="absolute inset-0 opacity-35 pointer-events-none z-0">
                                      <img 
                                          src={note.sketch} 
                                          className="w-full h-full object-cover grayscale opacity-50" 
                                          alt="bg" 
                                      />
                                  </div>
                              )}
                              {!isCompact && !note.sketch && (note.images && note.images.length > 0) && (
                                  <div className="absolute inset-0 opacity-35 pointer-events-none z-0">
                                      <img 
                                          src={note.images[0]} 
                                          className="w-full h-full object-cover grayscale opacity-50" 
                                          alt="bg" 
                                      />
                                  </div>
                              )}
                              <div className="relative z-10 pointer-events-none flex flex-col h-full">
                                  {!isCompact && <div className={`${isCompact ? 'text-2xl mb-1' : 'text-3xl mb-2'} drop-shadow-sm`}>{note.emoji}</div>}
                                  <p 
                                    className={`text-gray-800 leading-none flex-1 overflow-hidden break-words whitespace-pre-wrap ${clampClass} ${note.isBold ? 'font-bold' : 'font-medium'}`} 
                                    style={{ 
                                        // Sticky Note: 缩小到40% (1.2rem to 2.8rem)
                                        fontSize: note.fontSize === 1 ? '1.2rem' : note.fontSize === 2 ? '1.6rem' : note.fontSize === 3 ? '2.2rem' : note.fontSize === 4 ? '2.4rem' : '3.0rem'
                                    }}
                                  >
                                      {note.text || <span className="text-gray-400 italic font-normal text-base">Empty...</span>}
                                  </p>
                                  {isCompact && (
                                    <div className="mt-auto flex items-center justify-end">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                e.preventDefault(); // 阻止默认行为和进一步冒泡
                                                // Upgrade compact note to standard note
                                                const upgradedNote: Note = {
                                                    ...note,
                                                    variant: 'standard' as const,
                                                    // Keep existing coords if available
                                                    coords: note.coords || { lat: 0, lng: 0 }
                                                };
                                                onUpdateNote(upgradedNote);
                                                
                                                // 退出框选模式和frame创建模式
                                                setIsBoxSelecting(false);
                                                setIsDrawingFrame(false);
                                                setBoxSelectStart(null);
                                                setBoxSelectEnd(null);
                                                setDrawingFrameStart(null);
                                                setDrawingFrameEnd(null);
                                                
                                                // 如果正在编辑这个note，更新editingNote并保持编辑模式打开
                                                if (editingNote && editingNote.id === note.id) {
                                                    setEditingNote(upgradedNote);
                                                } else {
                                                    // 如果没有在编辑，打开编辑模式并设置editingNote
                                                    setEditingNote(upgradedNote);
                                                    onToggleEditor(true);
                                                }
                                            }}
                                            className="p-1.5 rounded-full bg-white/80 hover:bg-white shadow-sm transition-colors opacity-0 group-hover:opacity-100 pointer-events-auto"
                                            title="升级为标准便签"
                                        >
                                            <ArrowUp size={14} className="text-gray-700" />
                                        </button>
                                    </div>
                                  )}
                                  {!isCompact && (
                                    <div className="mt-auto flex flex-wrap gap-1 items-center justify-between">
                                        <div className="flex flex-wrap gap-1" style={{ position: 'relative', zIndex: 70 }}>
                                        {note.tags.map(t => (
                                                <span key={t.id} className="flex-shrink-0 h-6 px-2.5 rounded-full text-xs font-bold text-white shadow-sm flex items-center gap-1" style={{ backgroundColor: t.color }}>{t.label}</span>
                                        ))}
                                    </div>
                                        {note.coords && note.coords.lat !== 0 && note.coords.lng !== 0 && onSwitchToMapView && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onSwitchToMapView(note.coords);
                                                }}
                                                className="p-1.5 rounded-full bg-white/80 hover:bg-white shadow-sm transition-colors opacity-0 group-hover:opacity-100 pointer-events-auto"
                                                title="定位到地图视图"
                                            >
                                                <Locate size={14} className="text-gray-700" />
                                            </button>
                                        )}
                                    </div>
                                  )}
                              </div>
                          </div>
                      </div>
                  )}
                </motion.div>
              );
          })}

          {/* Multi-select bounding box */}
          {isEditMode && selectedNoteIds.size > 1 && (() => {
            const selectedNotes = notes.filter(n => selectedNoteIds.has(n.id));
            if (selectedNotes.length === 0) return null;
            
            // Calculate bounding box
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            selectedNotes.forEach(note => {
              const noteWidth = (note.variant === 'compact') ? 180 : 256;
              const noteHeight = (note.variant === 'compact') ? 180 : 256;
              const noteX = note.boardX + (isMultiSelectDragging ? multiSelectDragOffset.x : 0);
              const noteY = note.boardY + (isMultiSelectDragging ? multiSelectDragOffset.y : 0);
              
              minX = Math.min(minX, noteX);
              minY = Math.min(minY, noteY);
              maxX = Math.max(maxX, noteX + noteWidth);
              maxY = Math.max(maxY, noteY + noteHeight);
            });
            
            const padding = 10;
            return (
              <div
                className="absolute z-[2100]"
                style={{
                  left: minX - padding,
                  top: minY - padding,
                  width: maxX - minX + padding * 2,
                  height: maxY - minY + padding * 2,
                  border: `6px dashed ${themeColor}`,
                  borderRadius: '8px',
                  pointerEvents: 'none',
                }}
              >
                {/* Delete button at top-right */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    // Get current selected IDs before clearing state
                    const idsToDelete = Array.from(selectedNoteIds);
                    console.log('Multi-select delete clicked, selectedNoteIds:', idsToDelete);
                    
                    if (idsToDelete.length === 0) {
                      console.warn('No notes to delete');
                      return;
                    }
                    
                    // Delete all selected notes immediately
                    idsToDelete.forEach(id => {
                      console.log('Deleting note:', id);
                      if (onDeleteNote) {
                        onDeleteNote(id);
                      }
                    });
                    
                    // Clear selection after deletion
                    setSelectedNoteIds(new Set());
                    setSelectedNoteId(null);
                    resetBlankClickCount();
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    // Mark that we're interacting with the delete button
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onMouseUp={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  className="absolute -top-3 -right-3 z-[2101] bg-red-500 text-white rounded-full p-2 shadow-lg hover:scale-110 transition-transform cursor-pointer"
                  style={{ 
                    transform: `scale(${1 / transform.scale})`,
                    pointerEvents: 'auto',
                  }}
                  title="Delete selected notes"
                >
                  <X size={16} />
                </button>
              </div>
            );
          })()}
        </div>

        {/* 图层按钮：非编辑模式右侧单独容器 */}
        {!isEditMode && (
            <div 
                className="fixed top-2 sm:top-4 right-2 sm:right-4 z-[500] pointer-events-auto flex items-center"
                style={{ height: '40px' }}
                onPointerDown={(e) => e.stopPropagation()}
            >
                <div className="relative">
                    <button 
                        onClick={(e) => { 
                            e.stopPropagation(); 
                            setShowLayerPanel(!showLayerPanel);
                        }}
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            e.currentTarget.style.backgroundColor = themeColor;
                        }}
                        onPointerUp={(e) => {
                            e.stopPropagation();
                            if (!showLayerPanel) {
                                e.currentTarget.style.backgroundColor = '';
                            }
                        }}
                        onMouseEnter={(e) => {
                            if (!showLayerPanel) {
                                e.currentTarget.style.backgroundColor = '#F3F4F6'; // gray-100
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!showLayerPanel) {
                                e.currentTarget.style.backgroundColor = '';
                            }
                        }}
                        className={`bg-white p-2 sm:p-3 rounded-xl shadow-lg transition-colors w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center ${
                            showLayerPanel ? 'text-white' : 'text-gray-700'
                        }`}
                        style={{ backgroundColor: showLayerPanel ? themeColor : undefined }}
                        title="图层"
                    >
                        <Layers size={18} className="sm:w-5 sm:h-5" />
                    </button>
                    {showLayerPanel && (
                        <div 
                            className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-[2000]"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="px-3 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide">Layer</div>
                            <div className="h-px bg-gray-100 mb-1" />
                            {/* Connects (连线) - Top */}
                            <div className="px-3 py-2 flex items-center justify-between hover:bg-gray-50">
                                <div className="flex items-center gap-2">
                                    <GitBranch size={16} className="text-gray-600" strokeWidth={2} />
                                    <span className="text-sm text-gray-700">Connects</span>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={layerVisibility.connects}
                                    onChange={(e) => {
                                        e.stopPropagation();
                                        setLayerVisibility(prev => ({ ...prev, connects: !prev.connects }));
                                    }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                    className={`w-4 h-4 rounded border-2 cursor-pointer appearance-none ${
                                        layerVisibility.connects 
                                            ? '' 
                                            : 'bg-transparent'
                                    }`}
                                    style={{ 
                                        backgroundColor: layerVisibility.connects ? themeColor : 'transparent',
                                        borderColor: themeColor
                                    }}
                                />
                            </div>
                            {/* Secondary (小便签) */}
                            <div className="px-3 py-2 flex items-center justify-between hover:bg-gray-50">
                                <div className="flex items-center gap-2">
                                    <StickyNote size={16} className="text-gray-600" strokeWidth={2} />
                                    <span className="text-sm text-gray-700">Sticky Notes</span>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={layerVisibility.secondary}
                                    onChange={(e) => {
                                        e.stopPropagation();
                                        setLayerVisibility(prev => ({ ...prev, secondary: !prev.secondary }));
                                    }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                    className={`w-4 h-4 rounded border-2 cursor-pointer appearance-none ${
                                        layerVisibility.secondary 
                                            ? '' 
                                            : 'bg-transparent'
                                    }`}
                                    style={{ 
                                        backgroundColor: layerVisibility.secondary ? themeColor : 'transparent',
                                        borderColor: themeColor
                                    }}
                                />
                            </div>
                            {/* Primary Notes */}
                            <div className="px-3 py-2 flex items-center justify-between hover:bg-gray-50">
                                <div className="flex items-center gap-2">
                                    <Square size={16} className="text-gray-600" strokeWidth={2} />
                                    <span className="text-sm text-gray-700">Primary Notes</span>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={layerVisibility.primary}
                                    onChange={(e) => {
                                        e.stopPropagation();
                                        setLayerVisibility(prev => ({ ...prev, primary: !prev.primary }));
                                    }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                    className={`w-4 h-4 rounded border-2 cursor-pointer appearance-none ${
                                        layerVisibility.primary 
                                            ? '' 
                                            : 'bg-transparent'
                                    }`}
                                    style={{ 
                                        backgroundColor: layerVisibility.primary ? themeColor : 'transparent',
                                        borderColor: themeColor
                                    }}
                                />
                            </div>
                            {/* Images */}
                            <div className="px-3 py-2 flex items-center justify-between hover:bg-gray-50">
                                <div className="flex items-center gap-2">
                                    <ImageIcon size={16} className="text-gray-600" strokeWidth={2} />
                                    <span className="text-sm text-gray-700">Images</span>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={layerVisibility.image}
                                    onChange={(e) => {
                                        e.stopPropagation();
                                        setLayerVisibility(prev => ({ ...prev, image: !prev.image }));
                                    }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                    className={`w-4 h-4 rounded border-2 cursor-pointer appearance-none ${
                                        layerVisibility.image 
                                            ? '' 
                                            : 'bg-transparent'
                                    }`}
                                    style={{ 
                                        backgroundColor: layerVisibility.image ? themeColor : 'transparent',
                                        borderColor: themeColor
                                    }}
                                />
                            </div>
                            {/* Frames */}
                            <div className="px-3 py-2 flex items-center justify-between hover:bg-gray-50">
                                <div className="flex items-center gap-2">
                                    <Square size={16} className="text-gray-600" strokeWidth={2} />
                                    <span className="text-sm text-gray-700">Frames</span>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={layerVisibility.frame}
                                    onChange={(e) => {
                                        e.stopPropagation();
                                        setLayerVisibility(prev => ({ ...prev, frame: !prev.frame }));
                                    }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                    className={`w-4 h-4 rounded border-2 cursor-pointer appearance-none ${
                                        layerVisibility.frame 
                                            ? '' 
                                            : 'bg-transparent'
                                    }`}
                                    style={{ 
                                        backgroundColor: layerVisibility.frame ? themeColor : 'transparent',
                                        borderColor: themeColor
                                    }}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* Shift button for multi-select (编辑模式) and multi-frame filter (非编辑模式) - above ZoomSlider */}
        {(
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed bottom-[240px] left-4 z-[500] pointer-events-auto"
          >
            <button
              onPointerDown={(e) => {
                e.stopPropagation();
                setIsShiftPressed(true);
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                setIsShiftPressed(false);
              }}
              onPointerLeave={(e) => {
                e.stopPropagation();
                setIsShiftPressed(false);
              }}
              className={`w-8 h-12 rounded-full shadow-lg flex items-center justify-center transition-all ${
                isShiftPressed 
                  ? 'text-white' 
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
                style={isShiftPressed ? { backgroundColor: themeColor } : undefined}
              title={isEditMode ? "Hold for multi-select" : "Hold for multi-frame filter"}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 4 L4 12 L9 12 L9 19 L16 19 L16 12 L21 12 Z" />
              </svg>
            </button>
          </motion.div>
        )}

        {/* ZoomSlider - Always Visible */}
        <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed bottom-24 left-4 z-[500] pointer-events-auto"
          >
            <ZoomSlider value={transform.scale} min={0.2} max={3.0} onChange={(val) => zoomAtViewCenter(val)} themeColor={themeColor} />
        </motion.div>

        <div className="fixed top-4 right-4 z-[500] flex gap-3 pointer-events-auto items-center" style={{ height: '40px' }} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          {isEditMode && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setIsEditMode(false);
                }} 
                onPointerDown={(e) => {
                  e.stopPropagation();
                }}
                className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 text-white rounded-xl shadow-lg font-bold h-full"
                style={{ backgroundColor: themeColor, paddingTop: '6px', paddingBottom: '6px' }}
                onMouseEnter={(e) => {
                  const darkR = Math.max(0, Math.floor(parseInt(themeColor.slice(1, 3), 16) * 0.9));
                  const darkG = Math.max(0, Math.floor(parseInt(themeColor.slice(3, 5), 16) * 0.9));
                  const darkB = Math.max(0, Math.floor(parseInt(themeColor.slice(5, 7), 16) * 0.9));
                  const darkHex = '#' + [darkR, darkG, darkB].map(x => {
                    const hex = x.toString(16);
                    return hex.length === 1 ? '0' + hex : hex;
                  }).join('').toUpperCase();
                  e.currentTarget.style.backgroundColor = darkHex;
                }}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = themeColor}
              >
                  <Check size={18} className="sm:w-5 sm:h-5" />
                  <span className="hidden sm:inline">Done</span>
              </button>
          )}
        </div>

        {/* Edit Toolbar: Unified White Buttons at Top Left */}
            <div 
                className={`fixed top-2 sm:top-4 z-[500] pointer-events-auto animate-in fade-in flex items-center gap-1.5 sm:gap-2 ${
                    isEditMode ? 'left-1/2 -translate-x-1/2' : 'left-2 sm:left-4 slide-in-from-left-4'
                }`}
                style={{ height: '40px', alignItems: 'center' }}
                onPointerDown={(e) => {
                    e.stopPropagation();
                    // 退出位置选择模式
                    if (isSelectingNotePosition) {
                        setIsSelectingNotePosition(false);
                    }
                }}
                onClick={(e) => {
                    e.stopPropagation();
                    // 退出位置选择模式
                    if (isSelectingNotePosition) {
                        setIsSelectingNotePosition(false);
                    }
                }}
            >
                {/* Layout Buttons: L+ and L- */}
        {isEditMode && (
            <div 
                        className="bg-white rounded-xl border border-gray-100 flex gap-1.5 sm:gap-2 items-center p-0.5 sm:p-1" 
                        style={{ height: '40px' }}
                onPointerDown={(e) => e.stopPropagation()} 
                        onClick={(e) => e.stopPropagation()}
            >
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (!onUpdateProject || !project) return;
                            
                            // Get current global standard size scale, default to 1
                            const currentScale = project?.standardSizeScale || 1;
                            const newScale = currentScale * 2;
                            
                            // Update all notes to use new standard size scale
                            notes.forEach(note => {
                                // Calculate note dimensions (original, unscaled standard sizes)
                                const noteWidth = note.variant === 'compact' ? 180 : 256;
                                const noteHeight = note.variant === 'compact' ? 180 : 256;
                                
                                // Calculate current center position (using current scale)
                                const currentCenterX = (note.boardX || 0) + (noteWidth * currentScale) / 2;
                                const currentCenterY = (note.boardY || 0) + (noteHeight * currentScale) / 2;
                                
                                // Calculate new boardX/boardY to keep the center fixed (using new scale)
                                const newBoardX = currentCenterX - (noteWidth * newScale) / 2;
                                const newBoardY = currentCenterY - (noteHeight * newScale) / 2;
                                
                                // Update note position
                                const updatedNote: Note = {
                                    ...note,
                                    boardX: newBoardX,
                                    boardY: newBoardY
                                };
                                
                                onUpdateNote(updatedNote);
                            });
                            
                            // Update project with new standard size scale
                            onUpdateProject({
                                ...project,
                                standardSizeScale: newScale
                            });
                        }}
                        className="p-2 sm:p-3 text-gray-700 flex items-center justify-center transition-colors active:scale-95"
                        style={{
                          backgroundColor: 'transparent',
                          '--hover-color': themeColor
                        } as React.CSSProperties}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = `${themeColor}1A`;
                          e.currentTarget.style.color = themeColor;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget.style.color = 'rgb(55, 65, 81)'; // text-gray-700
                        }}
                        title="放大布局"
                    >
                        <span className="text-base sm:text-lg">L+</span>
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (!onUpdateProject || !project) return;
                            
                            // Get current global standard size scale, default to 1
                            const currentScale = project?.standardSizeScale || 1;
                            const newScale = currentScale * 0.5;
                            
                            // Update all notes to use new standard size scale
                            notes.forEach(note => {
                                // Calculate note dimensions (original, unscaled standard sizes)
                                const noteWidth = note.variant === 'compact' ? 180 : 256;
                                const noteHeight = note.variant === 'compact' ? 180 : 256;
                                
                                // Calculate current center position (using current scale)
                                const currentCenterX = (note.boardX || 0) + (noteWidth * currentScale) / 2;
                                const currentCenterY = (note.boardY || 0) + (noteHeight * currentScale) / 2;
                                
                                // Calculate new boardX/boardY to keep the center fixed (using new scale)
                                const newBoardX = currentCenterX - (noteWidth * newScale) / 2;
                                const newBoardY = currentCenterY - (noteHeight * newScale) / 2;
                                
                                // Update note position
                                const updatedNote: Note = {
                                    ...note,
                                    boardX: newBoardX,
                                    boardY: newBoardY
                                };
                                
                                onUpdateNote(updatedNote);
                            });
                            
                            // Update project with new standard size scale
                            onUpdateProject({
                                ...project,
                                standardSizeScale: newScale
                            });
                        }}
                        className="p-2 sm:p-3 text-gray-700 flex items-center justify-center transition-colors active:scale-95"
                        style={{
                          backgroundColor: 'transparent',
                          '--hover-color': themeColor
                        } as React.CSSProperties}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = `${themeColor}1A`;
                          e.currentTarget.style.color = themeColor;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget.style.color = 'rgb(55, 65, 81)'; // text-gray-700
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        title="缩小布局"
                    >
                        <span className="text-base sm:text-lg">L-</span>
                    </button>
                </div>
                )}
                <div 
                    className={`flex gap-1.5 sm:gap-2 items-center ${
                        isEditMode ? 'p-0.5 sm:p-1' : ''
                    }`} 
                    style={{ height: '40px' }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                >
                    {!isEditMode ? (
                        // 非编辑模式：进入编辑 + 导入按钮并排
                        <>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsEditMode(true);
                                }}
                                onPointerDown={(e) => {
                                    e.stopPropagation();
                                    e.currentTarget.style.backgroundColor = themeColor;
                                }}
                                onPointerUp={(e) => {
                                    e.stopPropagation();
                                    e.currentTarget.style.backgroundColor = '';
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#F3F4F6'; // gray-100
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = '';
                                }}
                                className="bg-white p-2 sm:p-3 rounded-xl shadow-lg text-gray-700 transition-colors w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center"
                                title="进入编辑模式"
                            >
                                <Pencil size={18} className="sm:w-5 sm:h-5" />
                            </button>
                            <div className="relative" ref={menuRef}>
                                <button 
                                    onClick={(e) => { 
                                        e.stopPropagation(); 
                                        setShowImportMenu(!showImportMenu);
                                    }}
                                    className="bg-white p-2 sm:p-3 rounded-xl shadow-lg hover:bg-yellow-50 text-gray-700 transition-colors w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center"
                                    title="Import"
                                >
                                    <svg width="18" height="18" className="sm:w-5 sm:h-5" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                                        <path d="M8 11V5M5 8l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                </button>
                                {showImportMenu && (
                                    <div className="absolute left-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-[2000]">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                fileInputRef.current?.click();
                                                setShowImportMenu(false);
                                            }}
                                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
                                        >
                                            <ImageIcon size={16} /> Import from Photos
                                        </button>
                                        <div className="h-px bg-gray-100 my-1" />
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                dataImportInputRef.current?.click();
                                                setShowImportMenu(false);
                                            }}
                                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
                                        >
                                            <FileJson size={16} /> Import from Data
                                        </button>
            </div>
        )}
                            </div>
                        </>
                    ) : (
                        // 编辑模式：显示编辑工具
                        <>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (isSelectingNotePosition) {
                                // Cancel position selection mode
                                setIsSelectingNotePosition(false);
                            } else {
                                // Enter position selection mode
                                // 退出多选模式
                                setIsBoxSelecting(false);
                                setBoxSelectStart(null);
                                setBoxSelectEnd(null);
                                // 退出 frame 创建模式
                                setIsDrawingFrame(false);
                                setDrawingFrameStart(null);
                                setDrawingFrameEnd(null);
                                setIsSelectingNotePosition(true);
                            }
                        }}
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            e.currentTarget.style.backgroundColor = themeColor;
                        }}
                        onPointerUp={(e) => {
                            e.stopPropagation();
                            if (!isSelectingNotePosition) {
                                e.currentTarget.style.backgroundColor = '';
                            }
                        }}
                        className={`w-10 h-10 sm:w-12 sm:h-12 p-2 sm:p-3 flex items-center justify-center transition-colors active:scale-95 ${
                            isSelectingNotePosition 
                                ? 'text-white' 
                                : 'text-gray-700'
                        }`}
                        style={{ backgroundColor: isSelectingNotePosition ? themeColor : 'transparent' }}
                        onMouseEnter={(e) => {
                            if (!isSelectingNotePosition) {
                                e.currentTarget.style.backgroundColor = '#F3F4F6'; // gray-100
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!isSelectingNotePosition) {
                                e.currentTarget.style.backgroundColor = 'transparent';
                            }
                        }}
                        title={isSelectingNotePosition ? "Click on board to place note (click again to cancel)" : "Add Sticky Note"}
                    >
                            <StickyNote size={18} className="sm:w-5 sm:h-5" />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            // 退出位置选择模式
                            if (isSelectingNotePosition) {
                                setIsSelectingNotePosition(false);
                            }
                            handleAddImageClick();
                        }}
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            // 退出位置选择模式
                            if (isSelectingNotePosition) {
                                setIsSelectingNotePosition(false);
                            }
                            e.currentTarget.style.backgroundColor = themeColor;
                        }}
                        onPointerUp={(e) => {
                            e.stopPropagation();
                            e.currentTarget.style.backgroundColor = '';
                        }}
                        className="w-10 h-10 sm:w-12 sm:h-12 p-2 sm:p-3 text-gray-700 flex items-center justify-center transition-colors active:scale-95"
                        style={{ backgroundColor: 'transparent' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'} // gray-100
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        title="Add Image"
                    >
                            <ImageIcon size={18} className="sm:w-5 sm:h-5" />
                    </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                // 退出位置选择模式
                                if (isSelectingNotePosition) {
                                    setIsSelectingNotePosition(false);
                                }
                                setIsDrawingFrame(true);
                                setIsBoxSelecting(false); // 确保框选模式退出
                                setBoxSelectStart(null);
                                setBoxSelectEnd(null);
                                setSelectedFrameId(null);
                            }}
                            onPointerDown={(e) => {
                                e.stopPropagation();
                                // 退出位置选择模式
                                if (isSelectingNotePosition) {
                                    setIsSelectingNotePosition(false);
                                }
                                e.currentTarget.style.backgroundColor = themeColor;
                            }}
                            onPointerUp={(e) => {
                                e.stopPropagation();
                                if (!isDrawingFrame) {
                                    e.currentTarget.style.backgroundColor = '';
                                }
                            }}
                            className={`w-10 h-10 sm:w-12 sm:h-12 p-2 sm:p-3 flex items-center justify-center transition-colors active:scale-95 ${isDrawingFrame ? 'text-white' : 'text-gray-700'}`}
                            style={isDrawingFrame ? { backgroundColor: themeColor } : undefined}
                            onMouseEnter={(e) => !isDrawingFrame && (e.currentTarget.style.backgroundColor = '#F3F4F6')} // gray-100
                            onMouseLeave={(e) => !isDrawingFrame && (e.currentTarget.style.backgroundColor = '')}
                            title="Add Frame"
                        >
                            <svg width="18" height="18" className="sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                {/* 左竖线 - 纵向出头更短，中间格子更大 */}
                                <line x1="5" y1="2" x2="5" y2="22" />
                                {/* 右竖线 - 纵向出头更短，中间格子更大 */}
                                <line x1="19" y1="2" x2="19" y2="22" />
                                {/* 上横线 - 出头更短 */}
                                <line x1="3" y1="5" x2="21" y2="5" />
                                {/* 下横线 - 出头更短 */}
                                <line x1="3" y1="19" x2="21" y2="19" />
                            </svg>
                        </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            // Toggle box selection mode
                            setIsBoxSelecting(!isBoxSelecting);
                            if (!isBoxSelecting) {
                                // Clear selection when entering box select mode
                                setSelectedNoteIds(new Set());
                                setSelectedNoteId(null);
                                // 确保frame创建模式退出
                                setIsDrawingFrame(false);
                                setDrawingFrameStart(null);
                                setDrawingFrameEnd(null);
                                // 退出位置选择模式
                                setIsSelectingNotePosition(false);
                            } else {
                                // 退出框选模式时也清除相关状态
                                setBoxSelectStart(null);
                                setBoxSelectEnd(null);
                            }
                        }}
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            e.currentTarget.style.backgroundColor = themeColor;
                        }}
                        onPointerUp={(e) => {
                            e.stopPropagation();
                            if (!isBoxSelecting) {
                                e.currentTarget.style.backgroundColor = '';
                            }
                        }}
                        className={`w-10 h-10 sm:w-12 sm:h-12 p-2 sm:p-3 flex items-center justify-center transition-colors active:scale-95 ${
                            isBoxSelecting ? 'text-white' : 'text-gray-700'
                        }`}
                        style={{ backgroundColor: isBoxSelecting ? themeColor : 'transparent' }}
                        onMouseEnter={(e) => !isBoxSelecting && (e.currentTarget.style.backgroundColor = '#F3F4F6')} // gray-100
                        onMouseLeave={(e) => !isBoxSelecting && (e.currentTarget.style.backgroundColor = 'transparent')}
                        title="Box Select (Click to toggle, then drag to select)"
                    >
                            <svg width="18" height="18" className="sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="5 5">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            </svg>
                    </button>
                    </>
                )}
            </div>
        </div>

        
        {/* Hidden file inputs */}
        <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => handleImageImport(e.target.files)}
        />
        <input
            ref={dataImportInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                    handleDataImport(e.target.files[0]);
                }
            }}
        />

        {editingNote && (
          <NoteEditor 
              isOpen={!!editingNote}
              onClose={closeEditor}
              initialNote={notes.find(n => n.id === editingNote.id) || editingNote}
              onDelete={onDeleteNote}
              onSwitchToMapView={onSwitchToMapView}
              onSwitchToBoardView={onSwitchToBoardView}
              onSave={(updated) => {
                  // Text variant removed
                  if (updated.id && notes.some(n => n.id === updated.id)) {
                      // 确保保留原始note的variant
                      const existingNote = notes.find(n => n.id === updated.id);
                      const fullNote: Note = {
                          ...existingNote!,
                          ...updated,
                          variant: updated.variant || existingNote!.variant,
                          // Always use updated.images if it exists (even if empty array)
                          // This ensures new uploads are saved, not reverted to old images
                          images: updated.images !== undefined ? updated.images : (existingNote!.images || []),
                          // Always use updated.sketch if it exists (even if undefined to clear)
                          // This ensures new sketches are saved, not reverted to old sketch
                          sketch: 'sketch' in updated ? updated.sketch : existingNote!.sketch
                      };
                      onUpdateNote(fullNote);
                      // Update editingNote state to reflect the saved changes
                      // This ensures that if the editor is reopened, it will use the updated data
                      setEditingNote(fullNote);
                  } else if (onAddNote && updated.id) {
                      // 新Note必须指定variant，如果没有则默认为standard
                      const fullNote: Note = {
                          ...updated,
                          variant: updated.variant || 'standard',
                          // Ensure images is always an array for new notes
                          images: updated.images || []
                      } as Note;
                      onAddNote(fullNote);
                      // For new notes, close editor since the note is now saved
                      setEditingNote(null);
                  }
              }}
          />
        )}

        {/* Import preview dialog */}
        {showImportDialog && (
          <div 
            className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={(e) => {
              // Close dialog when clicking on the backdrop
              e.preventDefault();
              e.stopPropagation();
              handleCancelImport(e);
            }}
            onPointerDown={(e) => {
              // Also handle pointer down to ensure it works
              if (e.target === e.currentTarget) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
          >
            <div 
              className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
            >
              <div className="p-4 flex justify-between items-center border-b border-gray-200">
                <div>
                  <h3 className="text-lg font-bold text-gray-800">Import Photo Preview</h3>
                  <div className="mt-1 text-sm text-gray-600">
                    Importable: {importPreview.filter(p => !p.error && !p.isDuplicate).length} | 
                    Already imported: {importPreview.filter(p => !p.error && p.isDuplicate).length} | 
                    Cannot import: {importPreview.filter(p => p.error).length}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCancelImport(e);
                  }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
                  title="Close (ESC)"
                >
                  <X size={20} className="text-gray-600" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-3 gap-2">
                  {importPreview.map((preview, index) => (
                    <div key={index} className="relative aspect-square">
                      <img 
                        src={preview.imageUrl} 
                        alt={`Preview ${index + 1}`}
                        className="w-full h-full object-cover rounded-lg"
                      />
                      {preview.error ? (
                        <div className="absolute inset-0 bg-red-500/20 rounded-lg flex items-center justify-center">
                          <div className="text-center text-red-600 text-xs px-2">
                            <X size={16} className="mx-auto mb-1" />
                            <span className="font-bold">{preview.error}</span>
                          </div>
                        </div>
                      ) : preview.isDuplicate ? (
                        <div className="absolute inset-0 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${themeColor}20` }}>
                          <div className="text-center text-xs px-2" style={{ color: themeColor }}>
                            <Check size={16} className="mx-auto mb-1" />
                            <span className="font-bold">Already imported</span>
                          </div>
                        </div>
                      ) : (
                        <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1.5">
                          <Check size={12} />
                        </div>
                      )}
                      {!preview.error && (
                        <div className="mt-1 text-xs text-gray-600">
                          {preview.lat.toFixed(6)}, {preview.lng.toFixed(6)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="p-4 flex justify-end gap-2">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCancelImport(e);
                  }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  className="px-6 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={importPreview.filter(p => !p.error && !p.isDuplicate).length === 0}
                  className="px-6 py-2 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg text-gray-900 font-medium transition-colors"
                  style={{ backgroundColor: themeColor }}
                  onMouseEnter={(e) => {
                    if (!e.currentTarget.disabled) {
                      const darkR = Math.max(0, Math.floor(parseInt(themeColor.slice(1, 3), 16) * 0.9));
                      const darkG = Math.max(0, Math.floor(parseInt(themeColor.slice(3, 5), 16) * 0.9));
                      const darkB = Math.max(0, Math.floor(parseInt(themeColor.slice(5, 7), 16) * 0.9));
                      const darkHex = '#' + [darkR, darkG, darkB].map(x => {
                        const hex = x.toString(16);
                        return hex.length === 1 ? '0' + hex : hex;
                      }).join('').toUpperCase();
                      e.currentTarget.style.backgroundColor = darkHex;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!e.currentTarget.disabled) {
                      e.currentTarget.style.backgroundColor = themeColor;
                    }
                  }}
                >
                  Confirm Import ({importPreview.filter(p => !p.error && !p.isDuplicate).length})
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Image Preview Modal */}
        {previewImage && (
          <div 
            className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center"
            onClick={() => setPreviewImage(null)}
          >
            <div 
              className="relative max-w-[90vw] max-h-[90vh] p-4 pointer-events-none"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewImage(null);
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                }}
                className="absolute -top-2 -right-2 z-10 bg-white rounded-full p-2 shadow-lg hover:bg-gray-100 transition-colors pointer-events-auto"
              >
                <X size={20} />
              </button>
              <img
                src={previewImage}
                alt="Preview"
                className="max-w-full max-h-[90vh] object-contain rounded-lg pointer-events-auto"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export const BoardView = BoardViewComponent;
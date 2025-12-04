import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Note } from '../types';
import { motion } from 'framer-motion';
import { NoteEditor } from './NoteEditor';
import { ZoomSlider } from './ZoomSlider';
import { Type, StickyNote, X, Pencil, Check } from 'lucide-react';
import { generateId } from '../utils';

// 常量定义
const CONNECTION_OFFSET = 40; // 连接线从连接点延伸的距离
const CONNECTION_POINT_SIZE = 6; // 连接点的大小（宽高，单位：像素）
const CONNECTION_POINT_DETECT_RADIUS = 20; // 连接点检测半径
const CONNECTION_LINE_WIDTH = 6; // 连接线宽度
const CONNECTION_LINE_CLICKABLE_WIDTH = 20; // 连接线可点击区域宽度
const CONNECTION_LINE_CORNER_RADIUS = 32; // 连接线转角圆角半径
const SVG_OVERFLOW_PADDING = 500; // SVG 容器的溢出边距
const LONG_PRESS_DURATION = 600; // 长按触发时间（毫秒）
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
  connections?: Array<{ id: string; fromNoteId: string; toNoteId: string; fromSide: 'top' | 'right' | 'bottom' | 'left'; toSide: 'top' | 'right' | 'bottom' | 'left' }>;
  onUpdateConnections?: (connections: Array<{ id: string; fromNoteId: string; toNoteId: string; fromSide: 'top' | 'right' | 'bottom' | 'left'; toSide: 'top' | 'right' | 'bottom' | 'left' }>) => void;
}

export const BoardView: React.FC<BoardViewProps> = ({ notes, onUpdateNote, onToggleEditor, onAddNote, onDeleteNote, onEditModeChange, connections = [], onUpdateConnections }) => {
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
  
  // Long press state for notes
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressNoteIdRef = useRef<string | null>(null);
  
  // Connection state
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<{ noteId: string; side: 'top' | 'right' | 'bottom' | 'left' } | null>(null);
  const [connectingTo, setConnectingTo] = useState<{ x: number; y: number } | null>(null);
  
  // Text measurement refs
  const textMeasureRefs = useRef<Map<string, { width: number; height: number }>>(new Map());

  useEffect(() => {
    onEditModeChange?.(isEditMode);
  }, [isEditMode, onEditModeChange]);

  // 获取连接点位置
  const getConnectionPoint = (note: Note, side: 'top' | 'right' | 'bottom' | 'left', isDragging: boolean, dragOffset: { x: number; y: number }) => {
    const x = note.boardX + (isDragging ? dragOffset.x : 0);
    const y = note.boardY + (isDragging ? dragOffset.y : 0);
    const isText = note.variant === 'text';
    const isCompact = note.variant === 'compact';
    
    // For text notes, use measured dimensions from the inner div (text container)
    let width = isCompact ? 180 : 256;
    let height = isText ? 100 : isCompact ? 180 : 256;
    
    if (isText) {
      // Use measured dimensions from the text container
      const measured = textMeasureRefs.current.get(note.id);
      if (measured) {
        width = measured.width;
        height = measured.height;
      } else {
        // Fallback calculation (unified scale: 3rem - 7rem)
        const fontSize = note.fontSize === 1 ? 3 : note.fontSize === 2 ? 4 : note.fontSize === 3 ? 5 : note.fontSize === 4 ? 6 : 7;
        const textLength = note.text?.length || 0;
        // Estimate width based on font size and text length
        const charWidth = fontSize * 16 * 0.6; // rem to px: fontSize * 16px/rem * char width ratio
        width = textLength * charWidth;
        height = fontSize * 16 * 1.2; // Line height approximation
      }
    }
    
    switch (side) {
      case 'top':
        return { x: x + width / 2, y: y };
      case 'right':
        return { x: x + width, y: y + height / 2 };
      case 'bottom':
        return { x: x + width / 2, y: y + height };
      case 'left':
        return { x: x, y: y + height / 2 };
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
      
      // 固定使用指定的圆角半径
      const actualRadius = radius;
      
      // 如果线段太短，使用直线连接，不做圆角处理
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

  // 计算连接线路径的辅助函数
  const calculateConnectionPath = (
    fromPoint: { x: number; y: number },
    toPoint: { x: number; y: number },
    fromSide: 'top' | 'right' | 'bottom' | 'left',
    toSide: 'top' | 'right' | 'bottom' | 'left'
  ): string => {
    const offset = CONNECTION_OFFSET;
    
    // 计算从起点垂直延伸后的点
    let fromExtendX = fromPoint.x, fromExtendY = fromPoint.y;
    if (fromSide === 'right') fromExtendX += offset;
    else if (fromSide === 'left') fromExtendX -= offset;
    else if (fromSide === 'bottom') fromExtendY += offset;
    else if (fromSide === 'top') fromExtendY -= offset;
    
    // 计算垂直接入终点前的点
    let toExtendX = toPoint.x, toExtendY = toPoint.y;
    if (toSide === 'right') toExtendX += offset;
    else if (toSide === 'left') toExtendX -= offset;
    else if (toSide === 'bottom') toExtendY += offset;
    else if (toSide === 'top') toExtendY -= offset;
    
    let points: {x: number, y: number}[] = [];
    
    // 确保所有路径都是：起点 → 外侧延伸 → 中间转折 → 外侧延伸 → 接入点
    // 关键：最后一段必须是从外侧（toExtend）接入连接点（toPoint）
    
    if ((fromSide === 'left' || fromSide === 'right') && 
        (toSide === 'top' || toSide === 'bottom')) {
      // 水平出发，垂直到达
      // 路径：起点 → 水平延伸 → 转到目标X → 垂直延伸 → 垂直接入
      points = [fromPoint, {x: fromExtendX, y: fromPoint.y}, {x: toExtendX, y: fromPoint.y}, {x: toExtendX, y: toExtendY}, toPoint];
    } else if ((fromSide === 'top' || fromSide === 'bottom') && 
               (toSide === 'left' || toSide === 'right')) {
      // 垂直出发，水平到达
      // 路径：起点 → 垂直延伸 → 转到目标Y → 水平延伸 → 水平接入
      points = [fromPoint, {x: fromPoint.x, y: fromExtendY}, {x: toExtendX, y: fromExtendY}, {x: toExtendX, y: toPoint.y}, toPoint];
    } else if ((fromSide === 'left' || fromSide === 'right') && 
               (toSide === 'left' || toSide === 'right')) {
      // 两边都是水平方向
      const midX = (fromExtendX + toExtendX) / 2;
      points = [fromPoint, {x: fromExtendX, y: fromPoint.y}, {x: midX, y: fromPoint.y}, {x: midX, y: toPoint.y}, {x: toExtendX, y: toPoint.y}, toPoint];
    } else {
      // 两边都是垂直方向
      const midY = (fromExtendY + toExtendY) / 2;
      points = [fromPoint, {x: fromPoint.x, y: fromExtendY}, {x: fromPoint.x, y: midY}, {x: toPoint.x, y: midY}, {x: toPoint.x, y: toExtendY}, toPoint];
    }
    
    return createRoundedPath(points, CONNECTION_LINE_CORNER_RADIUS);
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

  // Initial zoom to fit all notes on mount
  useEffect(() => {
    if (notes.length > 0 && containerRef.current && !isEditMode) {
        // 使用setTimeout确保容器尺寸已计算
        const timer = setTimeout(() => {
            if (!containerRef.current) return;
            
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
            const newScale = Math.min(Math.max(0.2, Math.min(scaleX, scaleY) * 0.9), 4); // 90%缩放以留出边距

            const newX = (cW - contentWidth * newScale) / 2 - minX * newScale;
            const newY = (cH - contentHeight * newScale) / 2 - minY * newScale;

            setTransform({ x: newX, y: newY, scale: newScale });
        }, 100);
        
        return () => clearTimeout(timer);
    }
  }, [notes.length, isEditMode]); // 只在notes数量变化或退出编辑模式时触发

  // Zoom to Fit on Enter Edit Mode with animation
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode]);

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
    // 检测双指缩放（移动端）或 Ctrl/Cmd + 滚轮
    const isZoomGesture = e.ctrlKey || e.metaKey || (e.touches && e.touches.length === 2);
    
    if (isZoomGesture) {
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
  
  // 处理触摸双指缩放
  const touchStartRef = useRef<{ 
    distance: number; 
    scale: number; 
    centerX: number; 
    centerY: number;
    transformX: number;
    transformY: number;
  } | null>(null);
  
  const handleTouchStart = (e: React.TouchEvent) => {
    // 如果是双指，取消所有长按检测
    if (e.touches.length === 2) {
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
      
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
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
  
  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStartRef.current && containerRef.current) {
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
      
      // 计算当前两指中心点
      const currentCenterX = (touch1.clientX + touch2.clientX) / 2;
      const currentCenterY = (touch1.clientY + touch2.clientY) / 2;
      const rect = containerRef.current.getBoundingClientRect();
      const relativeCenterX = currentCenterX - rect.left;
      const relativeCenterY = currentCenterY - rect.top;
      
      // 计算缩放原点（两指中心点）在变换空间中的位置
      const scaleChange = newScale / touchStartRef.current.scale;
      const originX = touchStartRef.current.centerX;
      const originY = touchStartRef.current.centerY;
      
      // 调整transform，使缩放原点保持在两指中心
      const newX = originX - (originX - touchStartRef.current.transformX) * scaleChange;
      const newY = originY - (originY - touchStartRef.current.transformY) * scaleChange;
      
      // 如果中心点移动了，也要调整位置
      const centerDx = relativeCenterX - touchStartRef.current.centerX;
      const centerDy = relativeCenterY - touchStartRef.current.centerY;
      
      setTransform({ 
        x: newX + centerDx, 
        y: newY + centerDy, 
        scale: newScale 
      });
    }
  };
  
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      touchStartRef.current = null;
    }
  };

  const handleBoardPointerDown = (e: React.PointerEvent) => {
      // 阻止浏览器默认长按菜单
      e.preventDefault();
      // 取消任何进行中的长按检测
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      longPressNoteIdRef.current = null;
      
      if (e.button === 0 && !draggingNoteId && !isEditMode) { 
          setIsPanning(true);
          lastMousePos.current = { x: e.clientX, y: e.clientY };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }
  };

  const handleBoardPointerMove = (e: React.PointerEvent) => {
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
      
      if (isPanning) {
          setIsPanning(false);
          lastMousePos.current = null;
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      }
  };

  const handleNotePointerDown = (e: React.PointerEvent, noteId: string, note: Note) => {
      // 如果不在编辑模式，不阻止事件冒泡，让背景可以滑动
      if (!isEditMode) {
          // 只阻止默认的长按菜单，但不阻止事件冒泡
          e.preventDefault();
          // 启动长按检测
          longPressNoteIdRef.current = noteId;
          lastMousePos.current = { x: e.clientX, y: e.clientY };
          longPressTimerRef.current = setTimeout(() => {
              // 长按触发：进入编辑模式并开始拖动
              if (longPressNoteIdRef.current === noteId) {
                  e.stopPropagation(); // 长按触发后才阻止冒泡
                  setIsEditMode(true);
                  setDraggingNoteId(noteId);
                  setDragOffset({ x: 0, y: 0 });
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  if (navigator.vibrate) navigator.vibrate(50);
              }
          }, 600); // 600ms 长按阈值
          return;
      }
      
      // 如果已经在编辑模式，直接开始拖动
      e.stopPropagation();
      e.preventDefault();
      setDraggingNoteId(noteId);
      setDragOffset({ x: 0, y: 0 });
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleNotePointerMove = (e: React.PointerEvent) => {
      // 如果正在长按检测，检查是否移动太多，如果是则取消长按
      if (longPressTimerRef.current && lastMousePos.current && !isEditMode) {
          const dx = e.clientX - lastMousePos.current.x;
          const dy = e.clientY - lastMousePos.current.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist > 15) {
              // 移动太多，取消长按，不阻止事件冒泡，让背景可以滑动
              if (longPressTimerRef.current) {
                  clearTimeout(longPressTimerRef.current);
                  longPressTimerRef.current = null;
              }
              longPressNoteIdRef.current = null;
              lastMousePos.current = null;
          }
          // 非编辑模式下不阻止事件冒泡
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
        return;
      }
      
      // 取消长按计时器
      if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
      }
      
      // 如果只是短按（没有进入拖动），且不在编辑模式，打开编辑器
      if (!isEditMode && !draggingNoteId && longPressNoteIdRef.current === note.id) {
          setEditingNote(note);
          onToggleEditor(true);
          longPressNoteIdRef.current = null;
          return;
      }
      
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
      
      longPressNoteIdRef.current = null;
  };

  const handleNoteClick = (e: React.MouseEvent, note: Note) => {
      e.stopPropagation(); 
      if (!isEditMode) {
        setEditingNote(note);
        onToggleEditor(true);
      } else {
        // 在编辑模式下，点击选中便利贴
        setSelectedNoteId(note.id);
        setConnectingFrom(null);
        setConnectingTo(null);
      }
  };
  
  // 获取连接点的位置
  // 处理连接点点击
  const handleConnectionPointDown = (e: React.PointerEvent, noteId: string, side: 'top' | 'right' | 'bottom' | 'left') => {
    e.stopPropagation();
    e.preventDefault();
    
      // 振动反馈
    if (navigator.vibrate) {
      navigator.vibrate(VIBRATION_SHORT);
    }
    
    setSelectedNoteId(noteId);
    setConnectingFrom({ noteId, side });
    
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
                ? 'inset 0 0 0 8px #FFDD00, inset 0 0 0 12px rgba(255,221,0,0.3), inset 0 0 80px rgba(255,221,0,0.15)' 
                : 'none'
        }}
    >
      <div 
        ref={containerRef}
        className={`w-full h-full overflow-hidden bg-gray-50 relative touch-none select-none ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onPointerDown={handleBoardPointerDown}
        onPointerMove={handleBoardPointerMove}
        onPointerUp={handleBoardPointerUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Background */}
        <div 
          className="absolute inset-0 pointer-events-none z-0"
          style={{
              backgroundImage: `radial-gradient(#FFDD00 ${dotSize}px, transparent ${dotSize + 0.5}px)`,
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
          {/* Render connections */}
          <svg 
            className="absolute pointer-events-none" 
            style={{ 
              left: `-${SVG_OVERFLOW_PADDING}px`,
              top: `-${SVG_OVERFLOW_PADDING}px`,
              width: `calc(100% + ${SVG_OVERFLOW_PADDING * 2}px)`,
              height: `calc(100% + ${SVG_OVERFLOW_PADDING * 2}px)`,
              zIndex: 10,
              overflow: 'visible'
            }}
          >
            {/* 直角箭头标记定义 */}
            <defs>
              <marker
                id="arrowForward"
                markerWidth="12"
                markerHeight="12"
                refX="11"
                refY="6"
                orient="auto"
              >
                {/* 直角箭头（L形）*/}
                <path
                  d="M 2 2 L 10 2 L 10 10"
                  stroke="#FFDD00"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </marker>
              <marker
                id="arrowReverse"
                markerWidth="12"
                markerHeight="12"
                refX="1"
                refY="6"
                orient="auto-start-reverse"
              >
                {/* 直角箭头（L形）反向 */}
                <path
                  d="M 10 2 L 2 2 L 2 10"
                  stroke="#FFDD00"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </marker>
            </defs>
            
            {connectionPaths.map((pathData, index) => {
              if (!pathData) return null;
              const conn = connections[index];
              
              const arrowState = conn.arrow || 'forward'; // 默认正向箭头
              
              // 确定箭头标记
              let markerEnd = '';
              let markerStart = '';
              
              if (arrowState === 'forward') {
                markerEnd = 'url(#arrowForward)';
              } else if (arrowState === 'reverse') {
                markerStart = 'url(#arrowReverse)';
              }
              
              // 处理点击：forward -> reverse -> none -> delete
              const handleConnectionClick = () => {
                if (!isEditMode) return;
                
                const updatedConnections = connections.map(c => {
                  if (c.id === conn.id) {
                    if (c.arrow === 'forward' || !c.arrow) {
                      return { ...c, arrow: 'reverse' as const };
                    } else if (c.arrow === 'reverse') {
                      return { ...c, arrow: 'none' as const };
                    }
                  }
                  return c;
                }).filter(c => c !== null && !(c.id === conn.id && c.arrow === 'none' && arrowState === 'none'));
                
                // 如果是从 'none' 再点击，删除连接
                if (arrowState === 'none') {
                  onUpdateConnections?.(updatedConnections.filter(c => c.id !== conn.id));
                } else {
                  onUpdateConnections?.(updatedConnections);
                }
                
                if (navigator.vibrate) {
                  navigator.vibrate(VIBRATION_MEDIUM);
                }
              };
              
              return (
                <g key={pathData.id}>
                  {/* 连接线 */}
                  <path
                    d={pathData.pathD}
                    stroke="#FFDD00"
                    strokeWidth={CONNECTION_LINE_WIDTH}
                    strokeLinecap="round"
                    fill="none"
                    markerEnd={markerEnd}
                    markerStart={markerStart}
                  />
                  
                  {/* 可点击的透明宽线 */}
                  <path
                    d={pathData.pathD}
                    stroke="transparent"
                    strokeWidth={CONNECTION_LINE_CLICKABLE_WIDTH}
                    fill="none"
                    className="pointer-events-auto cursor-pointer"
                    onClick={handleConnectionClick}
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
                  stroke="#FFDD00"
                  strokeWidth={CONNECTION_LINE_WIDTH}
                  strokeLinecap="round"
                  strokeOpacity={strokeOpacity}
                  fill="none"
                />
              );
            })()}
          </svg>
          {notes.map((note) => {
              const isDragging = draggingNoteId === note.id;
              const currentX = note.boardX + (isDragging ? dragOffset.x : 0);
              const currentY = note.boardY + (isDragging ? dragOffset.y : 0);
              
              const isText = note.variant === 'text';
              const isCompact = note.variant === 'compact';

              // For text notes, use fit-content
              let noteWidth: string | number = isCompact ? '180px' : '256px';
              const noteHeight = isText ? 'auto' : isCompact ? '180px' : '256px';
              
              if (isText) {
                noteWidth = 'fit-content';
              }

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
                      width: isText ? 'fit-content' : noteWidth,
                      height: noteHeight,
                      minWidth: isText ? '100px' : undefined,
                      maxWidth: isText ? '800px' : undefined,
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
                        {isText ? (
                          <button 
                            onClick={(e) => handleDeleteClick(e, note.id)}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="absolute top-0 right-0 z-50 bg-red-500 text-white rounded-full p-1.5 shadow-md hover:scale-110 transition-transform translate-x-1/2 -translate-y-1/2"
                          >
                            <X size={14} />
                          </button>
                        ) : (
                          <button 
                            onClick={(e) => handleDeleteClick(e, note.id)}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="absolute -top-3 -right-3 z-50 bg-red-500 text-white rounded-full p-1.5 shadow-md hover:scale-110 transition-transform"
                          >
                            <X size={14} />
                          </button>
                        )}
                        
                        {/* Connection points - only show when selected */}
                        {selectedNoteId === note.id && (
                          <>
                            {(['top', 'right', 'bottom', 'left'] as const).map(side => {
                              const point = getConnectionPoint(note, side, isDragging, dragOffset);
                              const isText = note.variant === 'text';
                              const isCompact = note.variant === 'compact';
                              
                              // Use measured dimensions from the text container
                              let width = isCompact ? 180 : 256;
                              let height = isText ? 100 : isCompact ? 180 : 256;
                              
                              if (isText) {
                                const measured = textMeasureRefs.current.get(note.id);
                                if (measured) {
                                  width = measured.width;
                                  height = measured.height;
                                } else {
                                  const fontSize = note.fontSize === 1 ? 3 : note.fontSize === 2 ? 4 : note.fontSize === 3 ? 5 : note.fontSize === 4 ? 6 : 7;
                                  const textLength = note.text?.length || 0;
                                  const charWidth = fontSize * 16 * 0.6;
                                  width = textLength * charWidth;
                                  height = fontSize * 16 * 1.2;
                                }
                              }
                              
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
                              
                              return (
                                <div
                                  key={side}
                                  className={`absolute z-50 w-6 h-6 -translate-x-1/2 -translate-y-1/2 bg-[#FFDD00] border-2 border-white rounded-full shadow-lg cursor-crosshair transition-transform pointer-events-auto ${isActive ? 'scale-125' : 'hover:scale-110'}`}
                                  style={{ left: `${left}px`, top: `${top}px` }}
                                  onPointerDown={(e) => handleConnectionPointDown(e, note.id, side)}
                                />
                              );
                            })}
                          </>
                        )}
                      </>
                  )}

                  {isText ? (
                      <div 
                        className={`inline-block`} 
                        style={{ width: 'fit-content' }}
                        ref={(el) => {
                          // Measure text container dimensions
                          if (el) {
                            const rect = el.getBoundingClientRect();
                            // Convert screen coordinates to board coordinates
                            textMeasureRefs.current.set(note.id, { 
                              width: rect.width / transform.scale, 
                              height: rect.height / transform.scale 
                            });
                          }
                        }}
                      >
                          <p 
                            className={`text-gray-800 leading-none whitespace-nowrap ${note.isBold ? 'font-bold' : 'font-medium'}`} 
                            style={{ 
                              // Unified scale: 3rem - 7rem (5 levels)
                              fontSize: note.fontSize === 1 ? '3rem' : note.fontSize === 2 ? '4rem' : note.fontSize === 3 ? '5rem' : note.fontSize === 4 ? '6rem' : '7rem',
                              textShadow: '0 2px 4px rgba(0,0,0,0.05)'
                            }}
                          >
                              {note.text}
                          </p>
                      </div>
                  ) : (
                      <div 
                          className={`w-full h-full shadow-xl flex flex-col overflow-hidden group rounded-sm transition-shadow ${isDragging ? 'shadow-2xl ring-4 ring-[#FFDD00]' : ''}`}
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
                                        fontSize: note.fontSize === 1 ? '3rem' : note.fontSize === 2 ? '4rem' : note.fontSize === 3 ? '5rem' : note.fontSize === 4 ? '6rem' : '7rem'
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
              className="fixed bottom-24 left-4 z-[500] pointer-events-auto"
          >
            <ZoomSlider value={transform.scale} min={0.2} max={3.0} step={0.1} onChange={(val) => setTransform(prev => ({ ...prev, scale: val }))} />
        </motion.div>

        <div className="fixed top-4 right-4 z-[500] flex gap-3 pointer-events-auto items-center" style={{ height: '40px' }} onPointerDown={(e) => e.stopPropagation()}>
          {isEditMode ? (
              <button onClick={() => setIsEditMode(false)} className="flex items-center gap-2 px-3 py-2 bg-[#FFDD00] text-yellow-950 rounded-xl shadow-lg hover:bg-[#E6C700] font-bold h-full">
                  <Check size={18} /> Done
              </button>
          ) : (
              <button onClick={() => setIsEditMode(true)} className="flex items-center gap-2 px-3 py-2 bg-white text-gray-700 rounded-xl shadow-lg hover:bg-gray-50 font-bold border border-gray-100 h-full">
                  <Pencil size={18} /> Edit
              </button>
          )}
        </div>

        {/* Edit Toolbar: Unified White Buttons at Top Left */}
        {isEditMode && (
            <div 
                className="fixed top-4 left-4 z-[500] pointer-events-auto animate-in slide-in-from-left-4 fade-in flex items-center"
                style={{ height: '40px' }}
                onPointerDown={(e) => e.stopPropagation()} 
            >
                <div className="bg-white p-1 rounded-xl shadow-lg border border-gray-100 flex gap-1.5 h-full items-center">
                    <button
                        onClick={() => createNoteAtCenter('text')}
                        className="w-9 h-9 rounded-lg bg-gray-50 hover:bg-[#FFDD00]/10 text-gray-700 hover:text-yellow-700 flex items-center justify-center transition-colors active:scale-95"
                        title="Add Text"
                    >
                        <Type size={20} />
                    </button>
                    <button
                        onClick={() => createNoteAtCenter('compact')}
                        className="w-9 h-9 rounded-lg bg-gray-50 hover:bg-[#FFDD00]/10 text-gray-700 hover:text-yellow-700 flex items-center justify-center transition-colors active:scale-95"
                        title="Add Sticky Note"
                    >
                        <StickyNote size={20} />
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

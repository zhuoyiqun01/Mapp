import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Note, Frame, Connection } from '../types';
import { motion } from 'framer-motion';
import { NoteEditor } from './NoteEditor';
import { ZoomSlider } from './ZoomSlider';
import { Type, StickyNote, X, Pencil, Check, Minus } from 'lucide-react';
import { generateId } from '../utils';

// 常量定义
const CONNECTION_OFFSET = 40; // 连接线从连接点延伸的距离
const CONNECTION_POINT_SIZE = 6; // 连接点的大小（宽高，单位：像素）
const CONNECTION_POINT_DETECT_RADIUS = 20; // 连接点检测半径
const CONNECTION_LINE_WIDTH = 6; // 连接线宽度
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
}

export const BoardView: React.FC<BoardViewProps> = ({ notes, onUpdateNote, onToggleEditor, onAddNote, onDeleteNote, onEditModeChange, connections = [], onUpdateConnections, frames = [], onUpdateFrames }) => {
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
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<{ noteId: string; side: 'top' | 'right' | 'bottom' | 'left' } | null>(null);
  const [connectingTo, setConnectingTo] = useState<{ x: number; y: number } | null>(null);
  const [hoveringConnectionPoint, setHoveringConnectionPoint] = useState<{ noteId: string; side: 'top' | 'right' | 'bottom' | 'left' } | null>(null);
  
  // Frame state
  const [isDrawingFrame, setIsDrawingFrame] = useState(false);
  const [drawingFrameStart, setDrawingFrameStart] = useState<{ x: number; y: number } | null>(null);
  const [drawingFrameEnd, setDrawingFrameEnd] = useState<{ x: number; y: number } | null>(null);
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const [editingFrameId, setEditingFrameId] = useState<string | null>(null);
  const [editingFrameTitle, setEditingFrameTitle] = useState('');
  const [resizingFrame, setResizingFrame] = useState<{ id: string; corner: 'tl' | 'tr' | 'bl' | 'br'; startX: number; startY: number; originalFrame: Frame } | null>(null);
  const [draggingFrameId, setDraggingFrameId] = useState<string | null>(null);
  const [draggingFrameOffset, setDraggingFrameOffset] = useState<{ x: number; y: number } | null>(null);
  
  // Text measurement refs
  const textMeasureRefs = useRef<Map<string, { width: number; height: number }>>(new Map());

  // 重置空白点击计数
  const resetBlankClickCount = () => {
    blankClickCountRef.current = 0;
    if (blankClickResetTimerRef.current) {
      clearTimeout(blankClickResetTimerRef.current);
      blankClickResetTimerRef.current = null;
    }
  };

  useEffect(() => {
    onEditModeChange?.(isEditMode);
    
    // 退出编辑模式时清除所有连接相关状态和长按状态
    if (!isEditMode) {
      setConnectingFrom(null);
      setConnectingTo(null);
      setHoveringConnectionPoint(null);
      setSelectedConnectionId(null);
      setSelectedFrameId(null); // 清除frame选中状态
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
    const isText = note.variant === 'text';
    const isCompact = note.variant === 'compact';
    let width = isCompact ? 180 : 256;
    let height = isText ? 100 : isCompact ? 180 : 256;
    
    if (isText) {
      const measured = textMeasureRefs.current.get(note.id);
      if (measured) {
        width = measured.width;
        height = measured.height;
      }
    }
    
    const centerX = note.boardX + width / 2;
    const centerY = note.boardY + height / 2;
    
    return centerX >= frame.x && 
           centerX <= frame.x + frame.width && 
           centerY >= frame.y && 
           centerY <= frame.y + frame.height;
  };

  // 更新所有Note的分组信息
  const updateNoteGroups = () => {
    const updatedNotes = notes.map(note => {
      // 找到包含此Note的Frame
      const containingFrame = frames.find(frame => isNoteInFrame(note, frame));
      
      if (containingFrame) {
        return {
          ...note,
          groupId: containingFrame.id,
          groupName: containingFrame.title
        };
      } else {
        // 不在任何Frame中，清除分组信息
        return {
          ...note,
          groupId: undefined,
          groupName: undefined
        };
      }
    });
    
    // 只在有变化时更新
    const hasChanges = updatedNotes.some((note, index) => 
      note.groupId !== notes[index].groupId || 
      note.groupName !== notes[index].groupName
    );
    
    if (hasChanges) {
      updatedNotes.forEach(note => onUpdateNote(note));
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

  const handleWheel = (e: React.WheelEvent) => {
    // 检测双指缩放（移动端）或 Ctrl/Cmd + 滚轮
    const isZoomGesture = e.ctrlKey || e.metaKey || (e.touches && e.touches.length === 2);
    
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
  
  const handleTouchStart = (e: React.TouchEvent) => {
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
      
      // 计算当前两指中心点（相对于容器）
      const currentCenterX = (touch1.clientX + touch2.clientX) / 2;
      const currentCenterY = (touch1.clientY + touch2.clientY) / 2;
      const rect = containerRef.current.getBoundingClientRect();
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
  
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      touchStartRef.current = null;
      // 延迟重置缩放状态，防止触发误点击
      setTimeout(() => {
        setIsZooming(false);
      }, 100);
    }
  };

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
      
      if (e.button === 0 && !draggingNoteId && !isEditMode && !resizingFrame && !draggingFrameId) { 
          setIsPanning(true);
          lastMousePos.current = { x: e.clientX, y: e.clientY };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }
  };

  const handleBoardPointerMove = (e: React.PointerEvent) => {
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
          
          onUpdateFrames?.(frames.map(f => 
              f.id === resizingFrame.id ? { ...f, x: newX, y: newY, width: newWidth, height: newHeight } : f
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
      // 如果正在拖动Frame，结束拖动
      if (draggingFrameId) {
          setDraggingFrameId(null);
          setDraggingFrameOffset(null);
          return;
      }
      
      // 如果正在调整Frame大小，结束调整
      if (resizingFrame) {
          setResizingFrame(null);
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
          return;
      }
      
      // 点击空白处的退出逻辑（只在非拖动/非缩放状态下触发）
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
      
      if (!isPanning && !isZooming) {
          // 1. 如果有编辑中的Frame标题，先退出标题编辑
          if (editingFrameId) {
              setEditingFrameId(null);
              resetBlankClickCount();
              return;
          }
          
          // 2. 如果有选中状态，取消选中（Frame、Note或Connection）
          if (selectedFrameId || selectedNoteId || selectedConnectionId) {
              setSelectedFrameId(null);
              setSelectedNoteId(null);
              setSelectedConnectionId(null);
              resetBlankClickCount();
              return;
          }
          
          // 3. 如果在编辑模式，需要点击两次空白处才退出（但不在绘制frame时计数）
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
      
      if (isPanning) {
          setIsPanning(false);
          lastMousePos.current = null;
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      }
  };

  const handleNotePointerDown = (e: React.PointerEvent, noteId: string, note: Note) => {
      // 如果正在缩放，不响应拖动
      if (isZooming) return;
      
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
      
      // 如果已经在编辑模式，直接开始拖动
      e.stopPropagation();
      e.preventDefault();
      setDraggingNoteId(noteId);
      setDragOffset({ x: 0, y: 0 });
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
                  onUpdateNote({
                      ...note,
                      boardX: note.boardX + dragOffset.x,
                      boardY: note.boardY + dragOffset.y
                  });
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
              setEditingNote(note);
              onToggleEditor(true);
              
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

  const handleNoteClick = (e: React.MouseEvent, note: Note) => {
      e.stopPropagation();
      
      // 如果正在缩放，不触发点击
      if (isZooming) return;
      
      if (!isEditMode) {
        setEditingNote(note);
        onToggleEditor(true);
      } else {
        // 在编辑模式下，点击选中便利贴
        setSelectedNoteId(note.id);
        setConnectingFrom(null);
        setConnectingTo(null);
        setHoveringConnectionPoint(null);
        resetBlankClickCount();
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
          {/* Frames Layer - Below everything */}
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
                zIndex: -1,
              }}
            />
          )}
          
          {frames.map((frame) => (
            <div
              key={frame.id}
              className="absolute transition-colors"
              style={{
                left: `${frame.x}px`,
                top: `${frame.y}px`,
                width: `${frame.width}px`,
                height: `${frame.height}px`,
                backgroundColor: selectedFrameId === frame.id ? 'rgba(255, 221, 0, 0.2)' : frame.color,
                border: selectedFrameId === frame.id ? '4px solid #FFDD00' : '4px solid rgba(156, 163, 175, 0.3)',
                borderRadius: '12px',
                zIndex: -1,
                pointerEvents: 'none',
              }}
            >
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
                      border: '2px solid #FFDD00',
                      borderRadius: '2px',
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
                      border: '2px solid #FFDD00',
                      borderRadius: '2px',
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
                      border: '2px solid #FFDD00',
                      borderRadius: '2px',
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
                      border: '2px solid #FFDD00',
                      borderRadius: '2px',
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
          ))}
          
          {/* Frame Titles Layer - Above Notes */}
          {frames.map((frame) => (
            <div
              key={`title-${frame.id}`}
              className="absolute -top-8 left-0 px-3 py-1 bg-gray-500/50 text-white text-sm font-bold rounded-lg shadow-md flex items-center gap-2 pointer-events-auto"
              style={{ 
                left: `${frame.x}px`,
                top: `${frame.y - 32}px`,
                zIndex: 450,
                cursor: draggingFrameId === frame.id ? 'grabbing' : 'grab' 
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingFrameId(frame.id);
                setEditingFrameTitle(frame.title);
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
                    autoFocus
                    value={editingFrameTitle}
                    onChange={(e) => setEditingFrameTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        onUpdateFrames?.(frames.map(f => 
                          f.id === frame.id ? { ...f, title: editingFrameTitle || 'Frame' } : f
                        ));
                        setEditingFrameId(null);
                      } else if (e.key === 'Escape') {
                        setEditingFrameId(null);
                      }
                    }}
                    className="bg-transparent text-white px-2 py-0.5 rounded outline-none text-sm"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
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
                frame.title
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
          ))}

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
                  stroke="#FFDD00"
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
                  stroke="#FFDD00"
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
              
              // 在编辑模式下，未选中的连接线透明度为30%，退出编辑模式后恢复为80%
              const getOpacity = () => {
                if (isSelected) return 1;
                if (isEditMode) return 0.2; // 编辑模式下未选中：30%
                return 0.8; // 非编辑模式下未选中：80%
              };
              
              return (
                <g key={pathData.id}>
                  {/* 选中时的背景高亮 */}
                  {isSelected && (
                    <path
                      d={pathData.pathD}
                      stroke="rgba(255, 221, 0, 0.3)"
                      strokeWidth={CONNECTION_LINE_CLICKABLE_WIDTH}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  )}
                  {/* 连接线 */}
                  <path
                    d={pathData.pathD}
                    stroke="#FFDD00"
                    strokeWidth={isSelected ? CONNECTION_LINE_WIDTH + 2 : CONNECTION_LINE_WIDTH}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    markerEnd={markerEnd}
                    markerStart={markerStart}
                    opacity={getOpacity()}
                  />
                  
                  {/* 可点击的透明宽线 */}
                  <path
                    d={pathData.pathD}
                    stroke="transparent"
                    strokeWidth={CONNECTION_LINE_CLICKABLE_WIDTH}
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
              
              // 检查Note是否在任何Frame内
              const containingFrame = frames.find(frame => isNoteInFrame(note, frame));
              const isInFrame = !!containingFrame;

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
                  data-is-note="true"
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
                        
                        {/* Connection points - show when selected or when connecting */}
                        {(selectedNoteId === note.id || connectingFrom !== null) && (
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
                              const isHovering = hoveringConnectionPoint?.noteId === note.id && hoveringConnectionPoint?.side === side;
                              
                              return (
                                <div
                                  key={side}
                                  className={`absolute z-50 w-6 h-6 -translate-x-1/2 -translate-y-1/2 bg-[#FFDD00] border-2 border-white rounded-full shadow-lg cursor-crosshair transition-transform pointer-events-auto ${
                                    isActive ? 'scale-125' : isHovering ? 'scale-150 ring-4 ring-[#FFDD00] ring-opacity-50' : 'hover:scale-110'
                                  }`}
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
                          className={`w-full h-full shadow-xl flex flex-col overflow-hidden group rounded-sm transition-shadow ${isDragging ? 'shadow-2xl ring-4 ring-[#FFDD00]' : isInFrame ? 'ring-4 ring-[#EEEEEE]' : ''}`}
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
                                        // Sticky Note: 缩小到40% (1.2rem to 2.8rem)
                                        fontSize: note.fontSize === 1 ? '1.2rem' : note.fontSize === 2 ? '1.6rem' : note.fontSize === 3 ? '2rem' : note.fontSize === 4 ? '2.6rem' : '3.0rem'
                                    }}
                                  >
                                      {note.text || <span className="text-gray-400 italic font-normal text-base">Empty...</span>}
                                  </p>
                                  {!isCompact && (
                                    <div className="mt-auto flex flex-wrap gap-1">
                                        {note.tags.map(t => (
                                            <span key={t.id} className="flex-shrink-0 h-6 px-2.5 rounded-full text-xs font-bold text-white shadow-sm flex items-center gap-1" style={{ backgroundColor: t.color }}>{t.label}</span>
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
            <ZoomSlider value={transform.scale} min={0.2} max={3.0} step={0.1} onChange={(val) => zoomAtViewCenter(val)} />
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
                className="flex items-center gap-2 px-2 py-2 bg-[#FFDD00] text-yellow-950 rounded-xl shadow-lg hover:bg-[#E6C700] font-bold h-full"
              >
                  <Check size={18} /> Done
              </button>
          )}
        </div>

        {/* Edit Toolbar: Unified White Buttons at Top Left */}
        <div 
            className="fixed top-4 left-4 z-[500] pointer-events-auto animate-in slide-in-from-left-4 fade-in flex items-center"
            style={{ height: '40px' }}
            onPointerDown={(e) => e.stopPropagation()} 
        >
            <div className="bg-white px-2 py-6 rounded-xl shadow-lg border border-gray-100 flex gap-2 h-full items-center">
                {!isEditMode ? (
                    // 非编辑模式：显示进入编辑模式的按钮
                    <button
                        onClick={() => setIsEditMode(true)}
                        className="px-3 py-2 rounded-lg bg-gray-50 hover:bg-[#FFDD00]/10 text-gray-700 hover:text-yellow-700 flex items-center justify-center transition-colors active:scale-95"
                        title="进入编辑模式"
                    >
                        <Pencil size={20} />
                    </button>
                ) : (
                    // 编辑模式：显示编辑工具
                    <>
                        <button
                            onClick={() => createNoteAtCenter('text')}
                            className="px-2 py-2 rounded-lg bg-gray-50 hover:bg-[#FFDD00]/10 text-gray-700 hover:text-yellow-700 flex items-center justify-center transition-colors active:scale-95"
                            title="Add Text"
                        >
                            <Type size={20} />
                        </button>
                        <button
                            onClick={() => createNoteAtCenter('compact')}
                            className="px-3 py-2 rounded-lg bg-gray-50 hover:bg-[#FFDD00]/10 text-gray-700 hover:text-yellow-700 flex items-center justify-center transition-colors active:scale-95"
                            title="Add Sticky Note"
                        >
                            <StickyNote size={20} />
                        </button>
                        <button
                            onClick={() => {
                                setIsDrawingFrame(true);
                                setSelectedFrameId(null);
                            }}
                            className={`px-3 py-2 rounded-lg flex items-center justify-center transition-colors active:scale-95 ${isDrawingFrame ? 'bg-[#FFDD00] text-yellow-900' : 'bg-gray-50 hover:bg-[#FFDD00]/10 text-gray-700 hover:text-yellow-700'}`}
                            title="Add Frame"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 4">
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                            </svg>
                        </button>
                    </>
                )}
            </div>
        </div>

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
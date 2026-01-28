import React, { useState, useCallback, useRef, useEffect } from 'react';
import L from 'leaflet';
import { Note } from '../../types';

interface DropZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface GhostDragState {
  isDragging: boolean;
  ghostNote: Note | null;
  startTime: number;
  isLongPressing: boolean;
  isHoveringDropZone: boolean;
  dragPosition: { x: number; y: number } | null;
}

interface UseGhostDragProps {
  isRouteMode: boolean;
  onWaypointAdd: (note: Note) => void;
  dropZoneRef?: React.RefObject<HTMLElement>;
  mapInstance?: any; // Leaflet map instance
  notes?: Note[]; // All notes for finding the clicked one
}

export const useGhostDrag = ({ isRouteMode, onWaypointAdd, dropZoneRef, mapInstance, notes = [] }: UseGhostDragProps) => {
  const [ghostDragState, setGhostDragState] = useState<GhostDragState>({
    isDragging: false,
    ghostNote: null,
    startTime: 0,
    isLongPressing: false,
    isHoveringDropZone: false,
    dragPosition: null
  });

  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);
  const ghostElementRef = useRef<HTMLElement | null>(null);
  const isDraggingRef = useRef(false);
  const pointerStartPosRef = useRef({ x: 0, y: 0 });
  const lastHoverStateRef = useRef(false);
  const ghostNoteRef = useRef<Note | null>(null);

  // 创建真正的 DOM 灵魂点位元素
  const createGhostElement = (note: Note, clientX: number, clientY: number): HTMLElement => {
    const ghostElement = document.createElement('div');
    ghostElement.style.cssText = `
      position: fixed;
      left: ${clientX - 20}px;
      top: ${clientY - 40}px;
      width: 40px;
      height: 40px;
      background-color: #3B82F6;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      border: 3px solid white;
      pointer-events: none;
      z-index: 9999;
      opacity: 0.8;
      transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), background-color 0.2s, box-shadow 0.2s;
    `;

    // 添加表情符号
    if (note.emoji) {
      const emojiSpan = document.createElement('span');
      emojiSpan.textContent = note.emoji;
      emojiSpan.style.cssText = `
        transform: rotate(45deg);
        font-size: 16px;
        line-height: 1;
      `;
      ghostElement.appendChild(emojiSpan);
    }

    return ghostElement;
  };

  // 长按检测 - 全局事件处理版本
  const handleGlobalPointerDown = useCallback((event: PointerEvent) => {
    if (!isRouteMode || !mapInstance) return;

    // 检查是否点击在标记上
    const target = event.target as HTMLElement;
    const markerElement = target.closest('.leaflet-marker-icon');
    if (!markerElement) return;

    // 尝试从 marker 中获取对应的 note
    // 通过遍历 notes 找到匹配的 note（根据位置）
    let clickedNote: Note | null = null;

    // 通过坐标近似匹配找到点击的 note
    if (mapInstance) {
      const clickPoint = mapInstance.containerPointToLatLng([event.clientX, event.clientY]);
      // 找到距离点击点最近的 note
      let minDistance = Infinity;
      notes.forEach(note => {
        const distance = Math.sqrt(
          Math.pow(note.coords.lat - clickPoint.lat, 2) +
          Math.pow(note.coords.lng - clickPoint.lng, 2)
        );
        if (distance < minDistance && distance < 0.001) { // 约100米范围内
          minDistance = distance;
          clickedNote = note;
        }
      });
    }

    if (!clickedNote) {
      console.log('Could not find clicked note');
      return;
    }

    console.log('Global pointer down on marker:', clickedNote.text || clickedNote.emoji);

    const noteToDrag = clickedNote;

    // 阻止地图拖拽
    event.preventDefault();
    event.stopPropagation();

    // 记录起始位置
    pointerStartPosRef.current = { x: event.clientX, y: event.clientY };

    // 清除之前的定时器
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }

    isLongPressRef.current = false;

    // 显示长按进度指示器
    setGhostDragState(prev => ({
      ...prev,
      isLongPressing: true,
      dragPosition: { x: event.clientX, y: event.clientY }
    }));

    // 设置长按定时器（400ms）
    longPressTimerRef.current = setTimeout(() => {
      console.log('Global long press timer fired');
      isLongPressRef.current = true;

      // 震动反馈
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }

      // 禁用地图拖拽
      if (mapInstance?.dragging) {
        mapInstance.dragging.disable();
      }

      // 创建真正的 DOM 灵魂点位元素
      const ghostElement = createGhostElement(noteToDrag, event.clientX, event.clientY);
      document.body.appendChild(ghostElement);
      ghostElementRef.current = ghostElement;
      isDraggingRef.current = true;
      ghostNoteRef.current = noteToDrag;

      // 创建灵魂点位
      setGhostDragState({
        isDragging: true,
        ghostNote: noteToDrag,
        startTime: Date.now(),
        isLongPressing: false,
        isHoveringDropZone: false,
        dragPosition: { x: event.clientX, y: event.clientY }
      });
      console.log('Global ghost note created:', noteToDrag.text || noteToDrag.emoji);
    }, 400);
  }, [isRouteMode, mapInstance, notes]);

  // 长按检测 - 保留原有的方法作为备用
  const handlePointerDown = useCallback((note: Note, clientX: number, clientY: number, event?: PointerEvent) => {
    console.log('Direct pointer down on note:', note.text || note.emoji, 'isRouteMode:', isRouteMode);
    if (!isRouteMode) {
      console.log('Not in route mode, returning');
      return;
    }

    // 阻止地图拖拽
    event?.preventDefault();
    event?.stopPropagation();

    // 记录起始位置
    pointerStartPosRef.current = { x: clientX, y: clientY };

    // 清除之前的定时器
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }

    isLongPressRef.current = false;

    // 显示长按进度指示器
    setGhostDragState(prev => ({
      ...prev,
      isLongPressing: true,
      dragPosition: { x: clientX, y: clientY }
    }));

    // 设置长按定时器（400ms - 稍微缩短一点提升响应感）
    longPressTimerRef.current = setTimeout(() => {
      console.log('Long press timer fired, creating ghost note');
      isLongPressRef.current = true;

      // 震动反馈
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }

      // 禁用地图拖拽
      if (mapInstance?.dragging) {
        mapInstance.dragging.disable();
      }

      // 创建真正的 DOM 灵魂点位元素
      const ghostElement = createGhostElement(note, clientX, clientY);
      document.body.appendChild(ghostElement);
      ghostElementRef.current = ghostElement;
      isDraggingRef.current = true;
      ghostNoteRef.current = note;

      // 创建灵魂点位
      setGhostDragState({
        isDragging: true,
        ghostNote: note,
        startTime: Date.now(),
        isLongPressing: false, // 拖拽开始，长按结束
        isHoveringDropZone: false,
        dragPosition: { x: clientX, y: clientY }
      });
      console.log('Ghost note created:', note.text || note.emoji);
    }, 400);
  }, [isRouteMode, mapInstance]);

  // 指针移动
  const handlePointerMove = useCallback((clientX: number, clientY: number, event?: PointerEvent) => {
    // 如果正在长按但还没开始拖拽
    if (longPressTimerRef.current && !isDraggingRef.current) {
      // 计算移动距离
      const dx = clientX - pointerStartPosRef.current.x;
      const dy = clientY - pointerStartPosRef.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // 如果移动距离超过 10px，取消长按
      if (distance > 10) {
        console.log('Movement exceeded threshold, cancelling long press');
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
        setGhostDragState(prev => ({ ...prev, isLongPressing: false }));
        isLongPressRef.current = false;
      }
      return;
    }

    if (!isDraggingRef.current || !ghostElementRef.current) return;

    // 阻止默认行为和冒泡
    if (event) {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
    }

    // 更新灵魂点位位置 - 直接操作 DOM 避免 React 渲染开销
    ghostElementRef.current.style.left = `${clientX - 20}px`;
    ghostElementRef.current.style.top = `${clientY - 40}px`;

    // 检查是否悬停在投放区域上
    const isHovering = checkIfInDropZone(clientX, clientY);

    // 只有当悬停状态改变时才更新样式和状态，减少 React 渲染次数
    if (isHovering !== lastHoverStateRef.current) {
      lastHoverStateRef.current = isHovering;

      if (isHovering) {
        ghostElementRef.current.style.backgroundColor = '#10B981';
        ghostElementRef.current.style.transform = 'rotate(-45deg) scale(1.2)';
        ghostElementRef.current.style.boxShadow = '0 6px 20px rgba(16, 185, 129, 0.4)';
      } else {
        ghostElementRef.current.style.backgroundColor = '#3B82F6';
        ghostElementRef.current.style.transform = 'rotate(-45deg) scale(1)';
        ghostElementRef.current.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
      }

      setGhostDragState(prev => ({
        ...prev,
        isHoveringDropZone: isHovering,
        dragPosition: { x: clientX, y: clientY }
      }));
    }
  }, [mapInstance]);

  // 指针释放
  const handlePointerUp = useCallback((clientX: number, clientY: number) => {
    console.log('Pointer up at:', clientX, clientY, 'isDragging:', isDraggingRef.current);

    // 清除长按定时器
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    // 重置长按状态
    setGhostDragState(prev => ({ ...prev, isLongPressing: false }));

    if (!isDraggingRef.current) {
      isLongPressRef.current = false;
      return;
    }

    // 检查是否在航点篮子区域内
    const isInDropZone = checkIfInDropZone(clientX, clientY);

    if (isInDropZone && ghostNoteRef.current) {
      // 添加到航点
      onWaypointAdd(ghostNoteRef.current);

      // 震动反馈
      if (navigator.vibrate) {
        navigator.vibrate([50, 50, 50]);
      }
    }

    // 重新启用地图拖拽
    if (mapInstance?.dragging) {
      mapInstance.dragging.enable();
    }

    // 删除灵魂点位 DOM 元素
    if (ghostElementRef.current) {
      if (ghostElementRef.current.parentNode) {
        ghostElementRef.current.parentNode.removeChild(ghostElementRef.current);
      }
      ghostElementRef.current = null;
    }

    // 重置状态
    isDraggingRef.current = false;
    lastHoverStateRef.current = false;
    isLongPressRef.current = false;
    ghostNoteRef.current = null;

    setGhostDragState({
      isDragging: false,
      ghostNote: null,
      startTime: 0,
      isLongPressing: false,
      isHoveringDropZone: false,
      dragPosition: null
    });
  }, [onWaypointAdd, mapInstance]);

  // 检查是否在航点篮子区域内
  const checkIfInDropZone = (clientX: number, clientY: number): boolean => {
    if (!dropZoneRef?.current) return false;

    const rect = dropZoneRef.current.getBoundingClientRect();
    return (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    );
  };

  // 清理定时器
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  return {
    ghostDragState,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleGlobalPointerDown,
    isLongPress: isLongPressRef.current
  };
};

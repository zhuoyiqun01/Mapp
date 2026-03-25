import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Note, Coordinates } from '../../types';
import { THEME_COLOR } from '../../constants';

const MIN_DRAG_PX = 6;

export interface MapShiftBoxSelectProps {
  enabled: boolean;
  notes: Note[];
  noteCoordOverrides: Record<string, Coordinates>;
  onBoxCommit: (payload: { ids: string[]; additive: boolean }) => void;
  /** 成功完成框选后调用，用于吞掉 Leaflet 紧随其后的 map click（避免误清空多选） */
  onInteractionClaimed?: () => void;
  /** 与 Board 框选一致：主题色描边 + 半透明填充 */
  themeColor?: string;
}

/**
 * 按住 Shift 在地图上拖拽矩形，多选落入范围内的点位（与 Board 的 Shift 框选语义对齐）。
 * 需在 MapContainer 上设置 boxZoom={false}，否则会与 Leaflet 默认 Shift 放大冲突。
 */
export function MapShiftBoxSelect({
  enabled,
  notes,
  noteCoordOverrides,
  onBoxCommit,
  onInteractionClaimed,
  themeColor = THEME_COLOR
}: MapShiftBoxSelectProps) {
  const map = useMap();
  const boxRef = useRef<HTMLDivElement | null>(null);
  const onCommitRef = useRef(onBoxCommit);
  const onClaimRef = useRef(onInteractionClaimed);
  const notesRef = useRef(notes);
  const overridesRef = useRef(noteCoordOverrides);
  const themeColorRef = useRef(themeColor);
  onCommitRef.current = onBoxCommit;
  onClaimRef.current = onInteractionClaimed;
  notesRef.current = notes;
  overridesRef.current = noteCoordOverrides;
  themeColorRef.current = themeColor;

  useEffect(() => {
    if (!enabled) return;
    const container = map.getContainer();

    const startRef = { x: 0, y: 0 };
    let active = false;

    /** 与 BoardView 框选预览一致：主题色实线 + `${themeColor}20` 填充 + 4px 圆角 */
    const applyBoardBoxTheme = (el: HTMLDivElement) => {
      const tc = themeColorRef.current;
      el.style.borderRadius = '4px';
      el.style.border = `2px solid ${tc}`;
      el.style.backgroundColor = `${tc}20`;
    };

    const ensureBoxEl = (): HTMLDivElement => {
      if (boxRef.current && boxRef.current.parentElement === container) {
        applyBoardBoxTheme(boxRef.current);
        return boxRef.current;
      }
      const el = document.createElement('div');
      el.style.position = 'absolute';
      el.style.pointerEvents = 'none';
      el.style.zIndex = '3000';
      el.style.display = 'none';
      el.style.boxSizing = 'border-box';
      applyBoardBoxTheme(el);
      container.appendChild(el);
      boxRef.current = el;
      return el;
    };

    const onMove = (e: MouseEvent) => {
      if (!active) return;
      const box = ensureBoxEl();
      const rect = container.getBoundingClientRect();
      const x1 = startRef.x - rect.left;
      const y1 = startRef.y - rect.top;
      const x2 = e.clientX - rect.left;
      const y2 = e.clientY - rect.top;
      const left = Math.min(x1, x2);
      const top = Math.min(y1, y2);
      box.style.display = 'block';
      box.style.left = `${left}px`;
      box.style.top = `${top}px`;
      box.style.width = `${Math.abs(x2 - x1)}px`;
      box.style.height = `${Math.abs(y2 - y1)}px`;
    };

    const cleanupListeners = () => {
      L.DomEvent.off(document, 'mousemove', onMove);
      L.DomEvent.off(document, 'mouseup', onUp);
    };

    const onUp = (e: MouseEvent) => {
      if (!active) return;
      active = false;
      const box = boxRef.current;
      if (box) box.style.display = 'none';
      map.dragging.enable();
      cleanupListeners();

      const dx = e.clientX - startRef.x;
      const dy = e.clientY - startRef.y;
      if (Math.hypot(dx, dy) < MIN_DRAG_PX) return;

      const rect = container.getBoundingClientRect();
      const left = Math.min(startRef.x, e.clientX) - rect.left;
      const top = Math.min(startRef.y, e.clientY) - rect.top;
      const right = Math.max(startRef.x, e.clientX) - rect.left;
      const bottom = Math.max(startRef.y, e.clientY) - rect.top;

      const nw = map.containerPointToLatLng(L.point(left, top));
      const se = map.containerPointToLatLng(L.point(right, bottom));
      const bounds = L.latLngBounds(nw, se);

      const ids: string[] = [];
      const list = notesRef.current;
      const ov = overridesRef.current;
      for (const note of list) {
        if (note.variant !== 'standard' || !note.coords) continue;
        const o = ov[note.id];
        const lat = o?.lat ?? note.coords.lat;
        const lng = o?.lng ?? note.coords.lng;
        if (bounds.contains(L.latLng(lat, lng))) ids.push(note.id);
      }

      onClaimRef.current?.();
      onCommitRef.current({ ids, additive: e.shiftKey });
    };

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0 || !e.shiftKey) return;
      const t = e.target as HTMLElement;
      if (t.closest('.leaflet-marker-icon') || t.closest('.leaflet-popup') || t.closest('.leaflet-control'))
        return;
      if (
        t.closest('.pre-selected-labels-container') ||
        t.closest('.pre-selected-label-item') ||
        t.closest('.custom-text-label')
      )
        return;

      active = true;
      startRef.x = e.clientX;
      startRef.y = e.clientY;
      map.dragging.disable();
      L.DomEvent.on(document, 'mousemove', onMove);
      L.DomEvent.on(document, 'mouseup', onUp);
      L.DomEvent.preventDefault(e);
      L.DomEvent.stopPropagation(e);
    };

    L.DomEvent.on(container, 'mousedown', onDown);

    return () => {
      L.DomEvent.off(container, 'mousedown', onDown);
      cleanupListeners();
      map.dragging.enable();
      if (boxRef.current?.parentElement === container) {
        boxRef.current.remove();
        boxRef.current = null;
      }
    };
  }, [enabled, map]);

  return null;
}

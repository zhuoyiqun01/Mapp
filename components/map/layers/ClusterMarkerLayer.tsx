import React from 'react';
import type { Map as LeafletMap, LeafletMouseEvent, DragEndEvent } from 'leaflet';
import type { Note } from '../../../types';
import { NoteMarker } from '../markers/NoteMarker';
import type { Coordinates } from '../../../types';

export interface ClusterResult {
  notes: Note[];
  position: [number, number];
}

interface ClusterMarkerLayerProps {
  clusteredMarkers: ClusterResult[];
  fallbackNotes: Note[];
  showTextLabels: boolean;
  pinSize: number;
  themeColor: string;
  mapInstance: LeafletMap | null;
  onMarkerClick: (note: Note, e?: LeafletMouseEvent) => void;
  onClusterClick: (clusterNotes: Note[], e?: LeafletMouseEvent) => void;
  /** 仅对未聚合的单 pin 生效：hover 时回调，用于显示临时 label（及 tab 预览） */
  onMarkerHover?: (note: Note | null) => void;
  selectedNoteId?: string | null;
  /** 多选时凡在集合内的 pin 可拖（与 label 展示集合一致） */
  selectedNoteIds?: ReadonlySet<string> | null;
  isPreviewMode?: boolean;
  onMarkerDragEnd?: (note: Note, e: DragEndEvent) => void;
  onMarkerDrag?: (note: Note, e: any) => void;
  // marker 拖拽乐观坐标覆盖
  noteCoordOverrides?: Record<string, Coordinates>;
  /** 图层面板叠放序：序号越大越在上层（与同视图 sortNotesByLayerStack 一致） */
  noteStackRank?: ReadonlyMap<string, number>;
}

function ClusterMarkerLayerInner({
  clusteredMarkers,
  fallbackNotes,
  showTextLabels,
  pinSize,
  themeColor,
  mapInstance,
  onMarkerClick,
  onClusterClick,
  onMarkerHover,
  selectedNoteId,
  selectedNoteIds = null,
  isPreviewMode = false,
  onMarkerDragEnd,
  onMarkerDrag,
  noteCoordOverrides = {},
  noteStackRank
}: ClusterMarkerLayerProps) {
  if (!mapInstance) return null;

  const zBoost = (note: Note) => (note.isFavorite ? 200 : 0) + (noteStackRank?.get(note.id) ?? 0) * 2;

  const pinDraggable = (noteId: string) =>
    !isPreviewMode &&
    ((selectedNoteIds != null && selectedNoteIds.size > 0 && selectedNoteIds.has(noteId)) ||
      selectedNoteId === noteId);

  if (clusteredMarkers.length > 0) {
    return (
      <>
        {clusteredMarkers.map((cluster) => {
          if (cluster.notes.length === 1) {
            const note = cluster.notes[0];
            const override = noteCoordOverrides[note.id];
            const position = override ? ([override.lat, override.lng] as [number, number]) : cluster.position;
            return (
              <NoteMarker
                key={note.id}
                note={note}
                position={position}
                showTextLabels={showTextLabels}
                pinSize={pinSize}
                themeColor={themeColor}
                zIndexOffset={zBoost(note)}
                onClick={(e) => {
                  e.originalEvent?.stopPropagation();
                  e.originalEvent?.stopImmediatePropagation();
                  onMarkerClick(note, e);
                }}
                onMouseEnter={onMarkerHover ? () => onMarkerHover(note) : undefined}
                onMouseLeave={onMarkerHover ? () => onMarkerHover(null) : undefined}
                draggable={pinDraggable(note.id)}
                onDragEnd={onMarkerDragEnd ? (e) => onMarkerDragEnd(note, e) : undefined}
                onDrag={onMarkerDrag ? (e) => onMarkerDrag(note, e) : undefined}
              />
            );
          } else {
            const clusterKey = cluster.notes.map((n) => n.id).sort().join('-');
            const note = cluster.notes[0];
            const topNote = [...cluster.notes].sort(
              (a, b) => (noteStackRank?.get(b.id) ?? 0) - (noteStackRank?.get(a.id) ?? 0)
            )[0];
            const clusterZ = Math.max(...cluster.notes.map((n) => zBoost(n)));
            return (
              <NoteMarker
                key={`cluster-${clusterKey}`}
                note={topNote}
                position={cluster.position}
                clusterCount={cluster.notes.length}
                showTextLabels={showTextLabels}
                pinSize={pinSize}
                themeColor={themeColor}
                zIndexOffset={clusterZ}
                onClick={(e) => {
                  e.originalEvent?.stopPropagation();
                  e.originalEvent?.stopImmediatePropagation();
                  onClusterClick(cluster.notes, e);
                }}
              />
            );
          }
        })}
      </>
    );
  }

  return (
    <>
      {fallbackNotes.map((note) => (
        <NoteMarker
          key={note.id}
          note={note}
          position={[note.coords.lat, note.coords.lng]}
          showTextLabels={showTextLabels}
          pinSize={pinSize}
          themeColor={themeColor}
          zIndexOffset={zBoost(note)}
          onClick={(e) => {
            e.originalEvent?.stopPropagation();
            e.originalEvent?.stopImmediatePropagation();
            onMarkerClick(note, e);
          }}
          onMouseEnter={onMarkerHover ? () => onMarkerHover(note) : undefined}
          onMouseLeave={onMarkerHover ? () => onMarkerHover(null) : undefined}
          draggable={pinDraggable(note.id)}
          onDragEnd={onMarkerDragEnd ? (e) => onMarkerDragEnd(note, e) : undefined}
          onDrag={onMarkerDrag ? (e) => onMarkerDrag(note, e) : undefined}
        />
      ))}
    </>
  );
}

// 明确标注 props 类型，避免 React.memo 推导丢失导致的 TS/IDE 报错
export const ClusterMarkerLayer = React.memo(ClusterMarkerLayerInner) as React.FC<ClusterMarkerLayerProps>;

import React from 'react';
import type { Note } from '../../../types';
import { NoteMarker } from '../markers/NoteMarker';

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
  mapInstance: L.Map | null;
  onMarkerClick: (note: Note, e?: L.LeafletMouseEvent) => void;
  onClusterClick: (clusterNotes: Note[], e?: L.LeafletMouseEvent) => void;
}

function ClusterMarkerLayerInner({
  clusteredMarkers,
  fallbackNotes,
  showTextLabels,
  pinSize,
  themeColor,
  mapInstance,
  onMarkerClick,
  onClusterClick
}: ClusterMarkerLayerProps) {
  if (!mapInstance) return null;

  if (clusteredMarkers.length > 0) {
    return (
      <>
        {clusteredMarkers.map((cluster) => {
          if (cluster.notes.length === 1) {
            const note = cluster.notes[0];
            return (
              <NoteMarker
                key={note.id}
                note={note}
                position={cluster.position}
                showTextLabels={showTextLabels}
                pinSize={pinSize}
                themeColor={themeColor}
                zIndexOffset={note.isFavorite ? 200 : 0}
                onClick={(e) => {
                  e.originalEvent?.stopPropagation();
                  e.originalEvent?.stopImmediatePropagation();
                  onMarkerClick(note, e);
                }}
              />
            );
          } else {
            const clusterKey = cluster.notes.map((n) => n.id).sort().join('-');
            const note = cluster.notes[0];
            const hasFavorite = cluster.notes.some((n) => n.isFavorite);
            return (
              <NoteMarker
                key={`cluster-${clusterKey}`}
                note={note}
                position={cluster.position}
                clusterCount={cluster.notes.length}
                showTextLabels={showTextLabels}
                pinSize={pinSize}
                themeColor={themeColor}
                zIndexOffset={hasFavorite ? 200 : 0}
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
          zIndexOffset={note.isFavorite ? 200 : 0}
          onClick={(e) => {
            e.originalEvent?.stopPropagation();
            e.originalEvent?.stopImmediatePropagation();
            onMarkerClick(note, e);
          }}
        />
      ))}
    </>
  );
}

export const ClusterMarkerLayer = React.memo(ClusterMarkerLayerInner);

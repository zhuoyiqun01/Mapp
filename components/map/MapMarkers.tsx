import React, { useCallback, useState } from 'react';
import { Marker } from 'react-leaflet';
import L from 'leaflet';
import { Note } from '../../types';
import { THEME_COLOR } from '../../constants';

interface ClusteredMarker {
  notes: Note[];
  position: [number, number];
}

interface MapMarkersProps {
  mapNotes: Note[];
  clusteredMarkers: ClusteredMarker[];
  mapInstance: L.Map | null;
  showTextLabels: boolean;
  pinSize: number;
  onMarkerClick: (note: Note, e?: L.LeafletMouseEvent) => void;
  onClusterClick: (clusterNotes: Note[], e?: L.LeafletMouseEvent) => void;
  createCustomIcon: (note: Note, clusterCount?: number, showTextLabels?: boolean, pinSize?: number) => L.DivIcon;
}

export const MapMarkers: React.FC<MapMarkersProps> = ({
  mapNotes,
  clusteredMarkers,
  mapInstance,
  showTextLabels,
  pinSize,
  onMarkerClick,
  onClusterClick,
  createCustomIcon
}) => {
  return (
    <>
      {/* Text labels mode: show all markers individually without clustering */}
      {showTextLabels && mapNotes.map((note) => (
        <Marker
          key={note.id}
          position={[note.coords.lat, note.coords.lng]}
          icon={createCustomIcon(note, 1, showTextLabels, pinSize)}
          zIndexOffset={note.isFavorite ? 100 : 0}
          eventHandlers={{
            click: (e) => onMarkerClick(note, e),
          }}
        />
      ))}

      {/* Clustered markers mode */}
      {!showTextLabels && clusteredMarkers.length > 0 && mapInstance ? (
        // Show clustered markers (only show clusters with multiple markers, single markers shown separately)
        clusteredMarkers.map((cluster) => {
          if (cluster.notes.length === 1) {
            // Single marker in cluster array - show as individual marker
            const note = cluster.notes[0];
            return (
              <Marker
                key={note.id}
                position={cluster.position}
                icon={createCustomIcon(note, 1, showTextLabels, pinSize)}
                zIndexOffset={note.isFavorite ? 100 : 0}
                eventHandlers={{
                  click: (e) => onMarkerClick(note, e),
                }}
              />
            );
          } else {
            // Multiple markers, show cluster - use sorted note IDs as stable key
            const clusterKey = cluster.notes
              .map(note => note.id)
              .sort()
              .join('-');
            return (
              <Marker
                key={`cluster-${clusterKey}`}
                position={cluster.position}
                icon={createCustomIcon(cluster.notes[0], cluster.notes.length, showTextLabels, pinSize)}
                zIndexOffset={cluster.notes.some(note => note.isFavorite) ? 100 : -100}
                eventHandlers={{
                  click: (e) => onClusterClick(cluster.notes, e),
                }}
              />
            );
          }
        })
      ) : (
        // Show single markers (non-map mode or when no clustering)
        !showTextLabels && mapNotes.map((note) => (
          <Marker
            key={note.id}
            position={[note.coords.lat, note.coords.lng]}
            icon={createCustomIcon(note, 1, showTextLabels, pinSize)}
            zIndexOffset={note.isFavorite ? 100 : 0}
            eventHandlers={{
              click: (e) => onMarkerClick(note, e),
            }}
          />
        ))
      )}
    </>
  );
};

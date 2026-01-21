import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import { Note } from '../../types';
import { DivIcon } from 'leaflet';

interface TextLabelsLayerProps {
  notes: Note[];
  showTextLabels: boolean;
  pinSize: number;
  themeColor: string;
  clusteredMarkers?: Array<{ notes: Note[], position: [number, number] }>;
}

export const TextLabelsLayer: React.FC<TextLabelsLayerProps> = ({
  notes,
  showTextLabels,
  pinSize,
  themeColor,
  clusteredMarkers = []
}) => {
  if (!showTextLabels) return null;

  // Get IDs of notes that are actually rendered as individual markers (not clustered)
  const visibleIndividualNoteIds = new Set<string>();
  const clusterLabels: Array<{ position: [number, number], text: string, isFavorite: boolean }> = [];

  clusteredMarkers.forEach(cluster => {
    if (cluster.notes.length === 1) {
      visibleIndividualNoteIds.add(cluster.notes[0].id);
    } else if (cluster.notes.length > 1) {
      // For clusters, find the first note with text to represent the cluster
      const representativeNote = cluster.notes.find(note => note.variant === 'standard' && note.text?.trim());
      if (representativeNote) {
        clusterLabels.push({
          position: cluster.position,
          text: representativeNote.text.trim(),
          isFavorite: representativeNote.isFavorite === true
        });
      }
    }
  });

  return (
    <>
      {/* Individual marker labels */}
      {notes
        .filter(note => note.variant === 'standard' && note.text?.trim() && visibleIndividualNoteIds.has(note.id))
        .map(note => {
          // Calculate text width (approximate)
          const text = note.text?.trim() || '';
          const isFavorite = note.isFavorite === true;
          const scale = isFavorite ? 2 : 1; // Scale favorite labels like pins
          const fontSize = Math.max(10, pinSize / 3) * scale;
          const approxCharWidth = fontSize * 0.6; // Approximate character width
          const padding = 12 * scale; // Scale padding with favorite status
          const textWidth = Math.min(text.length * approxCharWidth + padding, 180 * scale);

          const icon = new DivIcon({
            html: `
              <div style="
                background: white;
                color: black;
                padding: 2px 6px;
                border-radius: 4px;
                font-size: ${fontSize}px;
                font-weight: 500;
                white-space: nowrap;
                max-width: 180px;
                overflow: hidden;
                text-overflow: ellipsis;
                border: 2px solid ${themeColor};
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                pointer-events: none;
                display: inline-block;
                width: fit-content;
                min-width: 20px;
              ">
                ${text}
              </div>
            `,
            className: 'custom-text-label',
            iconSize: [textWidth + 16, 24], // Width based on text + padding, height fixed
            iconAnchor: [textWidth / 2 + 8, 12] // Center horizontally, position above marker
          });

          return (
            <Marker
              key={`text-${note.id}`}
              position={[note.coords.lat, note.coords.lng]}
              icon={icon}
              interactive={false}
              zIndexOffset={isFavorite ? 300 : 50} // Favorite labels > Favorite pins > Normal labels > Normal pins
            />
          );
        })}

      {/* Cluster labels */}
      {clusterLabels.map((clusterLabel, index) => {
        // Calculate text width (approximate)
        const text = clusterLabel.text;
        const isFavorite = clusterLabel.isFavorite;
        const scale = isFavorite ? 2 : 1; // Scale favorite labels like pins
        const fontSize = Math.max(10, pinSize / 3) * scale;
        const approxCharWidth = fontSize * 0.6; // Approximate character width
        const padding = 12 * scale; // Scale padding with favorite status
        const textWidth = Math.min(text.length * approxCharWidth + padding, 180 * scale);

        const icon = new DivIcon({
          html: `
            <div style="
              background: white;
              color: black;
              padding: 2px 6px;
              border-radius: 4px;
              font-size: ${fontSize}px;
              font-weight: 500;
              white-space: nowrap;
              max-width: 180px;
              overflow: hidden;
              text-overflow: ellipsis;
              border: 2px solid ${themeColor};
              box-shadow: 0 2px 4px rgba(0,0,0,0.2);
              pointer-events: none;
              display: inline-block;
              width: fit-content;
              min-width: 20px;
            ">
              ${text}
            </div>
          `,
          className: 'custom-text-label',
          iconSize: [textWidth + 16, 24], // Width based on text + padding, height fixed
          iconAnchor: [textWidth / 2 + 8, 12] // Center horizontally, position above marker
        });

        return (
          <Marker
            key={`cluster-text-${index}`}
            position={clusterLabel.position}
            icon={icon}
            interactive={false}
            zIndexOffset={isFavorite ? 300 : 50} // Favorite labels > Favorite pins > Normal labels > Normal pins
          />
        );
      })}
    </>
  );
};



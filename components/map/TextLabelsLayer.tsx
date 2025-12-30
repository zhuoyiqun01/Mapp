import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import { Note } from '../../types';
import { DivIcon } from 'leaflet';

interface TextLabelsLayerProps {
  notes: Note[];
  showTextLabels: boolean;
  pinSize: number;
  themeColor: string;
}

export const TextLabelsLayer: React.FC<TextLabelsLayerProps> = ({
  notes,
  showTextLabels,
  pinSize,
  themeColor
}) => {
  if (!showTextLabels) return null;

  return (
    <>
      {notes
        .filter(note => note.variant === 'standard' && note.text?.trim())
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
                max-width: ${180 * scale}px;
                overflow: hidden;
                text-overflow: ellipsis;
                border: 2px solid ${themeColor};
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                pointer-events: none;
                display: inline-block;
                width: fit-content;
                min-width: 20px;
                text-align: center;
              ">
                ${text}
              </div>
            `,
            className: 'custom-text-label',
            iconSize: [Math.min(textWidth + 16, 180 * scale + 16), 24], // Cap width, height fixed
            iconAnchor: [Math.min(textWidth + 16, 180 * scale + 16) / 2, 12] // Always center horizontally
          });

          return (
            <Marker
              key={`text-${note.id}`}
              position={[note.coords.lat, note.coords.lng]}
              icon={icon}
              interactive={false}
              zIndexOffset={isFavorite ? 200 : 0} // Favorite labels on top
            />
          );
        })}
    </>
  );
};



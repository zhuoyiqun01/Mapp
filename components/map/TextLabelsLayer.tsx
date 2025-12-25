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
          const fontSize = Math.max(10, pinSize / 3);
          const approxCharWidth = fontSize * 0.6; // Approximate character width
          const padding = 12; // 6px * 2 for horizontal padding
          const textWidth = Math.min(text.length * approxCharWidth + padding, 120);

          const icon = new DivIcon({
            html: `
              <div style="
                background: white;
                color: ${themeColor};
                padding: 2px 6px;
                border-radius: 4px;
                font-size: ${fontSize}px;
                font-weight: 500;
                white-space: nowrap;
                max-width: 120px;
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
            />
          );
        })}
    </>
  );
};



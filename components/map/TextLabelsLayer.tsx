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
          const icon = new DivIcon({
            html: `
              <div style="
                background: ${themeColor};
                color: white;
                padding: 2px 6px;
                border-radius: 4px;
                font-size: ${Math.max(10, pinSize / 3)}px;
                font-weight: 500;
                white-space: nowrap;
                max-width: 120px;
                overflow: hidden;
                text-overflow: ellipsis;
                border: 2px solid white;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                pointer-events: none;
              ">
                ${note.text?.trim()}
              </div>
            `,
            className: 'custom-text-label',
            iconSize: [0, 0],
            iconAnchor: [0, -pinSize / 2 - 5]
          });

          return (
            <Marker
              key={`text-${note.id}`}
              position={[note.lat, note.lng]}
              icon={icon}
              interactive={false}
            />
          );
        })}
    </>
  );
};



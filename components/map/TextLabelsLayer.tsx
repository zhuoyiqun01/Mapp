import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import { Note } from '../../types';
import { parseNoteContent } from '../../utils';
import { DivIcon } from 'leaflet';

interface TextLabelsLayerProps {
  notes: Note[];
  showTextLabels: boolean;
  pinSize: number;
  themeColor: string;
  clusteredMarkers?: Array<{ notes: Note[], position: [number, number] }>;
  selectedNoteId?: string | null;
  preSelectedNotes?: Note[] | null;
  isPreviewMode?: boolean;
  onSelectNote?: (noteId: string) => void;
  onClearSelection?: () => void;
}

export const TextLabelsLayer: React.FC<TextLabelsLayerProps> = ({
  notes,
  showTextLabels,
  pinSize,
  themeColor,
  clusteredMarkers = [],
  selectedNoteId,
  preSelectedNotes,
  isPreviewMode = false,
  onSelectNote,
  onClearSelection
}) => {
  if (!showTextLabels && !preSelectedNotes && !isPreviewMode) return null;

  // In preview mode, if no note is selected and no pre-selection, and label mode is off, don't show any labels
  if (isPreviewMode && !selectedNoteId && !preSelectedNotes && !showTextLabels) return null;

  // Get IDs of notes that are actually rendered as individual markers (not clustered)
  const visibleIndividualNoteIds = new Set<string>();
  const clusterLabels: Array<{ position: [number, number], text: string, isFavorite: boolean }> = [];

    clusteredMarkers.forEach(cluster => {
    if (cluster.notes.length === 1) {
      visibleIndividualNoteIds.add(cluster.notes[0].id);
    } else if (cluster.notes.length > 1) {
      // For clusters, find the first note with title/text to represent the cluster（标题规则参考 TableView/tab 模式）
      const representativeNote = cluster.notes.find(note => note.variant === 'standard' && (parseNoteContent(note.text || '').title || note.text?.trim()));
      if (representativeNote) {
        const parsed = parseNoteContent(representativeNote.text || '');
        let text = parsed.title || representativeNote.emoji || (representativeNote.variant === 'image' ? '照片' : '点位');

        clusterLabels.push({
          position: cluster.position,
          text: text,
          isFavorite: representativeNote.isFavorite === true
        });
      }
    }
  });

  return (
    <>
      {/* Pre-selected cluster labels (stacked vertically).
          在普通地图模式和预览模式下都可复用，用于“展开簇内 labels，点击 label 选择 note”。 */}
      {preSelectedNotes && preSelectedNotes.length > 0 && (() => {
        const pos = preSelectedNotes[0].coords;
        const fontSize = Math.max(10, pinSize / 3);
        const itemHeight = fontSize + 16;
        const totalHeight = preSelectedNotes.length * itemHeight;
        
        return (
          <Marker
            position={[pos.lat, pos.lng]}
            interactive={true}
            zIndexOffset={1000}
            icon={new DivIcon({
              className: 'pre-selected-labels-container',
              html: `
                <div style="display: flex; flex-direction: column; gap: 4px; align-items: center;">
                  ${preSelectedNotes.map((note, idx) => {
                    const parsed = parseNoteContent(note.text || '');
                    let text = parsed.title || note.emoji || (note.variant === 'image' ? '照片' : '点位');

                    const isFav = note.isFavorite === true;

                    return `
                      <div 
                        data-note-id="${note.id}"
                        class="pre-selected-label-item"
                        style="
                          background: white;
                          color: ${isFav ? themeColor : 'black'};
                          padding: 4px 8px;
                          border-radius: 4px;
                          font-size: ${fontSize}px;
                          font-weight: ${isFav ? 'bold' : '500'};
                          white-space: nowrap;
                          max-width: 180px;
                          overflow: hidden;
                          text-overflow: ellipsis;
                          border: 2px solid ${themeColor};
                          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                          opacity: 0.7;
                          cursor: pointer;
                          pointer-events: auto;
                          margin-bottom: 4px;
                          text-align: center;
                        "
                      >
                        ${text}
                      </div>
                    `;
                  }).join('')}
                </div>
              `,
              iconSize: [200, totalHeight],
              iconAnchor: [100, totalHeight / 2]
            })}
            eventHandlers={{
              // 使用 mousedown 让单击立即触发，而不是依赖 Leaflet 对 click 的处理
              mousedown: (e) => {
                e.originalEvent.stopPropagation();
                e.originalEvent.stopImmediatePropagation();
                const target = e.originalEvent.target as HTMLElement;
                const noteId =
                  target.getAttribute('data-note-id') ||
                  target.closest('.pre-selected-label-item')?.getAttribute('data-note-id');
                if (noteId && onSelectNote) {
                  onSelectNote(noteId);
                } else if (onClearSelection) {
                  onClearSelection();
                }
              }
            }}
          />
        );
      })()}

      {/* Individual marker labels */}
      {notes
        .filter(note => {
          if (isPreviewMode) {
            // If pre-selecting from a cluster, hide normal labels
            if (preSelectedNotes) return false;
            if (selectedNoteId) {
              return note.id === selectedNoteId && note.text?.trim();
            }
            return showTextLabels && note.variant === 'standard' && note.text?.trim() && visibleIndividualNoteIds.has(note.id);
          }
          // 普通地图模式下，如果当前有 preSelectedNotes（来自某个点/簇的展开），就隐藏全局 labels，只保留展开的那一组
          if (preSelectedNotes) return false;
          return showTextLabels && note.variant === 'standard' && note.text?.trim() && visibleIndividualNoteIds.has(note.id);
        })
        .map(note => {
          // Calculate text width (approximate)
          const parsed = parseNoteContent(note.text || '');
          const text = parsed.title || (note.text || '').split('\n')[0].trim();

          const isFavorite = note.isFavorite === true;
          const scale = isFavorite ? 1.5 : 1; // Slightly scale favorite labels, but not as much as pins to avoid clutter
          const fontSize = Math.max(10, pinSize / 3) * scale;
          const approxCharWidth = fontSize * 0.6; // Approximate character width
          const paddingX = 8 * scale;
          const paddingY = 2 * scale;
          const textWidth = Math.min((text.length) * approxCharWidth + paddingX * 2, 200 * scale);
          const labelHeight = fontSize + paddingY * 2 + 4;

          const icon = new DivIcon({
            html: `
                <div style="
                  background: white;
                  color: ${isFavorite ? themeColor : 'black'};
                  padding: ${paddingY}px ${paddingX}px;
                  border-radius: 4px;
                  font-size: ${fontSize}px;
                  font-weight: ${isFavorite ? 'bold' : '500'};
                  white-space: nowrap;
                  max-width: ${200 * scale}px;
                  overflow: hidden;
                  text-overflow: ellipsis;
                  border: ${isFavorite ? 2 : 1.5}px solid ${themeColor};
                  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                  pointer-events: none;
                  display: inline-block;
                  width: fit-content;
                ">
                  ${text}
                </div>
            `,
            className: 'custom-text-label',
            iconSize: [textWidth, labelHeight],
            iconAnchor: [textWidth / 2, labelHeight + (isFavorite ? 10 : 5)] // Position above marker
          });

          return (
            <Marker
              key={`text-${note.id}`}
              position={[note.coords.lat, note.coords.lng]}
              icon={icon}
              interactive={false}
              zIndexOffset={isFavorite ? 300 : 50}
            />
          );
        })}

      {/* Cluster labels */}
      {(
        // 非预览模式：只有在没有 preSelectedNotes 时才显示全局 cluster labels
        (!isPreviewMode && !preSelectedNotes) ||
        // 预览模式：原有逻辑，且需要没有 preSelectedNotes
        (isPreviewMode && !selectedNoteId && !preSelectedNotes)
      ) && clusterLabels.map((clusterLabel, index) => {
        // Calculate text width (approximate)
        const text = clusterLabel.text;
        const isFavorite = clusterLabel.isFavorite;
        const scale = isFavorite ? 1.5 : 1; 
        const fontSize = Math.max(10, pinSize / 3) * scale;
        const approxCharWidth = fontSize * 0.6; // Approximate character width
        const paddingX = 8 * scale;
        const paddingY = 2 * scale;
        const textWidth = Math.min((text.length) * approxCharWidth + paddingX * 2, 200 * scale);
        const labelHeight = fontSize + paddingY * 2 + 4;

        const icon = new DivIcon({
          html: `
                <div style="
                  background: white;
                  color: ${isFavorite ? themeColor : 'black'};
                  padding: ${paddingY}px ${paddingX}px;
                  border-radius: 4px;
                  font-size: ${fontSize}px;
                  font-weight: ${isFavorite ? 'bold' : '500'};
                  white-space: nowrap;
                  max-width: ${200 * scale}px;
                  overflow: hidden;
                  text-overflow: ellipsis;
                  border: ${isFavorite ? 2 : 1.5}px solid ${themeColor};
                  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                  pointer-events: none;
                  display: inline-block;
                  width: fit-content;
                ">
                  ${text}
                </div>
          `,
          className: 'custom-text-label',
          iconSize: [textWidth, labelHeight],
          iconAnchor: [textWidth / 2, labelHeight + (isFavorite ? 10 : 5)] // Position above marker
        });

        return (
          <Marker
            key={`cluster-text-${index}`}
            position={clusterLabel.position}
            icon={icon}
            interactive={false}
            zIndexOffset={isFavorite ? 300 : 50}
          />
        );
      })}
    </>
  );
};



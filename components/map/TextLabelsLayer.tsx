import React, { useRef, useState } from 'react';
import { Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import type { Note, Coordinates } from '../../types';
import { DivIcon } from 'leaflet';
import { lngWrapOffsetsForBounds } from '../../utils/map/lngWorldWrap';

interface TextLabelsLayerProps {
  notes: Note[];
  showTextLabels: boolean;
  pinSize: number;
  labelSize: number;
  themeColor: string;
  clusteredMarkers?: Array<{ notes: Note[], position: [number, number] }>;
  selectedNoteId?: string | null;
  /** 普通地图模式多选：与 Board Shift 多选一致，用于同时展示多个 label */
  selectedNoteIds?: ReadonlySet<string> | null;
  preSelectedNotes?: Note[] | null;
  isPreviewMode?: boolean;
  onSelectNote?: (noteId: string) => void;
  onClearSelection?: () => void;
  // 当根据连线高亮一组点时，只显示这些点的 label
  connectionHighlightNoteIds?: string[] | null;
  /** hover 未聚合 pin 时显示该 pin 的 label（层级高于选中项） */
  hoveredNoteId?: string | null;
  // 拖拽过程中使用坐标覆盖（避免 label/连线与 pin 位置不一致）
  noteCoordOverrides?: Record<string, Coordinates>;
  /** 地图编辑模式：双击已展示的文字标签打开完整便签编辑器 */
  onLabelDoubleClickEdit?: (noteId: string) => void;
}

function getLabelText(rawText: string): string {
  if (!rawText) return '';
  // Label 规则：
  // - 取“第一段分隔符”之前的内容
  // - 默认分隔符为换行符 `\n` 和 `, `（逗号+空格）
  const separators = ['\n', ', '];

  // Find the earliest separator occurrence.
  let endIndex = rawText.length;
  for (const sep of separators) {
    const idx = rawText.indexOf(sep);
    if (idx !== -1) endIndex = Math.min(endIndex, idx);
  }

  const firstChunk = rawText.slice(0, endIndex).trim();
  if (!firstChunk) return '';

  // Remove markdown heading prefix like "### " if present.
  const withoutHeading = firstChunk.replace(/^#{1,6}\s+/, '').trim();
  return withoutHeading;
}

function getTimeText(note: Note): string {
  if (note.startYear == null) return '';
  if (note.endYear != null && note.endYear !== note.startYear) {
    return `${note.startYear}–${note.endYear}`;
  }
  return String(note.startYear);
}

function isNoteShownAsSelectedLabel(
  isPreviewMode: boolean,
  noteId: string,
  selectedNoteId: string | null | undefined,
  selectedNoteIds: ReadonlySet<string> | null | undefined
): boolean {
  if (isPreviewMode) return selectedNoteId === noteId;
  if (selectedNoteIds && selectedNoteIds.size > 0) return selectedNoteIds.has(noteId);
  return selectedNoteId === noteId;
}

/** Leaflet 同层按 zIndexOffset 排序；hover 必须高于选中，以免被压住 */
function textLabelZIndexOffset(
  hoveredNoteId: string | null | undefined,
  selectedNoteId: string | null | undefined,
  selectedNoteIds: ReadonlySet<string> | null | undefined,
  noteId: string,
  isFavorite: boolean
): number {
  if (hoveredNoteId && hoveredNoteId === noteId) return 8000;
  if (selectedNoteIds && selectedNoteIds.size > 0 && selectedNoteIds.has(noteId)) return 5000;
  if (selectedNoteId && selectedNoteId === noteId) return 5000;
  return isFavorite ? 300 : 50;
}

export const TextLabelsLayer: React.FC<TextLabelsLayerProps> = ({
  notes,
  showTextLabels,
  pinSize,
  labelSize,
  themeColor,
  clusteredMarkers = [],
  selectedNoteId,
  selectedNoteIds = null,
  preSelectedNotes,
  isPreviewMode = false,
  onSelectNote,
  onClearSelection,
  connectionHighlightNoteIds,
  hoveredNoteId,
  noteCoordOverrides = {},
  onLabelDoubleClickEdit
}) => {
  const map = useMap();
  const [, bump] = useState(0);
  const rafRef = useRef<number | null>(null);
  useMapEvents({
    zoomend: () => bump((n) => n + 1),
    moveend: () => bump((n) => n + 1),
    move: () => {
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        bump((n) => n + 1);
      });
    }
  });

  // 如果当前是“连线高亮模式”，忽略全局 showTextLabels 开关，只根据给定的 ID 集合渲染 label
  const isConnectionHighlightMode =
    Array.isArray(connectionHighlightNoteIds) && connectionHighlightNoteIds.length > 0;

  const hasMultiOrSingleSelection =
    !!selectedNoteId || (selectedNoteIds != null && selectedNoteIds.size > 0);

  if (
    !isConnectionHighlightMode &&
    !showTextLabels &&
    !preSelectedNotes &&
    !isPreviewMode &&
    !hasMultiOrSingleSelection &&
    !hoveredNoteId
  ) {
    return null;
  }

  // 预览模式下，如果没有任何选择、没有 hover、也没有连线高亮，并且 label 模式关闭，就不显示
  if (
    !isConnectionHighlightMode &&
    isPreviewMode &&
    !hasMultiOrSingleSelection &&
    !hoveredNoteId &&
    !preSelectedNotes &&
    !showTextLabels
  ) {
    return null;
  }

  // Get IDs of notes that are actually rendered as individual markers (not clustered)
  const visibleIndividualNoteIds = new Set<string>();
  const clusterLabels: Array<{
    position: [number, number];
    text: string;
    timeText: string;
    isFavorite: boolean;
  }> = [];

  clusteredMarkers.forEach(cluster => {
    if (cluster.notes.length === 1) {
      visibleIndividualNoteIds.add(cluster.notes[0].id);
    } else if (cluster.notes.length > 1) {
      // For clusters, find the first note with title/text to represent the cluster（标题规则参考 TableView/tab 模式）
      const representativeNote = cluster.notes.find(
        note => note.variant === 'standard' && (getLabelText(note.text || '') || note.text?.trim())
      );
      if (representativeNote) {
        let text =
          getLabelText(representativeNote.text || '') ||
          representativeNote.emoji ||
          (representativeNote.variant === 'image' ? '照片' : '点位');
        const timeText = getTimeText(representativeNote);

        clusterLabels.push({
          position: cluster.position,
          text: text,
          timeText,
          isFavorite: representativeNote.isFavorite === true
        });
      }
    }
  });

  // 如果处于连线高亮模式：只渲染给定 ID 集合对应点位的 label，且不显示 cluster labels 等其他元素
  if (isConnectionHighlightMode) {
    const idSet = new Set(connectionHighlightNoteIds);
    const bb = map.getBounds();
    const west = bb.getWest();
    const east = bb.getEast();

    return (
      <>
        {notes
          .filter(note => idSet.has(note.id))
          .flatMap(note => {
            const text = getLabelText(note.text || '');
            if (!text) return [];
            const timeText = getTimeText(note);

            const isFavorite = note.isFavorite === true;
            const override = noteCoordOverrides[note.id];
            const lat = override?.lat ?? note.coords.lat;
            const lng = override?.lng ?? note.coords.lng;
            const scale = isFavorite ? 1.5 : 1;
            const fontSize = 10 * labelSize * scale;
            const paddingY = 2 * scale;
            const paddingX = paddingY;
            const timeFontSize = Math.max(8, Math.floor(fontSize * 0.75));
            const labelHeight = paddingY * 2 + fontSize + timeFontSize + 6;
            const isSelected = isNoteShownAsSelectedLabel(
              isPreviewMode,
              note.id,
              selectedNoteId,
              selectedNoteIds
            );
            const allowLabelPointer = !isPreviewMode && isSelected;
            const zOff = textLabelZIndexOffset(
              hoveredNoteId,
              selectedNoteId,
              selectedNoteIds,
              note.id,
              isFavorite
            );

            const ks = lngWrapOffsetsForBounds(lng, west, east);
            const ksSafe = ks.length ? ks : [0];
            return ksSafe.map((k) => {
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
                  overflow: hidden;
                  text-overflow: ellipsis;
                  border: ${isFavorite ? 2 : 1.5}px solid ${themeColor};
                  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                  display: inline-flex;
                  align-items: flex-start;
                  pointer-events: ${allowLabelPointer ? 'auto' : 'none'};
                  width: fit-content;
                ">
                  <div style="display:flex; flex-direction:column; gap:2px;">
                    <span style="
                      flex: 0 1 auto;
                      min-width: 0;
                      overflow: hidden;
                      text-overflow: ellipsis;
                      white-space: nowrap;
                    ">
                      ${text}
                    </span>
                    ${
                      timeText
                        ? `<span style="font-size: ${timeFontSize}px; font-weight: 500; color: ${isFavorite ? themeColor : '#6b7280'}; white-space: nowrap; overflow:hidden; text-overflow: ellipsis;">${timeText}</span>`
                        : ''
                    }
                  </div>
                </div>
            `,
                className: 'custom-text-label',
                iconSize: [0, labelHeight],
                iconAnchor: [0, labelHeight + (isFavorite ? 10 : 5)]
              });

              return (
                <Marker
                  key={`connection-text-${note.id}-w${k}`}
                  position={[lat, lng + 360 * k]}
                  icon={icon}
                  interactive={true}
                  zIndexOffset={zOff}
                  eventHandlers={{
                    mousedown: (e) => {
                      e.originalEvent?.stopPropagation();
                      e.originalEvent?.stopImmediatePropagation();
                    },
                    dblclick: (e) => {
                      e.originalEvent?.stopPropagation();
                      e.originalEvent?.stopImmediatePropagation();
                      if (!isSelected || !onLabelDoubleClickEdit) return;
                      onLabelDoubleClickEdit(note.id);
                    }
                  }}
                />
              );
            });
          })}
      </>
    );
  }

  return (
    <>
      {/* Pre-selected cluster labels (stacked vertically).
          在普通地图模式和预览模式下都可复用，用于“展开簇内 labels，点击 label 选择 note”。 */}
      {preSelectedNotes && preSelectedNotes.length > 0 && (() => {
        const pos = preSelectedNotes[0].coords;
        const fontSize = 10 * labelSize;
        const timeFontSize = Math.max(8, Math.floor(fontSize * 0.75));
        const itemHeight = fontSize + timeFontSize + 16;
        const totalHeight = preSelectedNotes.length * itemHeight;
        const bPre = map.getBounds();
        const ksPre = lngWrapOffsetsForBounds(pos.lng, bPre.getWest(), bPre.getEast());
        const ksPreSafe = ksPre.length ? ksPre : [0];

        const makePreSelectedIcon = () =>
          new DivIcon({
            className: 'pre-selected-labels-container',
            html: `
                <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-start;">
                  ${preSelectedNotes.map((note, idx) => {
                    let text =
                      getLabelText(note.text || '') ||
                      note.emoji ||
                      (note.variant === 'image' ? '照片' : '点位');
                    const timeText = getTimeText(note);

                    const isFav = note.isFavorite === true;
                    const isSelected = isNoteShownAsSelectedLabel(
                      isPreviewMode,
                      note.id,
                      selectedNoteId,
                      selectedNoteIds
                    );
                    const rowZ =
                      !isPreviewMode && selectedNoteIds && selectedNoteIds.size > 0
                        ? selectedNoteIds.has(note.id)
                          ? 2
                          : 0
                        : selectedNoteId === note.id
                          ? 2
                          : 0;

                    return `
                      <div 
                        data-note-id="${note.id}"
                        class="pre-selected-label-item"
                        style="
                          position: relative;
                          z-index: ${rowZ};
                          background: white;
                          color: ${isFav ? themeColor : 'black'};
                          padding: 4px 4px;
                          border-radius: 4px;
                          display: flex;
                          align-items: flex-start;
                          justify-content: flex-start;
                          gap: 6px;
                          font-size: ${fontSize}px;
                          font-weight: ${isFav ? 'bold' : '500'};
                          white-space: nowrap;
                          overflow: hidden;
                          text-overflow: ellipsis;
                          border: 2px solid ${themeColor};
                          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                          cursor: pointer;
                          pointer-events: auto;
                          margin-bottom: 4px;
                        "
                      >
                        <div style="display:flex; flex-direction:column; gap:2px;">
                          <span
                            class="pre-selected-label-text"
                            style="
                              flex: 1;
                              min-width: 0;
                              overflow: hidden;
                              text-overflow: ellipsis;
                              white-space: nowrap;
                            "
                          >
                            ${text}
                          </span>
                          ${
                            timeText
                              ? `<span style="font-size: ${timeFontSize}px; font-weight: 500; color: ${isFav ? themeColor : '#6b7280'}; white-space: nowrap; overflow:hidden; text-overflow: ellipsis;">${timeText}</span>`
                              : ''
                          }
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              `,
            iconSize: [0, totalHeight],
            iconAnchor: [0, totalHeight / 2]
          });

        return (
          <>
            {ksPreSafe.map((k) => (
              <Marker
                key={`pre-selected-stack-w${k}`}
                position={[pos.lat, pos.lng + 360 * k]}
                interactive={true}
                zIndexOffset={1000}
                icon={makePreSelectedIcon()}
                eventHandlers={{
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
                  },
                  dblclick: (e) => {
                    e.originalEvent.stopPropagation();
                    e.originalEvent.stopImmediatePropagation();
                    if (!onLabelDoubleClickEdit) return;
                    const target = e.originalEvent.target as HTMLElement;
                    const noteId =
                      target.getAttribute('data-note-id') ||
                      target.closest('.pre-selected-label-item')?.getAttribute('data-note-id');
                    if (noteId) onLabelDoubleClickEdit(noteId);
                  }
                }}
              />
            ))}
          </>
        );
      })()}

      {/* Individual marker labels */}
      {(() => {
        const wb = map.getBounds();
        const west = wb.getWest();
        const east = wb.getEast();
        return notes
          .filter(note => {
            if (isPreviewMode) {
              if (preSelectedNotes) return false;
              if (selectedNoteId && note.id === selectedNoteId && note.text?.trim()) return true;
              if (hoveredNoteId && note.id === hoveredNoteId && note.text?.trim()) return true;
              return showTextLabels && note.variant === 'standard' && note.text?.trim() && visibleIndividualNoteIds.has(note.id);
            }
            if (preSelectedNotes) return false;
            const baseOk = note.variant === 'standard' && note.text?.trim();
            const isHovered = hoveredNoteId != null && note.id === hoveredNoteId;
            if (isHovered) return baseOk && visibleIndividualNoteIds.has(note.id);
            const isSelected = isNoteShownAsSelectedLabel(
              false,
              note.id,
              selectedNoteId,
              selectedNoteIds
            );
            if (isSelected) return baseOk;
            return showTextLabels && baseOk && visibleIndividualNoteIds.has(note.id);
          })
          .flatMap(note => {
            const text = getLabelText(note.text || '');
            const timeText = getTimeText(note);

            const isFavorite = note.isFavorite === true;
            const scale = isFavorite ? 1.5 : 1;
            const fontSize = 10 * labelSize * scale;
            const paddingY = 2 * scale;
            const paddingX = paddingY;
            const timeFontSize = Math.max(8, Math.floor(fontSize * 0.75));
            const labelHeight = paddingY * 2 + fontSize + timeFontSize + 6;
            const override = noteCoordOverrides[note.id];
            const lat = override?.lat ?? note.coords.lat;
            const lng = override?.lng ?? note.coords.lng;

            const isSelected = isNoteShownAsSelectedLabel(
              isPreviewMode,
              note.id,
              selectedNoteId,
              selectedNoteIds
            );
            const labelPointerInteractive = !isPreviewMode && isSelected;
            const zOff = textLabelZIndexOffset(
              hoveredNoteId,
              selectedNoteId,
              selectedNoteIds,
              note.id,
              isFavorite
            );

            const ks = lngWrapOffsetsForBounds(lng, west, east);
            const ksSafe = ks.length ? ks : [0];
            return ksSafe.map((k) => {
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
                  border: ${isFavorite ? 2 : 1.5}px solid ${themeColor};
                  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                  pointer-events: ${labelPointerInteractive ? 'auto' : 'none'};
                  display: flex;
                  align-items: flex-start;
                  justify-content: flex-start;
                  width: fit-content;
                ">
                  <div style="display:flex; flex-direction:column; gap:2px;">
                    <span style="
                      flex: 0 1 auto;
                      min-width: 0;
                      white-space: nowrap;
                      overflow: hidden;
                      text-overflow: ellipsis;
                    ">
                      ${text}
                    </span>
                    ${
                      timeText
                        ? `<span style="font-size: ${timeFontSize}px; font-weight: 500; color: ${isFavorite ? themeColor : '#6b7280'}; white-space: nowrap; overflow:hidden; text-overflow: ellipsis;">${timeText}</span>`
                        : ''
                    }
                  </div>
                </div>
            `,
                className: 'custom-text-label',
                iconSize: [0, labelHeight],
                iconAnchor: [0, labelHeight + (isFavorite ? 10 : 5)]
              });

              return (
                <Marker
                  key={`text-${note.id}-w${k}`}
                  position={[lat, lng + 360 * k]}
                  icon={icon}
                  interactive={true}
                  zIndexOffset={zOff}
                  eventHandlers={{
                    mousedown: (e) => {
                      e.originalEvent?.stopPropagation();
                      e.originalEvent?.stopImmediatePropagation();
                    },
                    dblclick: (e) => {
                      e.originalEvent?.stopPropagation();
                      e.originalEvent?.stopImmediatePropagation();
                      if (!isSelected || !onLabelDoubleClickEdit) return;
                      onLabelDoubleClickEdit(note.id);
                    }
                  }}
                />
              );
            });
          });
      })()}

      {/* Cluster labels */}
      {(
        // 非预览模式：只有在没有 preSelectedNotes 时才显示全局 cluster labels
        (!isPreviewMode && !preSelectedNotes && showTextLabels) ||
        // 预览/tab 模式：与导出页一致，仅开启「显示文字标签」时在 idle 下显示簇代表 label
        (isPreviewMode &&
          showTextLabels &&
          !selectedNoteId &&
          (!selectedNoteIds || selectedNoteIds.size === 0) &&
          !hoveredNoteId &&
          !preSelectedNotes)
      ) &&
        (() => {
          const wb = map.getBounds();
          const west = wb.getWest();
          const east = wb.getEast();
          return clusterLabels.flatMap((clusterLabel, index) => {
            const [lat, lng] = clusterLabel.position;
            const ks = lngWrapOffsetsForBounds(lng, west, east);
            const ksSafe = ks.length ? ks : [0];
            const text = clusterLabel.text;
            const timeText = clusterLabel.timeText;
            const isFavorite = clusterLabel.isFavorite;
            const scale = isFavorite ? 1.5 : 1;
            const fontSize = 10 * labelSize * scale;
            const paddingX = 8 * scale;
            const paddingY = 2 * scale;
            const timeFontSize = Math.max(8, Math.floor(fontSize * 0.75));
            const labelHeight = paddingY * 2 + fontSize + timeFontSize + 6;

            return ksSafe.map((k) => {
              const icon = new DivIcon({
                html: `
                <div style="
                  background: white;
                  color: ${isFavorite ? themeColor : 'black'};
                  padding: ${paddingY}px ${paddingX}px;
                  border-radius: 4px;
                  font-size: ${fontSize}px;
                  font-weight: ${isFavorite ? 'bold' : '500'};
                  border: ${isFavorite ? 2 : 1.5}px solid ${themeColor};
                  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                  pointer-events: none;
                  display: inline-block;
                  width: fit-content;
                ">
                  <div style="display:flex; flex-direction:column; gap:2px;">
                    <div style="white-space: nowrap; overflow:hidden; text-overflow: ellipsis;">${text}</div>
                    ${
                      timeText
                        ? `<div style="font-size: ${timeFontSize}px; font-weight: 500; color: ${isFavorite ? themeColor : '#6b7280'}; white-space: nowrap; overflow:hidden; text-overflow: ellipsis;">${timeText}</div>`
                        : ''
                    }
                  </div>
                </div>
          `,
                className: 'custom-text-label',
                iconSize: [0, labelHeight],
                iconAnchor: [0, labelHeight + (isFavorite ? 10 : 5)]
              });

              return (
                <Marker
                  key={`cluster-text-${index}-w${k}`}
                  position={[lat, lng + 360 * k]}
                  icon={icon}
                  interactive={false}
                  zIndexOffset={isFavorite ? 300 : 50}
                />
              );
            });
          });
        })()}
    </>
  );
};



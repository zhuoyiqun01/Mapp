import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import type { Note, Coordinates } from '../../types';
import { DivIcon } from 'leaflet';

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
  /** 非 tab 模式：点击“编辑”按钮打开编辑器 */
  onEditNote?: (noteId: string) => void;
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

/** 地图 label 选中后的编辑入口：仅铅笔图标（与 lucide Pencil 一致） */
function labelEditPencilButtonHtml(
  noteId: string,
  themeColor: string,
  labelFontSize: number,
  buttonClass: 'custom-text-label-edit-btn' | 'pre-selected-label-edit-btn'
): string {
  const iconPx = Math.max(12, Math.min(18, Math.round(labelFontSize)));
  return `<button
    data-note-id="${noteId}"
    class="${buttonClass}"
    type="button"
    title="编辑"
    aria-label="编辑"
    style="
      pointer-events: auto;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: ${themeColor};
      color: white;
      border: none;
      border-radius: 6px;
      padding: 4px;
      cursor: pointer;
      line-height: 0;
    "
  ><svg xmlns="http://www.w3.org/2000/svg" width="${iconPx}" height="${iconPx}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg></button>`;
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
  onEditNote
}) => {
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

    return (
      <>
        {notes
          .filter(note => idSet.has(note.id))
          .map(note => {
            const text = getLabelText(note.text || '');
            if (!text) return null;
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
            const showEditBtn = !isPreviewMode && isSelected && typeof onEditNote === 'function';
            const zOff = textLabelZIndexOffset(
              hoveredNoteId,
              selectedNoteId,
              selectedNoteIds,
              note.id,
              isFavorite
            );

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
                  gap: 6px;
                  pointer-events: auto;
                  width: fit-content;
                ">
                  <div style="display:flex; flex-direction:column; gap:2px; pointer-events:none;">
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
                  ${
                    showEditBtn
                      ? labelEditPencilButtonHtml(note.id, themeColor, fontSize, 'custom-text-label-edit-btn')
                      : ''
                  }
                </div>
            `,
              className: 'custom-text-label',
              // 不预估宽度：左侧对齐即可，避免按钮被推到右边缘
              iconSize: [0, labelHeight],
              // 左侧端点对齐：x 为 0，y 为 label 高度（加一点偏移让它落在 pin 上方）
              iconAnchor: [0, labelHeight + (isFavorite ? 10 : 5)]
            });

            return (
              <Marker
                key={`connection-text-${note.id}`}
                position={[lat, lng]}
                icon={icon}
                interactive={true}
                zIndexOffset={zOff}
                eventHandlers={{
                  mousedown: (e) => {
                    e.originalEvent?.stopPropagation();
                    e.originalEvent?.stopImmediatePropagation();
                    const target = e.originalEvent?.target as HTMLElement | null;
                    if (!target) return;
                    if (target.closest('.custom-text-label-edit-btn')) {
                      onEditNote?.(note.id);
                    }
                  }
                }}
              />
            );
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
        
        return (
          <Marker
            position={[pos.lat, pos.lng]}
            interactive={true}
            zIndexOffset={1000}
            icon={new DivIcon({
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

                    const editBtn =
                      !isPreviewMode && isSelected && typeof onEditNote === 'function'
                        ? labelEditPencilButtonHtml(note.id, themeColor, fontSize, 'pre-selected-label-edit-btn')
                        : '';

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
                        <div style="display:flex; flex-direction:column; gap:2px; pointer-events:none;">
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
                        ${editBtn}
                      </div>
                    `;
                  }).join('')}
                </div>
              `,
              iconSize: [0, totalHeight],
              iconAnchor: [0, totalHeight / 2]
            })}
            eventHandlers={{
              // 使用 mousedown 让单击立即触发，而不是依赖 Leaflet 对 click 的处理
              mousedown: (e) => {
                e.originalEvent.stopPropagation();
                e.originalEvent.stopImmediatePropagation();
                const target = e.originalEvent.target as HTMLElement;
                const noteId =
                  target.getAttribute('data-note-id') ||
                  target.closest('.pre-selected-label-edit-btn')?.getAttribute('data-note-id') ||
                  target.closest('.pre-selected-label-item')?.getAttribute('data-note-id');

                // Edit button click: open editor (non-tab)
                if (target.closest('.pre-selected-label-edit-btn')) {
                  if (noteId && onEditNote) {
                    onEditNote(noteId);
                  }
                  return;
                }

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
            if (selectedNoteId && note.id === selectedNoteId && note.text?.trim()) return true;
            if (hoveredNoteId && note.id === hoveredNoteId && note.text?.trim()) return true;
            return showTextLabels && note.variant === 'standard' && note.text?.trim() && visibleIndividualNoteIds.has(note.id);
          }
          // 普通地图模式下，如果当前有 preSelectedNotes（来自某个点/簇的展开），就隐藏全局 labels，只保留展开的那一组
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
        .map(note => {
          const text = getLabelText(note.text || '');
          const timeText = getTimeText(note);

          const isFavorite = note.isFavorite === true;
          const scale = isFavorite ? 1.5 : 1; // Slightly scale favorite labels, but not as much as pins to avoid clutter
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
          const showEditBtn = !isPreviewMode && isSelected && typeof onEditNote === 'function';
          const zOff = textLabelZIndexOffset(
            hoveredNoteId,
            selectedNoteId,
            selectedNoteIds,
            note.id,
            isFavorite
          );

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
                  pointer-events: ${showEditBtn ? 'auto' : 'none'};
                  display: flex;
                  align-items: flex-start;
                  justify-content: flex-start;
                  gap: 6px;
                  width: fit-content;
                ">
                  <div style="display:flex; flex-direction:column; gap:2px; pointer-events:none;">
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
                  ${
                    showEditBtn
                      ? labelEditPencilButtonHtml(note.id, themeColor, fontSize, 'custom-text-label-edit-btn')
                      : ''
                  }
                </div>
            `,
            className: 'custom-text-label',
            iconSize: [0, labelHeight],
            // 左侧端点对齐：marker 坐标为 label 左下角上方一点
            iconAnchor: [0, labelHeight + (isFavorite ? 10 : 5)] // Position above marker
          });

          return (
            <Marker
              key={`text-${note.id}`}
              position={[lat, lng]}
              icon={icon}
              // 保持可交互，避免 react-leaflet 在 interactive 条件切换时不绑定事件
              interactive={true}
              zIndexOffset={zOff}
              eventHandlers={{
                mousedown: (e) => {
                  // 只在点到 edit 按钮时打开编辑器
                  e.originalEvent?.stopPropagation();
                  e.originalEvent?.stopImmediatePropagation();
                  const target = e.originalEvent?.target as HTMLElement | null;
                  if (!target) return;
                  if (target.closest('.custom-text-label-edit-btn')) {
                    onEditNote?.(note.id);
                  }
                }
              }}
            />
          );
        })}

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
      ) && clusterLabels.map((clusterLabel, index) => {
        const text = clusterLabel.text;
        const timeText = clusterLabel.timeText;
        const isFavorite = clusterLabel.isFavorite;
        const scale = isFavorite ? 1.5 : 1; 
        const fontSize = 10 * labelSize * scale;
        const paddingX = 8 * scale;
        const paddingY = 2 * scale;
        const timeFontSize = Math.max(8, Math.floor(fontSize * 0.75));
        const labelHeight = paddingY * 2 + fontSize + timeFontSize + 6;

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
          iconAnchor: [0, labelHeight + (isFavorite ? 10 : 5)] // 左侧端点对齐
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



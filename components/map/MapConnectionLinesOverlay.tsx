import React, { useState } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { Note, Connection, Coordinates } from '../../types';

interface MapConnectionLinesOverlayProps {
  selectedNoteId: string | null;
  /** 多选时绘制所有与选中集合相连的边 */
  selectedNoteIds?: ReadonlySet<string> | null;
  connections: Connection[];
  notes: Note[];
  themeColor: string;
  noteCoordOverrides?: Record<string, Coordinates>;
  // 用于端点偏移与 label 字号
  pinSize?: number;
  labelSize?: number;
}

function mapPinSize(sliderValue: number): number {
  // 保持与 `NoteMarker` 一致：sliderValue -> marker 的缩放因子
  return (sliderValue - 0.5) * (1.2 - 0.2) / (2.0 - 0.5) + 0.2;
}

function arrowPolygonPoints(
  tipX: number,
  tipY: number,
  dirX: number,
  dirY: number,
  size: number
): string {
  // 在 SVG 坐标系下绘制一个“尖三角”箭头。
  // dirX/dirY 必须是单位向量，size 为大概的箭头尺寸（像素）。
  const tipBackDist = size * 0.9;
  const sideWidth = size * 0.45;

  const baseCx = tipX - dirX * tipBackDist;
  const baseCy = tipY - dirY * tipBackDist;

  const perpX = -dirY;
  const perpY = dirX;

  const leftX = baseCx + perpX * sideWidth;
  const leftY = baseCy + perpY * sideWidth;
  const rightX = baseCx - perpX * sideWidth;
  const rightY = baseCy - perpY * sideWidth;

  return `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`;
}

/**
 * 在屏幕坐标系下绘制连线，与地图一起缩放，避免 Polyline 在缩放时的抖动。
 * 覆盖在 map 之上，使用 map.latLngToContainerPoint 将经纬度转为容器像素坐标后画 SVG 线。
 */
export const MapConnectionLinesOverlay: React.FC<MapConnectionLinesOverlayProps> = ({
  selectedNoteId,
  selectedNoteIds = null,
  connections,
  notes,
  themeColor,
  noteCoordOverrides = {},
  pinSize = 1.0,
  labelSize = 1.0
}) => {
  const map = useMap();
  const [, setUpdate] = useState(0);

  useMapEvents({
    move: () => setUpdate(n => n + 1),
    zoom: () => setUpdate(n => n + 1)
  });

  if (!map) return null;

  const activeEndpoints = new Set<string>();
  if (selectedNoteIds && selectedNoteIds.size > 0) {
    selectedNoteIds.forEach((id) => activeEndpoints.add(id));
  } else if (selectedNoteId) {
    activeEndpoints.add(selectedNoteId);
  }
  if (activeEndpoints.size === 0) return null;

  const connectionVisuals = connections
    .filter(
      (conn) => activeEndpoints.has(conn.fromNoteId) || activeEndpoints.has(conn.toNoteId)
    )
    .map(conn => {
      const fromNote = notes.find(n => n.id === conn.fromNoteId);
      const toNote = notes.find(n => n.id === conn.toNoteId);
      if (!fromNote || !toNote) return null;

      const fromOverride = noteCoordOverrides[fromNote.id];
      const toOverride = noteCoordOverrides[toNote.id];

      const p1 = map.latLngToContainerPoint(
        L.latLng(
          fromOverride?.lat ?? fromNote.coords.lat,
          fromOverride?.lng ?? fromNote.coords.lng
        )
      );
      const p2 = map.latLngToContainerPoint(
        L.latLng(
          toOverride?.lat ?? toNote.coords.lat,
          toOverride?.lng ?? toNote.coords.lng
        )
      );

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);
      if (!Number.isFinite(len) || len <= 0.001) return null;

      const ux = dx / len;
      const uy = dy / len;

      // 用 marker 尺寸估算端点偏移，避免端点/文字压到 pin 上
      const mappedPinScale = mapPinSize(pinSize);
      const baseSize = 40;
      const fromScale = (fromNote.isFavorite ? 2 : 1) * mappedPinScale;
      const toScale = (toNote.isFavorite ? 2 : 1) * mappedPinScale;
      const fromMarkerSize = baseSize * fromScale;
      const toMarkerSize = baseSize * toScale;

      const maxOffset = Math.max(0, len / 2 - 1);
      const offsetFrom = Math.min(maxOffset, fromMarkerSize * 0.35 + 8);
      const offsetTo = Math.min(maxOffset, toMarkerSize * 0.35 + 8);

      const x1 = p1.x + ux * offsetFrom;
      const y1 = p1.y + uy * offsetFrom;
      const x2 = p2.x - ux * offsetTo;
      const y2 = p2.y - uy * offsetTo;

      // 端点箭头样式（优先使用 fromArrow/toArrow，新数据；没有时由旧的 arrow 推导）
      const derivedFromArrow: 'arrow' | 'none' =
        conn.fromArrow != null
          ? conn.fromArrow
          : conn.arrow === 'reverse'
            ? 'arrow'
            : 'none';
      const derivedToArrow: 'arrow' | 'none' =
        conn.toArrow != null
          ? conn.toArrow
          : conn.arrow === 'forward'
            ? 'arrow'
            : 'none';

      // label 在连线中点，并沿连线旋转；同时“更朝上”的那一侧偏移
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const px = -uy;
      const py = ux;

      const labelText = (conn.label ?? '').trim();
      const showLabel = labelText.length > 0;

      const perpOffset = 12 * labelSize; // 文本与连线的法向距离
      const candA = { lx: mx + px * perpOffset, ly: my + py * perpOffset }; // perp 的一侧
      const candB = { lx: mx - px * perpOffset, ly: my - py * perpOffset }; // 另一侧
      const prefer = candA.ly < candB.ly ? candA : candB; // y 小 -> 更靠上

      // 文字沿连线旋转，并尽量保持“正向可读”（极端情况朝右）
      let angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
      if (angle > 90) angle -= 180;
      if (angle < -90) angle += 180;

      const endpointRadius = Math.max(3, Math.min(6, (fromMarkerSize * 0.08 + toMarkerSize * 0.08) / 2));
      const arrowSize = Math.max(6, endpointRadius * 1.9);

      return {
        id: conn.id,
        x1, y1, x2, y2,
        mx, my,
        labelText,
        showLabel,
        labelX: prefer.lx,
        labelY: prefer.ly,
        labelAngle: angle,
        endpointRadius,
        ux,
        uy,
        derivedFromArrow,
        derivedToArrow,
        arrowSize
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  if (connectionVisuals.length === 0) return null;

  const size = map.getSize();
  if (!size || size.x <= 0 || size.y <= 0) return null;

  return (
    <div
      className="leaflet-connection-lines-overlay"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: size.x,
        height: size.y,
        pointerEvents: 'none',
        zIndex: 120
      }}
    >
      <svg
        width={size.x}
        height={size.y}
        style={{ display: 'block', overflow: 'visible' }}
      >
        {connectionVisuals.map(v => (
          <g key={v.id}>
            {/* 连线 */}
            <line
              x1={v.x1}
              y1={v.y1}
              x2={v.x2}
              y2={v.y2}
              stroke={themeColor}
              strokeWidth={2}
              strokeOpacity={0.9}
            />

            {/* 两端箭头（根据数据样式），不添加白色描边 */}
            {v.derivedToArrow === 'arrow' && (
              <polygon
                points={arrowPolygonPoints(v.x2, v.y2, v.ux, v.uy, v.arrowSize)}
                fill="none"
                stroke={themeColor}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.95}
              />
            )}
            {v.derivedFromArrow === 'arrow' && (
              <polygon
                points={arrowPolygonPoints(v.x1, v.y1, -v.ux, -v.uy, v.arrowSize)}
                fill="none"
                stroke={themeColor}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.95}
              />
            )}

            {/* 连线 label（空则隐藏），中点渲染并沿连线旋转 */}
            {v.showLabel && (
              <text
                x={v.labelX}
                y={v.labelY}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={themeColor}
                fontSize={12 * labelSize}
                fontWeight={700}
                style={{ pointerEvents: 'none', userSelect: 'none' }}
                transform={`rotate(${v.labelAngle} ${v.labelX} ${v.labelY})`}
                paintOrder="stroke"
                stroke="white"
                strokeWidth={4}
              >
                {v.labelText}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
};

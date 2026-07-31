import React, { useMemo, useState } from 'react';
import { Marker, Pane, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { Note, Connection, Coordinates } from '../../types';
import { pairLatLngsForShortMapChord } from '../../utils/map/lngWorldWrap';

interface MapConnectionLinesOverlayProps {
  selectedNoteId: string | null;
  /** 多选时绘制所有与选中集合相连的边 */
  selectedNoteIds?: ReadonlySet<string> | null;
  connections: Connection[];
  notes: Note[];
  themeColor: string;
  noteCoordOverrides?: Record<string, Coordinates>;
  pinSize?: number;
  labelSize?: number;
}

/** 低于 markerPane(600)/label，高于 overlayPane(400) */
const CONNECTION_PANE = 'map-connection-lines';
const CONNECTION_PANE_Z = 450;

function mapPinSize(sliderValue: number): number {
  return ((sliderValue - 0.5) * (1.2 - 0.2)) / (2.0 - 0.5) + 0.2;
}

function unitBearing(dx: number, dy: number): { ux: number; uy: number; len: number } {
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len <= 0.001) return { ux: 0, uy: 0, len: 0 };
  return { ux: dx / len, uy: dy / len, len };
}

function arrowIconHtml(themeColor: string, angleDeg: number, size: number): string {
  const s = Math.max(6, size);
  return `<div style="
    width:${s}px;height:${s}px;
    transform:rotate(${angleDeg}deg);
    transform-origin:50% 50%;
    display:flex;align-items:center;justify-content:center;
    pointer-events:none;
  ">
    <svg width="${s}" height="${s}" viewBox="0 0 12 12" overflow="visible">
      <polygon
        points="10,6 2,2.5 2,9.5"
        fill="none"
        stroke="${themeColor}"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
        opacity="0.95"
      />
    </svg>
  </div>`;
}

function edgeLabelIconHtml(text: string, themeColor: string, fontPx: number, angleDeg: number): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return `<div style="
    transform:translate(-50%,-50%) rotate(${angleDeg}deg);
    transform-origin:50% 50%;
    color:${themeColor};
    font-size:${fontPx}px;
    font-weight:700;
    white-space:nowrap;
    pointer-events:none;
    user-select:none;
    text-shadow:
      -1.5px -1.5px 0 #fff,
       1.5px -1.5px 0 #fff,
      -1.5px  1.5px 0 #fff,
       1.5px  1.5px 0 #fff;
  ">${escaped}</div>`;
}

type ConnVisual = {
  id: string;
  positions: [L.LatLng, L.LatLng];
  fromArrow?: { latlng: L.LatLng; angle: number; size: number };
  toArrow?: { latlng: L.LatLng; angle: number; size: number };
  label?: { latlng: L.LatLng; text: string; angle: number };
};

/**
 * 选中点相关连线：与 pin/label 一样走 Leaflet 图层 + zoomanim，
 * 避免屏幕 SVG 覆盖层在平滑缩放时相对节点晃动；pane 低于节点 label。
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
  /** 视图落定后递增，用于按当前缩放重算像素端点缩进 */
  const [viewEpoch, setViewEpoch] = useState(0);

  useMapEvents({
    zoomend: () => setViewEpoch((n) => n + 1),
    moveend: () => setViewEpoch((n) => n + 1),
    viewreset: () => setViewEpoch((n) => n + 1)
  });

  const noteById = useMemo(() => {
    const m = new Map<string, Note>();
    notes.forEach((n) => m.set(n.id, n));
    return m;
  }, [notes]);

  const activeEndpoints = useMemo(() => {
    const s = new Set<string>();
    if (selectedNoteIds && selectedNoteIds.size > 0) {
      selectedNoteIds.forEach((id) => s.add(id));
    } else if (selectedNoteId) {
      s.add(selectedNoteId);
    }
    return s;
  }, [selectedNoteId, selectedNoteIds]);

  const visuals = useMemo((): ConnVisual[] => {
    if (activeEndpoints.size === 0) return [];

    const mappedPinScale = mapPinSize(pinSize);
    const baseSize = 40;
    const out: ConnVisual[] = [];

    for (const conn of connections) {
      if (!activeEndpoints.has(conn.fromNoteId) && !activeEndpoints.has(conn.toNoteId)) continue;
      const fromNote = noteById.get(conn.fromNoteId);
      const toNote = noteById.get(conn.toNoteId);
      if (!fromNote || !toNote) continue;

      const fromOverride = noteCoordOverrides[fromNote.id];
      const toOverride = noteCoordOverrides[toNote.id];
      const lat1 = fromOverride?.lat ?? fromNote.coords.lat;
      const lng1 = fromOverride?.lng ?? fromNote.coords.lng;
      const lat2 = toOverride?.lat ?? toNote.coords.lat;
      const lng2 = toOverride?.lng ?? toNote.coords.lng;
      const { from: ll1, to: ll2 } = pairLatLngsForShortMapChord(lat1, lng1, lat2, lng2);

      const p1 = map.latLngToLayerPoint(ll1);
      const p2 = map.latLngToLayerPoint(ll2);
      const { ux, uy, len } = unitBearing(p2.x - p1.x, p2.y - p1.y);
      if (len <= 0) continue;

      const fromScale = (fromNote.isFavorite ? 2 : 1) * mappedPinScale;
      const toScale = (toNote.isFavorite ? 2 : 1) * mappedPinScale;
      const fromMarkerSize = baseSize * fromScale;
      const toMarkerSize = baseSize * toScale;
      const maxOffset = Math.max(0, len / 2 - 1);
      const offsetFrom = Math.min(maxOffset, fromMarkerSize * 0.35 + 8);
      const offsetTo = Math.min(maxOffset, toMarkerSize * 0.35 + 8);

      const startPt = L.point(p1.x + ux * offsetFrom, p1.y + uy * offsetFrom);
      const endPt = L.point(p2.x - ux * offsetTo, p2.y - uy * offsetTo);
      const startLl = map.layerPointToLatLng(startPt);
      const endLl = map.layerPointToLatLng(endPt);

      const derivedFromArrow: 'arrow' | 'none' =
        conn.fromArrow != null ? conn.fromArrow : conn.arrow === 'reverse' ? 'arrow' : 'none';
      const derivedToArrow: 'arrow' | 'none' =
        conn.toArrow != null ? conn.toArrow : conn.arrow === 'forward' ? 'arrow' : 'none';

      const endpointRadius = Math.max(
        3,
        Math.min(6, (fromMarkerSize * 0.08 + toMarkerSize * 0.08) / 2)
      );
      const arrowSize = Math.max(6, endpointRadius * 1.9);
      const toAngle = (Math.atan2(uy, ux) * 180) / Math.PI;
      const fromAngle = toAngle + 180;

      const labelText = (conn.label ?? '').trim();
      let label: ConnVisual['label'];
      if (labelText) {
        const mid = L.point((startPt.x + endPt.x) / 2, (startPt.y + endPt.y) / 2);
        const px = -uy;
        const py = ux;
        const perpOffset = 12 * labelSize;
        const candA = L.point(mid.x + px * perpOffset, mid.y + py * perpOffset);
        const candB = L.point(mid.x - px * perpOffset, mid.y - py * perpOffset);
        const prefer = candA.y < candB.y ? candA : candB;
        let angle = toAngle;
        if (angle > 90) angle -= 180;
        if (angle < -90) angle += 180;
        label = {
          latlng: map.layerPointToLatLng(prefer),
          text: labelText,
          angle
        };
      }

      out.push({
        id: conn.id,
        positions: [startLl, endLl],
        fromArrow:
          derivedFromArrow === 'arrow'
            ? { latlng: startLl, angle: fromAngle, size: arrowSize }
            : undefined,
        toArrow:
          derivedToArrow === 'arrow'
            ? { latlng: endLl, angle: toAngle, size: arrowSize }
            : undefined,
        label
      });
    }
    return out;
  }, [
    activeEndpoints,
    connections,
    noteById,
    noteCoordOverrides,
    pinSize,
    labelSize,
    map,
    viewEpoch
  ]);

  if (activeEndpoints.size === 0) {
    return <Pane name={CONNECTION_PANE} style={{ zIndex: CONNECTION_PANE_Z }} />;
  }

  const fontPx = 12 * labelSize;

  return (
    <Pane name={CONNECTION_PANE} style={{ zIndex: CONNECTION_PANE_Z }}>
      {visuals.map((v) => (
        <React.Fragment key={v.id}>
          <Polyline
            positions={v.positions}
            pathOptions={{
              color: themeColor,
              weight: 2,
              opacity: 0.9,
              lineCap: 'round',
              lineJoin: 'round',
              interactive: false
            }}
            pane={CONNECTION_PANE}
          />
          {v.toArrow ? (
            <Marker
              position={v.toArrow.latlng}
              interactive={false}
              pane={CONNECTION_PANE}
              zIndexOffset={0}
              icon={L.divIcon({
                className: 'map-connection-arrow',
                html: arrowIconHtml(themeColor, v.toArrow.angle, v.toArrow.size),
                iconSize: [v.toArrow.size, v.toArrow.size],
                iconAnchor: [v.toArrow.size / 2, v.toArrow.size / 2]
              })}
            />
          ) : null}
          {v.fromArrow ? (
            <Marker
              position={v.fromArrow.latlng}
              interactive={false}
              pane={CONNECTION_PANE}
              zIndexOffset={0}
              icon={L.divIcon({
                className: 'map-connection-arrow',
                html: arrowIconHtml(themeColor, v.fromArrow.angle, v.fromArrow.size),
                iconSize: [v.fromArrow.size, v.fromArrow.size],
                iconAnchor: [v.fromArrow.size / 2, v.fromArrow.size / 2]
              })}
            />
          ) : null}
          {v.label ? (
            <Marker
              position={v.label.latlng}
              interactive={false}
              pane={CONNECTION_PANE}
              zIndexOffset={1}
              icon={L.divIcon({
                className: 'map-connection-edge-label',
                html: edgeLabelIconHtml(v.label.text, themeColor, fontPx, v.label.angle),
                iconSize: [0, 0],
                iconAnchor: [0, 0]
              })}
            />
          ) : null}
        </React.Fragment>
      ))}
    </Pane>
  );
};

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import type { NormPoint } from '../../types';
import { prepareLassoPath } from '../../utils/media/pathSimplify';
import { normPointsToSvgPathD } from '../../utils/media/imageMaskRender';

type Props = {
  imageSrc: string;
  themeColor: string;
  onCancel: () => void;
  onConfirm: (points: NormPoint[]) => void | Promise<void>;
};

type ContentBox = { left: number; top: number; w: number; h: number };

/**
 * 套索贴纸：在图片上拖出闭合路径（屏幕坐标 → 归一化 0～1）。
 */
export const LassoStickerEditor: React.FC<Props> = ({
  imageSrc,
  themeColor,
  onCancel,
  onConfirm
}) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const [rawPoints, setRawPoints] = useState<NormPoint[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [contentBox, setContentBox] = useState<ContentBox | null>(null);

  const measure = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    const r = img.getBoundingClientRect();
    const natW = img.naturalWidth || r.width;
    const natH = img.naturalHeight || r.height;
    if (natW <= 0 || natH <= 0 || r.width <= 0 || r.height <= 0) return;
    const scale = Math.min(r.width / natW, r.height / natH);
    const w = natW * scale;
    const h = natH * scale;
    setContentBox({
      left: (r.width - w) / 2,
      top: (r.height - h) / 2,
      w,
      h
    });
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure, imageSrc]);

  const clientToNorm = useCallback((clientX: number, clientY: number): NormPoint | null => {
    const img = imgRef.current;
    if (!img) return null;
    const r = img.getBoundingClientRect();
    const natW = img.naturalWidth || r.width;
    const natH = img.naturalHeight || r.height;
    if (natW <= 0 || natH <= 0) return null;
    const scale = Math.min(r.width / natW, r.height / natH);
    const contentW = natW * scale;
    const contentH = natH * scale;
    const offsetX = (r.width - contentW) / 2;
    const offsetY = (r.height - contentH) / 2;
    const x = (clientX - r.left - offsetX) / contentW;
    const y = (clientY - r.top - offsetY) / contentH;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))];
  }, []);

  const appendPoint = useCallback(
    (clientX: number, clientY: number) => {
      const p = clientToNorm(clientX, clientY);
      if (!p) return;
      setRawPoints((prev) => {
        const last = prev[prev.length - 1];
        if (last && Math.hypot(last[0] - p[0], last[1] - p[1]) < 0.002) return prev;
        return [...prev, p];
      });
    },
    [clientToNorm]
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (busy) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrawing(true);
    setRawPoints([]);
    appendPoint(e.clientX, e.clientY);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing || busy) return;
    e.preventDefault();
    appendPoint(e.clientX, e.clientY);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drawing) return;
    e.preventDefault();
    setDrawing(false);
    appendPoint(e.clientX, e.clientY);
  };

  const previewPath = rawPoints.length >= 2 ? prepareLassoPath(rawPoints) : rawPoints;
  const svgD =
    contentBox && previewPath.length >= 2
      ? normPointsToSvgPathD(previewPath, contentBox.w, contentBox.h)
      : '';

  const handleConfirm = async () => {
    if (rawPoints.length < 8) return;
    setBusy(true);
    try {
      await onConfirm(rawPoints);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1100] flex flex-col bg-black/85 touch-none"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 text-white shrink-0">
        <div className="min-w-0">
          <div className="text-sm font-semibold">套索贴纸</div>
          <p className="text-[11px] text-white/60 mt-0.5">沿主体拖出一圈，松手后点完成</p>
        </div>
        <button
          type="button"
          className="rounded-lg p-2 text-white/80 hover:bg-white/10 border-0 cursor-pointer"
          onClick={onCancel}
          disabled={busy}
          aria-label="取消"
        >
          <X size={22} />
        </button>
      </div>

      <div className="relative flex-1 min-h-0 flex items-center justify-center px-4 pb-4">
        <div className="relative max-w-full max-h-full inline-block">
          <img
            ref={imgRef}
            src={imageSrc}
            alt="套索原图"
            className="max-w-full max-h-[min(70vh,720px)] object-contain select-none pointer-events-none"
            draggable={false}
            onLoad={measure}
          />
          <div
            className="absolute inset-0 cursor-crosshair"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {contentBox && svgD ? (
              <svg
                className="absolute pointer-events-none"
                style={{
                  left: contentBox.left,
                  top: contentBox.top,
                  width: contentBox.w,
                  height: contentBox.h
                }}
                viewBox={`0 0 ${contentBox.w} ${contentBox.h}`}
              >
                <path
                  d={svgD}
                  fill={`${themeColor}33`}
                  stroke={themeColor}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shrink-0">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-white/90 bg-white/10 hover:bg-white/15 border-0 cursor-pointer disabled:opacity-40"
          disabled={busy || rawPoints.length === 0}
          onClick={() => setRawPoints([])}
        >
          <RotateCcw size={16} />
          重画
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-theme-chrome-fg border-0 cursor-pointer disabled:opacity-40"
          style={{ backgroundColor: themeColor }}
          disabled={busy || rawPoints.length < 8}
          onClick={() => void handleConfirm()}
        >
          <Check size={16} />
          {busy ? '处理中…' : '完成'}
        </button>
      </div>
    </div>
  );
};

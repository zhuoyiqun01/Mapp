import { useLayoutEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

/** EPSG:3857 常用世界范围（与 Leaflet 文档一致） */
const WORLD_BOUNDS = L.latLngBounds(
  L.latLng(-85.05112878, -180),
  L.latLng(85.05112878, 180)
);

/**
 * 按当前地图容器尺寸设置 minZoom，使「缩到最小」时整球仍完整落在视口内
 *（通常表现为世界图垂直方向贴齐窗口高度，宽屏左右留白）。
 */
export function MapWorldMinZoom() {
  const map = useMap();

  useLayoutEffect(() => {
    const apply = () => {
      map.invalidateSize({ animate: false });
      const z = map.getBoundsZoom(WORLD_BOUNDS, false);
      if (typeof z === 'number' && Number.isFinite(z)) {
        map.setMinZoom(z);
      }
    };

    const runWhenSized = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(apply);
      });
    };

    map.whenReady(runWhenSized);
    map.on('resize', apply);
    window.addEventListener('resize', runWhenSized);

    return () => {
      map.off('resize', apply);
      window.removeEventListener('resize', runWhenSized);
    };
  }, [map]);

  return null;
}

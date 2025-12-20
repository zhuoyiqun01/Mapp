import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

interface MapCenterHandlerProps {
  center: [number, number];
  zoom: number;
}

export const MapCenterHandler: React.FC<MapCenterHandlerProps> = ({ center, zoom }) => {
  const map = useMap();
  const hasCenteredRef = useRef(false);

  useEffect(() => {
    // 只在首次初始化时执行一次
    if (hasCenteredRef.current || !map) return;

    // 等待地图完全初始化后再设置视图
    map.whenReady(() => {
      if (hasCenteredRef.current || !map) return;

      // 使用 invalidateSize 确保地图尺寸正确
      try {
        map.invalidateSize();
        // 使用 setTimeout 确保在下一个事件循环中执行，此时容器尺寸应该已经正确
        setTimeout(() => {
          if (!hasCenteredRef.current && map) {
            try {
              map.invalidateSize();
              // 重新设置视图以确保居中（仅首次）
              map.setView(center, zoom, { animate: false });
              hasCenteredRef.current = true;
            } catch (error) {
              console.warn('MapCenterHandler: Failed to set view:', error);
            }
          }
        }, 0);
      } catch (error) {
        console.warn('MapCenterHandler: Failed to invalidate size:', error);
      }
    });

    return () => {
      // 清理定时器以防组件卸载时仍在执行
      const timeouts = setTimeout(() => {}, 0);
      for (let i = 0; i <= timeouts; i++) {
        clearTimeout(i);
      }
    };
  }, []); // 空依赖数组，只在组件挂载时执行一次

  return null;
};


import { TAG_COLORS } from './constants';
import { Tag } from './types';
import { toJpeg } from 'html-to-image';

export const generateId = (): string => {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
};

export const getTagColor = (label: string): string => {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = label.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % TAG_COLORS.length;
  return TAG_COLORS[index];
};

export const createTag = (label: string): Tag => {
  return {
    id: generateId(),
    label,
    color: getTagColor(label)
  };
};

// Compress image from base64 string
export const compressImageFromBase64 = (base64: string, maxWidth: number = 1920, maxHeight: number = 1920, quality: number = 0.8): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Calculate new dimensions while maintaining aspect ratio
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = width * ratio;
        height = height * ratio;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      // Draw and compress
      ctx.drawImage(img, 0, 0, width, height);
      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(compressedDataUrl);
    };
    img.onerror = (error) => reject(error);
  });
};

// Compress image before converting to base64
export const compressImage = (file: File, maxWidth: number = 1920, maxHeight: number = 1920, quality: number = 0.8): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions while maintaining aspect ratio
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = width * ratio;
          height = height * ratio;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

// Base64 helper for file reading (with optional compression)
export const fileToBase64 = (file: File, compress: boolean = true): Promise<string> => {
  // Only compress image files
  if (compress && file.type.startsWith('image/')) {
    return compressImage(file);
  }
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

export const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

export const exportToJpeg = async (elementId: string, fileName: string) => {
  const node = document.getElementById(elementId);
  if (!node) {
    alert('Could not find view to export');
    return;
  }

  try {
    const dataUrl = await toJpeg(node, {
      quality: 0.95,
      width: 1920,
      height: 1080,
      canvasWidth: 1920,
      canvasHeight: 1080,
      backgroundColor: '#f9fafb', // gray-50
      style: {
        transform: 'none', // Reset transforms to capture full content if needed, though for fixed viewport this is tricky
        overflow: 'hidden'
      }
    });

    const link = document.createElement('a');
    link.download = `${fileName}.jpg`;
    link.href = dataUrl;
    link.click();
  } catch (error) {
    console.error('Export failed', error);
    alert('Failed to export image.');
  }
};

// 导出当前视图的中心对齐截图
export const exportToJpegCentered = async (elementId: string, fileName: string) => {
  const node = document.getElementById(elementId);
  if (!node) {
    alert('无法找到要导出的视图');
    return;
  }

  try {
    // 隐藏所有 UI 元素（使用 fixed 定位的按钮、滑块等）
    const uiElements = document.querySelectorAll('.fixed, [class*="z-["]');
    const originalDisplays: string[] = [];
    
    uiElements.forEach((el, index) => {
      const htmlEl = el as HTMLElement;
      originalDisplays[index] = htmlEl.style.display;
      // 只隐藏按钮、控件等，不隐藏整个容器
      if (htmlEl.tagName === 'BUTTON' || 
          htmlEl.className.includes('pointer-events-auto') ||
          htmlEl.className.includes('z-[500]') ||
          htmlEl.className.includes('z-50')) {
        htmlEl.style.display = 'none';
      }
    });
    
    // 等待一帧确保DOM更新
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // 导出整个视口
    const dataUrl = await toJpeg(node, {
      quality: 0.95,
      pixelRatio: 2,
      backgroundColor: '#f9fafb',
      width: viewportWidth,
      height: viewportHeight,
    });

    // 恢复 UI 元素
    uiElements.forEach((el, index) => {
      const htmlEl = el as HTMLElement;
      htmlEl.style.display = originalDisplays[index];
    });

    // 直接下载
    const link = document.createElement('a');
    link.download = `${fileName}.jpg`;
    link.href = dataUrl;
    link.click();
  } catch (error) {
    // 确保恢复 UI 元素
    const uiElements = document.querySelectorAll('.fixed, [class*="z-["]');
    uiElements.forEach(el => {
      const htmlEl = el as HTMLElement;
      htmlEl.style.display = '';
    });
    
    console.error('Export failed', error);
    alert('导出图片失败');
  }
};
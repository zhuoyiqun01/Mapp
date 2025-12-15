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

// Convert HEIC to JPEG/PNG if needed
const convertHeicIfNeeded = async (file: File): Promise<File> => {
  // Check if file is HEIC format
  const isHeic = file.type === 'image/heic' || 
                 file.type === 'image/heif' || 
                 file.name.toLowerCase().endsWith('.heic') ||
                 file.name.toLowerCase().endsWith('.heif');
  
  if (!isHeic) {
    return file;
  }
  
  // Dynamically import heic2any to avoid issues with ESM/CommonJS
  const heic2anyModule = await import('heic2any');
  // heic2any can be exported as default or named export
  const heic2anyFn = (heic2anyModule as any).default || heic2anyModule;
  
  // Try multiple conversion methods for better compatibility with iPhone 15 Pro HEIF
  const conversionMethods = [
    { toType: 'image/jpeg', quality: 0.9, extension: '.jpg', mimeType: 'image/jpeg' },
    { toType: 'image/jpeg', quality: 0.8, extension: '.jpg', mimeType: 'image/jpeg' },
    { toType: 'image/png', quality: undefined, extension: '.png', mimeType: 'image/png' }
  ];
  
  let lastError: any = null;
  
  for (const method of conversionMethods) {
    try {
      const options: any = {
        blob: file,
        toType: method.toType
      };
      if (method.quality !== undefined) {
        options.quality = method.quality;
      }
      
      const convertedBlob = await heic2anyFn(options);
      
      // heic2any returns an array, get the first item
      const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
      
      if (!blob) {
        throw new Error('Conversion returned empty result');
      }
      
      // Create a new File object from the converted blob
      const newFileName = file.name.replace(/\.(heic|heif)$/i, method.extension);
      return new File([blob], newFileName, {
        type: method.mimeType,
        lastModified: file.lastModified
      });
    } catch (error: any) {
      console.log(`HEIC conversion failed with ${method.toType} (quality: ${method.quality}):`, error);
      lastError = error;
      // Continue to next method
      continue;
    }
  }
  
  // All conversion methods failed
  console.error('All HEIC conversion methods failed. Last error:', lastError);
  const errorMessage = lastError?.message || 'Unknown error';
  
  // Check for specific error types
  if (errorMessage.includes('ERR_LIBHEIF') || errorMessage.includes('format not supported')) {
    const detailedError = `无法转换此 HEIC/HEIF 文件

可能原因：
• iPhone 15 Pro 等新设备使用了更新的 HEIF 格式
• 浏览器端转换库暂不支持此格式

解决方案（推荐按顺序尝试）：
1. 【最简单】在 iPhone 上更改设置：
   设置 > 相机 > 格式 > 选择"兼容性最佳"
   这样新照片会直接保存为 JPEG 格式

2. 使用 Mac 预览应用转换：
   打开图片 > 文件 > 导出 > 选择 JPEG 格式

3. 使用在线转换工具：
   • https://cloudconvert.com/heic-to-jpg
   • https://convertio.co/zh/heic-jpg/
   • https://heictojpeg.com/

4. 使用 App Store 中的转换应用

注意：这是浏览器端转换库的技术限制，不是应用的问题。`;
    throw new Error(detailedError);
  }
  
  throw new Error(`HEIC/HEIF 图片转换失败: ${errorMessage}\n\n请尝试将图片转换为 JPEG/PNG 格式后重试。`);
};

// Compress image before converting to base64
export const compressImage = (file: File, maxWidth: number = 1920, maxHeight: number = 1920, quality: number = 0.8): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    try {
      // Convert HEIC if needed
      const processedFile = await convertHeicIfNeeded(file);
      
      const reader = new FileReader();
      reader.readAsDataURL(processedFile);
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
    } catch (error) {
      reject(error);
    }
  });
};

// Base64 helper for file reading (with optional compression)
export const fileToBase64 = (file: File, compress: boolean = true): Promise<string> => {
  // Only compress image files
  if (compress && file.type.startsWith('image/')) {
    return compressImage(file);
  }
  
  // For non-image files or when compression is disabled, still check for HEIC
  return new Promise(async (resolve, reject) => {
    try {
      const processedFile = await convertHeicIfNeeded(file);
      const reader = new FileReader();
      reader.readAsDataURL(processedFile);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    } catch (error) {
      reject(error);
    }
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
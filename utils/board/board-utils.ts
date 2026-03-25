/**
 * Board-specific utility functions
 */

// Image compression utility for board operations with HEIC support
export const compressImageToBase64 = (
  file: File,
  targetShortSide = 512
): Promise<{ base64: string; width: number; height: number }> => {
  return new Promise(async (resolve, reject) => {
    try {
      // Check if file is HEIC format
      const isHeic = file.type === 'image/heic' ||
                     file.type === 'image/heif' ||
                     file.name.toLowerCase().endsWith('.heic') ||
                     file.name.toLowerCase().endsWith('.heif');

      let processedFile = file;

      if (isHeic) {
        try {
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
          let converted = false;

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
              processedFile = new File([blob], newFileName, {
                type: method.mimeType,
                lastModified: file.lastModified
              });
              converted = true;
              break;
            } catch (error: any) {
              console.log(`HEIC conversion failed with ${method.toType} (quality: ${method.quality}):`, error);
              lastError = error;
              // Continue to next method
              continue;
            }
          }

          if (!converted) {
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
              reject(new Error(detailedError));
              return;
            }

            reject(new Error(`HEIC/HEIF 图片转换失败: ${errorMessage}\n\n请尝试将图片转换为 JPEG/PNG 格式后重试。`));
            return;
          }
        } catch (error: any) {
          console.error('HEIC conversion failed:', error);
          const errorMessage = error?.message || 'Unknown error';
          reject(new Error(`HEIC/HEIF 图片转换失败: ${errorMessage}。请将图片转换为 JPEG/PNG 格式后重试。`));
          return;
        }
      }

      const img = new Image();
      img.onload = () => {
        const { width, height } = img;
        const scale = targetShortSide / Math.min(width, height);
        const newWidth = Math.round(width * scale);
        const newHeight = Math.round(height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = newWidth;
        canvas.height = newHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Cannot get canvas context'));
          return;
        }
        ctx.drawImage(img, 0, 0, newWidth, newHeight);
        const base64 = canvas.toDataURL('image/png');
        resolve({ base64, width: newWidth, height: newHeight });
      };
      img.onerror = reject;
      const reader = new FileReader();
      reader.onload = (ev) => {
        img.src = ev.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(processedFile);
    } catch (error) {
      reject(error);
    }
  });
};

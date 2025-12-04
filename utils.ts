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

// Base64 helper for file reading
export const fileToBase64 = (file: File): Promise<string> => {
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
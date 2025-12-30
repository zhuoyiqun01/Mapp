import { useCallback } from 'react';
import { Note } from '../types';

interface UseImageFingerprintReturn {
  // Image fingerprint: GPS coordinates + 3 sampled pixels (top-left, bottom-left, bottom-right)
  // Format: lat_lng_topLeftPixel_bottomLeftPixel_bottomRightPixel
  calculateImageFingerprint: (file: File, imageUrl: string, lat: number | null, lng: number | null) => Promise<string>;

  // Fingerprint from base64 image (extract GPS from note if available)
  calculateFingerprintFromBase64: (base64Image: string, note?: Note) => Promise<string>;

  // Read existing images (may be stored image IDs) for fingerprint comparison
  getImageDataForFingerprint: (imageRef: string) => Promise<string | null>;
}

export const useImageFingerprint = (): UseImageFingerprintReturn => {
  // Image fingerprint: GPS coordinates + 3 sampled pixels (top-left, bottom-left, bottom-right)
  // Format: lat_lng_topLeftPixel_bottomLeftPixel_bottomRightPixel
  const calculateImageFingerprint = useCallback(async (
    file: File,
    imageUrl: string,
    lat: number | null,
    lng: number | null
  ): Promise<string> => {
    try {
      const img = new Image();
      img.src = imageUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const width = img.naturalWidth;
      const height = img.naturalHeight;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return lat !== null && lng !== null ? `${lat.toFixed(6)}_${lng.toFixed(6)}` : 'no_gps';
      }

      ctx.drawImage(img, 0, 0, width, height);

      const topLeftData = ctx.getImageData(0, 0, 1, 1).data;
      const topLeft = topLeftData.length >= 3 ? `${topLeftData[0]},${topLeftData[1]},${topLeftData[2]}` : '0,0,0';

      const bottomLeftData = ctx.getImageData(0, height - 1, 1, 1).data;
      const bottomLeft = bottomLeftData.length >= 3 ? `${bottomLeftData[0]},${bottomLeftData[1]},${bottomLeftData[2]}` : '0,0,0';

      const bottomRightData = ctx.getImageData(width - 1, height - 1, 1, 1).data;
      const bottomRight = bottomRightData.length >= 3 ? `${bottomRightData[0]},${bottomRightData[1]},${bottomRightData[2]}` : '0,0,0';

      const gpsPart = lat !== null && lng !== null ? `${lat.toFixed(6)}_${lng.toFixed(6)}` : 'no_gps';
      return `${gpsPart}_${topLeft}_${bottomLeft}_${bottomRight}`;
    } catch (error) {
      console.error('Error calculating image fingerprint:', error);
      return lat !== null && lng !== null ? `${lat.toFixed(6)}_${lng.toFixed(6)}` : 'unknown';
    }
  }, []);

  // Fingerprint from base64 image (extract GPS from note if available)
  const calculateFingerprintFromBase64 = useCallback(async (
    base64Image: string,
    note?: Note
  ): Promise<string> => {
    try {
      const lat = note?.coords?.lat ?? null;
      const lng = note?.coords?.lng ?? null;

      const img = new Image();
      img.src = base64Image;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const width = img.naturalWidth;
      const height = img.naturalHeight;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return lat !== null && lng !== null ? `${lat.toFixed(6)}_${lng.toFixed(6)}` : 'no_gps';
      }

      ctx.drawImage(img, 0, 0, width, height);

      const topLeftData = ctx.getImageData(0, 0, 1, 1).data;
      const topLeft = topLeftData.length >= 3 ? `${topLeftData[0]},${topLeftData[1]},${topLeftData[2]}` : '0,0,0';

      const bottomLeftData = ctx.getImageData(0, height - 1, 1, 1).data;
      const bottomLeft = bottomLeftData.length >= 3 ? `${bottomLeftData[0]},${bottomLeftData[1]},${bottomLeftData[2]}` : '0,0,0';

      const bottomRightData = ctx.getImageData(width - 1, height - 1, 1, 1).data;
      const bottomRight = bottomRightData.length >= 3 ? `${bottomRightData[0]},${bottomRightData[1]},${bottomRightData[2]}` : '0,0,0';

      const gpsPart = lat !== null && lng !== null ? `${lat.toFixed(6)}_${lng.toFixed(6)}` : 'no_gps';
      return `${gpsPart}_${topLeft}_${bottomLeft}_${bottomRight}`;
    } catch (error) {
      console.error('Error calculating image fingerprint from base64:', error);
      return note?.coords?.lat !== undefined && note?.coords?.lng !== undefined
        ? `${note.coords.lat.toFixed(6)}_${note.coords.lng.toFixed(6)}`
        : 'unknown';
    }
  }, []);

  // Read existing images (may be stored image IDs) for fingerprint comparison
  const getImageDataForFingerprint = useCallback(async (imageRef: string): Promise<string | null> => {
    if (!imageRef) return null;

    try {
      // If it's a base64 image, return it directly
      if (imageRef.startsWith('data:image/')) {
        return imageRef;
      }

      // If it's an image ID, load from storage
      if (imageRef.startsWith('img-')) {
        const imageData = await import('../utils/storage').then(module => module.loadImage(imageRef));
        return imageData || null;
      }

      return null;
    } catch (error) {
      console.error('Error loading image for fingerprint:', error);
      return null;
    }
  }, []);

  return {
    calculateImageFingerprint,
    calculateFingerprintFromBase64,
    getImageDataForFingerprint
  };
};

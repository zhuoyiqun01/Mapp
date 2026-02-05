/**
 * Image processing utilities - fingerprint calculation, pixel sampling, etc.
 */

import type { Note } from '../types';

/**
 * Image fingerprint: GPS coordinates + 3 sampled pixels (top-left, bottom-left, bottom-right)
 * Format: lat_lng_topLeftPixel_bottomLeftPixel_bottomRightPixel
 */
export async function calculateImageFingerprint(
  file: File,
  imageUrl: string,
  lat: number | null,
  lng: number | null
): Promise<string> {
  try {
    const img = new Image();
    img.src = imageUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
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

    const topLeft = samplePixel(ctx, 0, 0);
    const bottomLeft = samplePixel(ctx, 0, height - 1);
    const bottomRight = samplePixel(ctx, width - 1, height - 1);

    const gpsPart = lat !== null && lng !== null
      ? `${lat.toFixed(6)}_${lng.toFixed(6)}`
      : 'no_gps';
    return `${gpsPart}_${topLeft}_${bottomLeft}_${bottomRight}`;
  } catch (error) {
    console.error('Error calculating image fingerprint:', error);
    return lat !== null && lng !== null ? `${lat.toFixed(6)}_${lng.toFixed(6)}` : 'unknown';
  }
}

/**
 * Fingerprint from base64 image (extract GPS from note if available)
 */
export async function calculateFingerprintFromBase64(
  base64Image: string,
  note?: Note
): Promise<string> {
  try {
    const lat = note?.coords?.lat ?? null;
    const lng = note?.coords?.lng ?? null;

    const img = new Image();
    img.src = base64Image;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
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

    const topLeft = samplePixel(ctx, 0, 0);
    const bottomLeft = samplePixel(ctx, 0, height - 1);
    const bottomRight = samplePixel(ctx, width - 1, height - 1);

    const gpsPart = lat !== null && lng !== null
      ? `${lat.toFixed(6)}_${lng.toFixed(6)}`
      : 'no_gps';
    return `${gpsPart}_${topLeft}_${bottomLeft}_${bottomRight}`;
  } catch (error) {
    console.error('Error calculating fingerprint from base64:', error);
    const lat = note?.coords?.lat ?? null;
    const lng = note?.coords?.lng ?? null;
    return lat !== null && lng !== null ? `${lat.toFixed(6)}_${lng.toFixed(6)}` : 'unknown';
  }
}

function samplePixel(ctx: CanvasRenderingContext2D, x: number, y: number): string {
  const data = ctx.getImageData(x, y, 1, 1).data;
  return data.length >= 3
    ? `${data[0]},${data[1]},${data[2]}`
    : '0,0,0';
}

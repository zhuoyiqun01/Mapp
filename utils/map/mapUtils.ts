/**
 * Map view utility functions - pure helpers with no React/component dependencies.
 */

/** Convert hex color to "r, g, b" string for CSS rgba() */
export function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);
    return `${r}, ${g}, ${b}`;
  }
  return '255, 255, 255'; // fallback to white
}

/** Check if photo was taken recently (within last 30 minutes) based on EXIF data */
export function isPhotoTakenRecently(exifData: any): boolean {
  if (!exifData) return false;

  const dateFields = ['DateTimeOriginal', 'DateTime', 'CreateDate', 'ModifyDate'];
  let photoDate: Date | null = null;

  for (const field of dateFields) {
    if (exifData[field]) {
      try {
        const dateStr = exifData[field].toString();
        if (dateStr.includes(':')) {
          const isoDate = dateStr.replace(/^(\d{4}):(\d{2}):(\d{2}) /, '$1-$2-$3 ');
          photoDate = new Date(isoDate);
        } else {
          photoDate = new Date(dateStr);
        }

        if (!isNaN(photoDate.getTime())) {
          break;
        }
      } catch {
        continue;
      }
    }
  }

  if (!photoDate || isNaN(photoDate.getTime())) {
    return true; // Conservative: assume recent if we can't determine
  }

  const now = Date.now();
  const photoTime = photoDate.getTime();
  const thirtyMinutesInMs = 30 * 60 * 1000;

  return (now - photoTime) <= thirtyMinutesInMs;
}

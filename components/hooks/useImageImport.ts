import { useState, useRef, useCallback } from 'react';
import { Note } from '../types';
import { getCurrentBrowserLocation } from './useGeolocation';
import { loadImage } from '../utils/storage';

export interface ImportPreview {
  file: File;
  imageUrl: string;
  lat: number | null;
  lng: number | null;
  error?: string;
  isDuplicate?: boolean;
  imageFingerprint?: string;
}

interface UseImageImportProps {
  project: any;
  notes: Note[];
  onAddNote: (note: Note) => void;
  onUpdateProject: (project: Partial<any>) => void;
  onImportDialogChange?: (isOpen: boolean) => void;
  mapInstance: any;
}

// Helper function to convert file to base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// Helper function to get image data for fingerprint calculation
const getImageDataForFingerprint = async (imageId: string): Promise<string | null> => {
  try {
    // Use the storage utility function instead of direct IndexedDB access
    return await loadImage(imageId);
  } catch (error) {
    console.warn('Failed to get image data for fingerprint:', error);
    return null;
  }
};

// Calculate image fingerprint from file
const calculateImageFingerprint = async (
  file: File,
  imageUrl: string,
  lat: number | null,
  lng: number | null
): Promise<string> => {
  try {
    // Load image
    const img = new Image();
    img.src = imageUrl;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context not available');

    // Resize to small size for fingerprinting (keep aspect ratio)
    const maxSize = 64;
    const ratio = Math.min(maxSize / img.width, maxSize / img.height);
    const width = Math.floor(img.width * ratio);
    const height = Math.floor(img.height * ratio);

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0, width, height);

    // Sample 3 pixels: top-left, bottom-left, bottom-right
    const topLeft = ctx.getImageData(0, 0, 1, 1).data;
    const bottomLeft = ctx.getImageData(0, height - 1, 1, 1).data;
    const bottomRight = ctx.getImageData(width - 1, height - 1, 1, 1).data;

    // Create fingerprint: lat_lng_topLeftPixel_bottomLeftPixel_bottomRightPixel
    const latStr = lat !== null ? lat.toFixed(6) : '0';
    const lngStr = lng !== null ? lng.toFixed(6) : '0';
    const fingerprint = `${latStr}_${lngStr}_${topLeft[0]}${topLeft[1]}${topLeft[2]}_${bottomLeft[0]}${bottomLeft[1]}${bottomLeft[2]}_${bottomRight[0]}${bottomRight[1]}${bottomRight[2]}`;

    return fingerprint;
  } catch (error) {
    console.error('Error calculating image fingerprint:', error);
    // Fallback: use file size and name hash
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(file.name + file.size));
    const hashArray = Array.from(new Uint8Array(hash));
    return `fallback_${hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('')}`;
  }
};

// Calculate fingerprint from base64 image data
const calculateFingerprintFromBase64 = async (base64Image: string, note?: Note): Promise<string> => {
  try {
    // Extract GPS from note if available
    const lat = note?.coords?.lat ?? null;
    const lng = note?.coords?.lng ?? null;

    // Load image from base64
    const img = new Image();
    img.src = base64Image;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context not available');

    // Resize to small size for fingerprinting
    const maxSize = 64;
    const ratio = Math.min(maxSize / img.width, maxSize / img.height);
    const width = Math.floor(img.width * ratio);
    const height = Math.floor(img.height * ratio);

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0, width, height);

    // Sample same 3 pixels
    const topLeft = ctx.getImageData(0, 0, 1, 1).data;
    const bottomLeft = ctx.getImageData(0, height - 1, 1, 1).data;
    const bottomRight = ctx.getImageData(width - 1, height - 1, 1, 1).data;

    const latStr = lat !== null ? lat.toFixed(6) : '0';
    const lngStr = lng !== null ? lng.toFixed(6) : '0';
    const fingerprint = `${latStr}_${lngStr}_${topLeft[0]}${topLeft[1]}${topLeft[2]}_${bottomLeft[0]}${bottomLeft[1]}${bottomLeft[2]}_${bottomRight[0]}${bottomRight[1]}${bottomRight[2]}`;

    return fingerprint;
  } catch (error) {
    console.error('Error calculating fingerprint from base64:', error);
    return 'error_fingerprint';
  }
};

export const useImageImport = ({
  project,
  notes,
  onAddNote,
  onUpdateProject,
  onImportDialogChange,
  mapInstance
}: UseImageImportProps) => {
  const [importPreview, setImportPreview] = useState<ImportPreview[]>([]);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dataImportInputRef = useRef<HTMLInputElement>(null);

  // Handle image import
  const handleImageImport = useCallback(async (files: FileList | null, showLimitMessage = false) => {
    if (!files || files.length === 0) return;

    // Filter to include HEIC files
    const imageFiles = Array.from(files).filter((file: File) =>
      file.type.startsWith('image/') ||
      file.name.toLowerCase().endsWith('.heic') ||
      file.name.toLowerCase().endsWith('.heif')
    );

    const fileArray = imageFiles; // No limit on number of images
    const previews: ImportPreview[] = [];

    // 缓存已加载的图片数据，避免重复从 IndexedDB 读取
    const fingerprintCache = new Map<string, string>();

    for (const file of fileArray) {
      try {
        // IMPORTANT: Read EXIF data from original file FIRST (before any processing)
        let exifDataFromOriginal = null;
        let lat = null;
        let lng = null;

        // Try to read EXIF from original file first (before HEIC conversion)
        try {
          const exifr = (await import('exifr')).default;

          // Core EXIF reading with full compatibility
          const output = await exifr.parse(file, {
            tiff: true,
            exif: true,
            gps: true,        // Parse standard GPS
            xmp: true,        // Critical: Support Android devices that store GPS in XMP
            translateValues: true, // Critical: Auto convert DMS arrays and handle N/S/E/W refs
            mergeOutput: true,    // Flatten all results to single object
            reviveValues: true
          });

          // Extract GPS coordinates - prioritize library-calculated standard values
          if (output) {
            // Primary: Use library-calculated standard latitude/longitude (most compatible)
            if (typeof output.latitude === 'number' && typeof output.longitude === 'number') {
              lat = output.latitude;
              lng = output.longitude;
            }
            // Fallback: Raw GPS values (rarely needed if translateValues: true works)
            else if (output.GPSLatitude && output.GPSLongitude) {
              // translateValues should have handled the conversion, but defensive check
              if (typeof output.GPSLatitude === 'number' && typeof output.GPSLongitude === 'number') {
                lat = output.GPSLatitude;
                lng = output.GPSLongitude;
              }
            }

            // Validate coordinates (keep 0,0 check for error data filtering)
            if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
              console.log('GPS found in original file:', file.name, { lat, lng, source: 'exif' });
            }
          }
        } catch (originalExifError) {
          console.warn('Failed to read EXIF from original file (possibly HEIC structure issue):', originalExifError);
        }

        // Convert HEIC to JPEG if needed before processing
        let processedFile = file;
        const isHeic = file.type === 'image/heic' ||
                       file.type === 'image/heif' ||
                       file.name.toLowerCase().endsWith('.heic') ||
                       file.name.toLowerCase().endsWith('.heif');

        if (isHeic) {
          try {
            // Try multiple conversion methods for better compatibility
            const conversionMethods = [
              { toType: 'image/jpeg', quality: 0.9, extension: '.jpg', mimeType: 'image/jpeg' },
              { toType: 'image/jpeg', quality: 0.8, extension: '.jpg', mimeType: 'image/jpeg' },
              { toType: 'image/png', quality: 1.0, extension: '.png', mimeType: 'image/png' }
            ];

            let convertedBlob: Blob | null = null;
            let lastError: any = null;

            for (const method of conversionMethods) {
              try {
                const heic2anyModule = await import('heic2any');
                const heic2anyFn = (heic2anyModule as any).default || heic2anyModule;

                convertedBlob = await heic2anyFn({
                  blob: file,
                  toType: method.toType,
                  quality: method.quality
                }) as Blob;

                // Verify the conversion worked
                if (convertedBlob && convertedBlob.size > 0) {
                  processedFile = new File([convertedBlob], file.name.replace(/\.(heic|heif)$/i, method.extension), {
                    type: method.mimeType,
                    lastModified: file.lastModified
                  });
                  console.log(`HEIC conversion successful with ${method.toType} quality ${method.quality}`);
                  break;
                }
              } catch (error: any) {
                console.log(`HEIC conversion failed with ${method.toType} (quality: ${method.quality}):`, error);
                lastError = error;
              }
            }

            // All conversion methods failed
            if (!convertedBlob) {
              console.error('All HEIC conversion methods failed. Last error:', lastError);
              const errorMessage = lastError?.message || 'Unknown error';
              throw new Error(`HEIC/HEIF 图片转换失败: ${errorMessage}\n\n请尝试将图片转换为 JPEG/PNG 格式后重试。`);
            }
          } catch (error) {
            console.error('HEIC conversion failed:', error);
            throw error;
          }
        }

        const imageUrl = URL.createObjectURL(processedFile);
        const imageFingerprint = await calculateImageFingerprint(processedFile, imageUrl, lat, lng);

        // Check if this image has already been imported
        let isDuplicate = false;

        for (const note of notes) {
          if (!note.images || note.images.length === 0) continue;

          for (const existingImage of note.images) {
            try {
              let imageData = fingerprintCache.get(existingImage) || null;
              if (!imageData) {
                imageData = await getImageDataForFingerprint(existingImage);
                if (imageData) {
                  fingerprintCache.set(existingImage, imageData);
                }
              }
              if (!imageData) continue;

              const existingFingerprint = await calculateFingerprintFromBase64(imageData, note);

              if (imageFingerprint === existingFingerprint) {
                isDuplicate = true;
                console.log('Duplicate detected: exact fingerprint match');
                break;
              }

              // Fallback: compare by width and height only
              const currentParts = imageFingerprint.split('_');
              const existingParts = existingFingerprint.split('_');

              if (currentParts.length >= 2 && existingParts.length >= 2) {
                const currentBase = currentParts.slice(0, 2).join('_');
                const existingBase = existingParts.slice(0, 2).join('_');

                if (currentBase === existingBase) {
                  isDuplicate = true;
                  console.log('Duplicate detected: width and height match');
                  break;
                }
              }
            } catch (error) {
              console.error('Error comparing fingerprints:', error);
            }
          }
          if (isDuplicate) break;
        }

        // Set error if coordinates are missing
        const error = (lat === null || lng === null) ? 'Missing location data' : undefined;

        previews.push({
          file: processedFile,
          imageUrl: imageUrl,
          lat: lat,
          lng: lng,
          error: error,
          isDuplicate: isDuplicate,
          imageFingerprint: imageFingerprint
        });
      } catch (error) {
        console.error('Error reading EXIF data from:', file.name, error);
        previews.push({
          file,
          imageUrl: URL.createObjectURL(file),
          lat: 0,
          lng: 0,
          error: 'Unable to read image or location data'
        });
      }
    }

    setImportPreview(previews);
    setShowImportDialog(true);
    onImportDialogChange?.(true);

    // If there's valid location data, fly to that position
    const validPreviews = previews.filter(p => !p.error && p.lat !== null && p.lng !== null);
    if (validPreviews.length > 0 && mapInstance) {
      const firstValid = validPreviews[0];
      if (firstValid.lat !== null && firstValid.lng !== null) {
        mapInstance.flyTo([firstValid.lat, firstValid.lng], 16, { duration: 1.5 });
      }
    }
  }, [notes, onImportDialogChange, mapInstance]);

  // Confirm import
  const handleConfirmImport = useCallback(async () => {
    // Filter out errors and duplicates
    const validPreviews = importPreview.filter(p => !p.error && !p.isDuplicate);
    const duplicateCount = importPreview.filter(p => !p.error && p.isDuplicate).length;

    // Calculate board position for imported notes
    const boardNotes = notes.filter(n => n.boardX !== undefined && n.boardY !== undefined);
    const noteWidth = 256;
    const noteHeight = 256;
    const spacing = 50;

    const newNotes: Note[] = [];
    for (let i = 0; i < validPreviews.length; i++) {
      const preview = validPreviews[i];

      try {
        // Convert image to base64 (with compression, HEIC already converted)
        const base64 = await fileToBase64(preview.file);

        // Create new note
        const newNote: Note = {
          id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          coords: {
            lat: preview.lat ?? 0,
            lng: preview.lng ?? 0
          },
          title: '',
          content: '',
          images: [base64],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          boardX: undefined,
          boardY: undefined,
          boardScale: 1
        };

        // Calculate board position (same logic as handleLongPress)
        if (boardNotes.length > 0) {
          const lastNote = boardNotes[boardNotes.length - 1];
          newNote.boardX = lastNote.boardX! + noteWidth + spacing;
          newNote.boardY = lastNote.boardY!;
        } else {
          newNote.boardX = 100;
          newNote.boardY = 100;
        }

        newNotes.push(newNote);
        onAddNote(newNote);
      } catch (error) {
        console.error('Error processing image:', preview.file.name, error);
      }
    }

    // Clear preview
    importPreview.forEach(p => URL.revokeObjectURL(p.imageUrl));
    setImportPreview([]);
    setShowImportDialog(false);
    onImportDialogChange?.(false);

    // Show message if there were duplicates
    if (duplicateCount > 0) {
      alert(`Successfully imported ${validPreviews.length} new image(s). ${duplicateCount} duplicate(s) were skipped.`);
    }

    // Update project with new notes
    if (newNotes.length > 0) {
      onUpdateProject({
        notes: [...(project.notes || []), ...newNotes]
      });
    }
  }, [importPreview, notes, onAddNote, onUpdateProject, onImportDialogChange, project.notes]);

  // Cancel import
  const handleCancelImport = useCallback(() => {
    importPreview.forEach(p => URL.revokeObjectURL(p.imageUrl));
    setImportPreview([]);
    setShowImportDialog(false);
    onImportDialogChange?.(false);
  }, [importPreview, onImportDialogChange]);

  return {
    importPreview,
    showImportDialog,
    fileInputRef,
    dataImportInputRef,
    handleImageImport,
    handleConfirmImport,
    handleCancelImport
  };
};




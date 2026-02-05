import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Note } from '../../types';
import { fileToBase64 } from '../../utils';

interface UseMediaHandlerArgs {
  initialNote?: Partial<Note>;
  isOpen: boolean;
  text: string;
  setText: (text: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

export function useMediaHandler({ initialNote, isOpen, text, setText, textareaRef }: UseMediaHandlerArgs) {
  const [images, setImages] = useState<string[]>(initialNote?.images || []);
  const [sketch, setSketch] = useState<string | undefined>(initialNote?.sketch);
  const [isProcessingImages, setIsProcessingImages] = useState(false);

  // Image preview state
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewImageIndex, setPreviewImageIndex] = useState<number>(0);

  const prevIsOpenRef = useRef(false);
  const prevNoteIdRef = useRef<string | undefined>(initialNote?.id);
  const noteId = initialNote?.id;

  const noteMediaChecksum = useMemo(() => {
    return JSON.stringify({
      images: initialNote?.images,
      sketch: initialNote?.sketch
    });
  }, [initialNote]);

  useEffect(() => {
    if (isOpen && (noteId !== prevNoteIdRef.current || prevIsOpenRef.current !== isOpen)) {
      setImages(initialNote?.images || []);
      setSketch(initialNote?.sketch);
      setPreviewImage(null);
      setPreviewImageIndex(0);
      prevNoteIdRef.current = noteId;
    }
    prevIsOpenRef.current = isOpen;
  }, [noteId, isOpen, noteMediaChecksum]);

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    try {
      const files = Array.from(e.target.files) as File[];
      setIsProcessingImages(true);
      const base64Promises = files.map((file: File) => fileToBase64(file));
      const base64Images = await Promise.all(base64Promises);
      setImages((prev) => [...prev, ...base64Images]);
      e.target.value = '';
    } catch (err) {
      console.error('Failed to convert image', err);
    } finally {
      setIsProcessingImages(false);
    }
  }, []);

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData.items) as DataTransferItem[];
      const imageItems = items.filter((item) => item.type.startsWith('image/'));
      const textData = e.clipboardData.getData('text/plain');

      if (imageItems.length > 0) {
        e.preventDefault();
        setIsProcessingImages(true);

        try {
          if (textData && textareaRef.current) {
            const start = textareaRef.current.selectionStart;
            const end = textareaRef.current.selectionEnd;
            const newText = text.substring(0, start) + textData + text.substring(end);
            setText(newText);
            setTimeout(() => {
              if (textareaRef.current) {
                textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + textData.length;
              }
            }, 0);
          }

          const imageFiles = imageItems
            .map((item) => item.getAsFile())
            .filter((file) => file !== null) as File[];
          const base64Promises = imageFiles.map((file) => fileToBase64(file));
          const base64Images = await Promise.all(base64Promises);
          if (base64Images.length > 0) {
            setImages((prev) => [...prev, ...base64Images]);
          }
        } catch (err) {
          console.error('Failed to process pasted content', err);
        } finally {
          setIsProcessingImages(false);
        }
      }
    },
    [setText, text, textareaRef]
  );

  const handleDropImages = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const files = Array.from(e.dataTransfer.files) as File[];
      const imageFiles = files.filter((file: File) => file.type.startsWith('image/'));
      if (imageFiles.length === 0 || isProcessingImages) return;

      setIsProcessingImages(true);
      try {
        // Process images in batches to avoid blocking UI
        const batchSize = 3;
        for (let i = 0; i < imageFiles.length; i += batchSize) {
          const batch = imageFiles.slice(i, i + batchSize);
          const base64Promises = batch.map(async (file) => {
            if (file.size > 500 * 1024) {
              return new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = (ev) => {
                  const img = new Image();
                  img.src = ev.target?.result as string;
                  img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    let maxSize = 1200;
                    if (file.size > 10 * 1024 * 1024) maxSize = 600;
                    else if (file.size > 5 * 1024 * 1024) maxSize = 800;
                    else if (file.size > 2 * 1024 * 1024) maxSize = 1000;

                    if (width > maxSize || height > maxSize) {
                      const ratio = Math.min(maxSize / width, maxSize / height);
                      width = Math.floor(width * ratio);
                      height = Math.floor(height * ratio);
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return reject(new Error('Could not get canvas context'));
                    ctx.drawImage(img, 0, 0, width, height);

                    let quality = 0.8;
                    if (file.size > 5 * 1024 * 1024) quality = 0.5;
                    else if (file.size > 2 * 1024 * 1024) quality = 0.6;
                    else quality = 0.7;

                    const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
                    resolve(compressedDataUrl);
                  };
                  img.onerror = (error) => reject(error);
                };
                reader.onerror = (error) => reject(error);
              });
            }
            return fileToBase64(file);
          });

          const batchResults = await Promise.all(base64Promises);
          setImages((prev) => [...prev, ...batchResults]);
        }
      } catch (err) {
        console.error('Failed to convert dragged image', err);
      } finally {
        setIsProcessingImages(false);
      }
    },
    [isProcessingImages]
  );

  const removeImage = useCallback(
    (index?: number) => {
      if (index === undefined) {
        setImages([]);
        setPreviewImage(null);
        setPreviewImageIndex(0);
        return;
      }

      setImages((prev) => {
        const newImages = prev.filter((_, i) => i !== index);

        if (previewImage) {
          if (previewImageIndex === index) {
            if (newImages.length > 0) {
              const newIndex = Math.min(index, newImages.length - 1);
              setPreviewImageIndex(newIndex);
              setPreviewImage(newImages[newIndex]);
            } else {
              setPreviewImage(null);
              setPreviewImageIndex(0);
            }
          } else if (previewImageIndex > index) {
            const newIndex = previewImageIndex - 1;
            setPreviewImageIndex(newIndex);
            setPreviewImage(newImages[newIndex] || null);
          }
        }

        return newImages;
      });
    },
    [previewImage, previewImageIndex]
  );

  const removeSketch = useCallback(() => {
    setSketch(undefined);
  }, []);

  return {
    images,
    setImages,
    sketch,
    setSketch,
    isProcessingImages,
    handleImageUpload,
    handlePaste,
    handleDropImages,
    removeImage,
    removeSketch,
    previewImage,
    setPreviewImage,
    previewImageIndex,
    setPreviewImageIndex
  };
}


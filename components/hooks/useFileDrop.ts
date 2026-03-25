import { useState, useCallback } from 'react';

interface UseFileDropProps {
  isEditorOpen: boolean;
  themeColor: string;
  handleImageImport: (files: FileList | null, showLimitMessage?: boolean) => void;
  handleDataImport: (file: File) => void;
  handleCsvImport: (file: File) => void;
}

export function useFileDrop({
  isEditorOpen,
  themeColor,
  handleImageImport,
  handleDataImport,
  handleCsvImport
}: UseFileDropProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isEditorOpen) {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const { clientX: x, clientY: y } = e;
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
          setIsDragging(false);
        }
      }
    },
    [isEditorOpen]
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (isEditorOpen) {
        setIsDragging(false);
        return;
      }

      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (!files || files.length === 0) return;

      const imageFiles = Array.from(files).filter(
        (file: File) =>
          file.type.startsWith('image/') ||
          file.name.toLowerCase().endsWith('.heic') ||
          file.name.toLowerCase().endsWith('.heif')
      );
      const jsonFiles = Array.from(files).filter(
        (file: File) =>
          file.type === 'application/json' || file.name.endsWith('.json')
      );
      const csvFiles = Array.from(files).filter(
        (file: File) =>
          file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv')
      );

      if (imageFiles.length > 0) {
        const dataTransfer = new DataTransfer();
        imageFiles.forEach((file) => dataTransfer.items.add(file as File));
        handleImageImport(dataTransfer.files, true);
      } else if (jsonFiles.length > 0 && jsonFiles[0]) {
        handleDataImport(jsonFiles[0] as File);
      } else if (csvFiles.length > 0 && csvFiles[0]) {
        handleCsvImport(csvFiles[0] as File);
      }
    },
    [isEditorOpen, handleImageImport, handleDataImport, handleCsvImport]
  );

  const rootProps = {
    onDragEnter: handleDragEnter,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
    onDragEnd: handleDragEnd,
    className: isDragging ? 'ring-4 ring-offset-2' : '',
    style: isDragging ? { boxShadow: `0 0 0 4px ${themeColor}` } as const : undefined
  };

  const dismissDropZone = useCallback(() => setIsDragging(false), []);

  return { isDragging, rootProps, dismissDropZone };
}

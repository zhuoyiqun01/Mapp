import React from 'react';
import type { Editor } from '@tiptap/core';
import { EditorArea } from './EditorArea';

interface ContentSectionProps {
  displayTitle?: string;
  isPreviewMode: boolean;
  text: string;
  onTextChange: (value: string) => void;
  onPaste: (e: React.ClipboardEvent) => void;
  onDropImages: (e: React.DragEvent) => void;
  isProcessingImages: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  updateCursorPosition: () => void;
  editor: Editor | null;
  themeColor: string;
}

/** Content：正文 Markdown；displayTitle 仅派生展示 */
export const ContentSection: React.FC<ContentSectionProps> = ({
  displayTitle,
  isPreviewMode,
  text,
  onTextChange,
  onPaste,
  onDropImages,
  isProcessingImages,
  textareaRef,
  updateCursorPosition,
  editor,
  themeColor
}) => (
  <section className="flex flex-col flex-1 min-h-0" aria-label="正文">
    {displayTitle ? (
      <div className="px-4 pt-1 pb-0 shrink-0">
        <div className="text-[11px] font-medium text-gray-400 truncate" title={displayTitle}>
          {displayTitle}
        </div>
      </div>
    ) : null}
    <EditorArea
      isPreviewMode={isPreviewMode}
      text={text}
      onTextChange={onTextChange}
      onPaste={onPaste}
      onDropImages={onDropImages}
      isProcessingImages={isProcessingImages}
      textareaRef={textareaRef}
      updateCursorPosition={updateCursorPosition}
      editor={editor}
      themeColor={themeColor}
    />
  </section>
);

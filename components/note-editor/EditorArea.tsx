import React from 'react';
import type { Editor } from '@tiptap/core';
import { EditorContent } from '@tiptap/react';

interface EditorAreaProps {
  isPreviewMode: boolean;
  text: string;
  onTextChange: (value: string) => void;
  onPaste: (e: React.ClipboardEvent) => void;
  onDropImages: (e: React.DragEvent) => void;
  isProcessingImages: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  updateCursorPosition: () => void;
  editor: Editor | null;
}

export const EditorArea: React.FC<EditorAreaProps> = ({
  isPreviewMode,
  text,
  onTextChange,
  onPaste,
  onDropImages,
  isProcessingImages,
  textareaRef,
  updateCursorPosition,
  editor
}) => {
  return (
    <div
      className={`flex-1 min-h-0 px-3 relative group flex flex-col overflow-y-auto custom-scrollbar min-h-[120px] ${
        isProcessingImages ? 'ring-2 ring-blue-400 ring-opacity-50 bg-blue-50 bg-opacity-30' : ''
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={onDropImages}
    >
      <div className="grid w-full min-w-0 h-full min-h-0">
        {!isPreviewMode ? (
          <textarea
            ref={textareaRef}
            autoFocus={false}
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            onPaste={onPaste}
            onSelect={updateCursorPosition}
            onKeyUp={updateCursorPosition}
            onClick={updateCursorPosition}
            placeholder="在此输入内容 (支持 Markdown 语法)..."
            className="w-full h-full bg-white border-none resize-none focus:ring-0 p-6 text-gray-800 placeholder-gray-400 leading-relaxed overflow-y-auto break-words whitespace-pre-wrap text-[1.1rem]"
            spellCheck={false}
            style={{
              border: 'none',
              outline: 'none',
              boxShadow: 'none',
              zIndex: 2,
              minHeight: '300px'
            }}
          />
        ) : (
          <div className="w-full h-full bg-white overflow-y-auto min-h-[300px]">
            <EditorContent editor={editor as any} />
            <style>{`
              .tiptap-editor {
                outline: none !important;
              }
              .tiptap-editor p {
                margin-top: 0 !important;
                margin-bottom: 0.5rem !important;
              }
              .tiptap-editor p.is-editor-empty:first-child::before {
                content: attr(data-placeholder);
                float: left;
                color: #adb5bd;
                pointer-events: none;
                height: 0;
              }
              .tiptap-editor h1 { font-size: 1.8rem; font-weight: 800; margin: 1.5rem 0 1rem; border-bottom: 1px solid #eee; padding-bottom: 0.3rem; }
              .tiptap-editor h2 { font-size: 1.5rem; font-weight: 700; margin: 1.2rem 0 0.8rem; }
              .tiptap-editor h3 { font-size: 1.25rem; font-weight: 600; margin: 1rem 0 0.6rem; }
              .tiptap-editor ul, .tiptap-editor ol { margin: 0.5rem 0 1rem; padding-left: 1.5rem; }
              .tiptap-editor ul { list-style-type: disc; }
              .tiptap-editor ol { list-style-type: decimal; }
              .tiptap-editor li { margin-bottom: 0.25rem; }
              .tiptap-editor li p { margin: 0 !important; }
              .tiptap-editor blockquote { border-left: 4px solid #e5e7eb; padding-left: 1rem; color: #6b7280; font-style: italic; margin: 1rem 0; }
              .tiptap-editor code { background: #f3f4f6; padding: 0.2rem 0.4rem; border-radius: 4px; font-size: 0.9em; font-family: monospace; }
              .tiptap-editor pre { background: #f9fafb; padding: 1rem; border-radius: 8px; overflow-x: auto; margin: 1rem 0; border: 1px solid #f3f4f6; }
            `}</style>
          </div>
        )}
      </div>
    </div>
  );
};


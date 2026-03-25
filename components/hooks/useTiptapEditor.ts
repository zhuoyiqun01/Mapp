import { useEffect } from 'react';
import { useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { EDITOR_EXTENSIONS } from '../editor/extensions';

interface UseTiptapEditorArgs {
  noteId?: string;
  content: string;
  onMarkdownChange: (markdown: string) => void;
}

export function useTiptapEditor({ noteId, content, onMarkdownChange }: UseTiptapEditorArgs) {
  const editor = useEditor({
    extensions: EDITOR_EXTENSIONS,
    content,
    onUpdate: ({ editor }) => {
      // @ts-ignore - tiptap-markdown storage typing
      const markdown = editor.storage.markdown.getMarkdown();
      onMarkdownChange(markdown);
    },
    editorProps: {
      attributes: {
        class:
          'prose cursor-text focus:outline-none min-h-[300px] p-0 text-[1.05rem] text-gray-800 leading-relaxed max-w-none tiptap-editor'
      }
    }
  });

  // Sync external text changes to editor.
  // This is important because `EditorArea` uses a textarea in "source mode";
  // while the textarea is updating `content`, the hidden tiptap editor must
  // keep up so that switching to "preview mode" shows the latest text.
  useEffect(() => {
    if (!editor) return;
    const currentMarkdown = (editor.storage.markdown as any).getMarkdown();
    if (content !== currentMarkdown) {
      editor.commands.setContent(content || '');
    }
  }, [noteId, editor, content]);

  return { editor: editor as Editor | null };
}


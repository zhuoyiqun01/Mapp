import { useEffect, useMemo, useRef, useState } from 'react';
import type { Note, Tag } from '../../types';
import { TAG_COLORS } from '../../constants';

export interface NoteState {
  emoji: string;
  text: string;
  isFavorite: boolean;
  tags: Tag[];
  isPreviewMode: boolean;

  // Tag creation/editing UI state (kept here to reduce leaks)
  isAddingTag: boolean;
  editingTagId: string | null;
  newTagLabel: string;
  newTagColor: string;
}

interface UseNoteStateArgs {
  initialNote?: Partial<Note>;
  isOpen: boolean;
}

export function useNoteState({ initialNote, isOpen }: UseNoteStateArgs) {
  const [emoji, setEmoji] = useState(initialNote?.emoji || '');
  const [text, setText] = useState(initialNote?.text || '');
  const [isFavorite, setIsFavorite] = useState<boolean>(initialNote?.isFavorite ?? false);
  const [tags, setTags] = useState<Tag[]>(initialNote?.tags || []);
  const [isPreviewMode, setIsPreviewMode] = useState(true);

  // Tag creation state
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [newTagLabel, setNewTagLabel] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[2]);

  const isCompactMode = initialNote?.variant === 'compact';

  // Track if editor was just opened to only reset state on open, not on every initialNote change
  const prevIsOpenRef = useRef(false);
  const prevNoteIdRef = useRef<string | undefined>(initialNote?.id);
  const noteId = initialNote?.id;

  const noteDataChecksum = useMemo(() => {
    return JSON.stringify({
      emoji: initialNote?.emoji,
      text: initialNote?.text,
      isFavorite: initialNote?.isFavorite,
      tags: initialNote?.tags
    });
  }, [initialNote]);

  useEffect(() => {
    // When note ID changes (switching between notes in cluster) OR editor opens, reset state
    if (isOpen && (noteId !== prevNoteIdRef.current || prevIsOpenRef.current !== isOpen)) {
      setEmoji(initialNote?.emoji || '');
      setText(initialNote?.text || '');
      setIsFavorite(initialNote?.isFavorite ?? false);
      setTags(initialNote?.tags || []);
      setIsAddingTag(false);
      setEditingTagId(null);
      setNewTagLabel('');
      setNewTagColor(TAG_COLORS[2]);
      prevNoteIdRef.current = noteId;
    }
    prevIsOpenRef.current = isOpen;
  }, [noteId, isOpen, noteDataChecksum]);

  return {
    isCompactMode,
    noteState: {
      emoji,
      text,
      isFavorite,
      tags,
      isPreviewMode,
      isAddingTag,
      editingTagId,
      newTagLabel,
      newTagColor
    } satisfies NoteState,
    setEmoji,
    setText,
    setIsFavorite,
    setTags,
    setIsPreviewMode,
    setIsAddingTag,
    setEditingTagId,
    setNewTagLabel,
    setNewTagColor
  };
}


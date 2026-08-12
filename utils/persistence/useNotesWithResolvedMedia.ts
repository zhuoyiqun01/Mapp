import { useEffect, useMemo, useState } from 'react';
import type { Note } from '../../types';
import { loadNoteImages } from './storage';
import { noteNeedsMediaResolve } from './mediaDisplay';

function mediaSig(notes: Note[]): string {
  return notes
    .map((n) => {
      if (n.media?.length) {
        return `${n.id}:M:${n.media
          .map(
            (m) =>
              `${m.id}:${m.kind}:${m.assetId}>${m.variantId || ''}>${m.variantEnabled === false ? '0' : '1'}`
          )
          .join(';')}`;
      }
      return `${n.id}:${(n.images || []).join(',')}:${(n.imageRefs || [])
        .map((r) => `${r.assetId}>${r.variantId || ''}>${r.variantEnabled === false ? '0' : '1'}`)
        .join(';')}:${n.sketch || ''}`;
    })
    .join('|');
}

type ResolvedMedia = Pick<Note, 'images' | 'sketch'>;

/**
 * 将 notes 中的资产 ID 解析为展示用 data URL（本地 state，不写回项目）。
 * 布局/文案等字段始终取自最新 notes，避免拖动 boardX/Y 后被旧 resolved 快照盖住。
 */
export function useNotesWithResolvedMedia(notes: Note[]): Note[] {
  const sig = useMemo(() => mediaSig(notes), [notes]);
  const [resolvedMediaById, setResolvedMediaById] = useState<Record<string, ResolvedMedia>>({});

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!notes.some(noteNeedsMediaResolve)) {
        if (!cancelled) setResolvedMediaById({});
        return;
      }
      const entries = await Promise.all(
        notes.map(async (note) => {
          if (!noteNeedsMediaResolve(note)) return null;
          try {
            const loaded = await loadNoteImages(note);
            return [note.id, { images: loaded.images, sketch: loaded.sketch }] as const;
          } catch {
            return null;
          }
        })
      );
      if (cancelled) return;
      const next: Record<string, ResolvedMedia> = {};
      for (const entry of entries) {
        if (entry) next[entry[0]] = entry[1];
      }
      setResolvedMediaById(next);
    };
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- notes 媒体内容由 sig 跟踪
  }, [sig]);

  return useMemo(
    () =>
      notes.map((note) => {
        const media = resolvedMediaById[note.id];
        if (!media) return note;
        return {
          ...note,
          images: media.images ?? note.images,
          sketch: media.sketch ?? note.sketch
        };
      }),
    [notes, resolvedMediaById]
  );
}

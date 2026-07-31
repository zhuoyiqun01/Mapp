import type { Note } from '../../types';

/**
 * 一便签只属于一个 Frame：优先 groupIds[0]，否则 groupId / 名称回退。
 */
export function primaryFrameId(note: Note): string | undefined {
  const fromIds = note.groupIds?.map((x) => String(x).trim()).filter(Boolean);
  if (fromIds?.length) return fromIds[0];
  const gid = note.groupId?.trim();
  if (gid) return gid;
  const fromNames = note.groupNames?.map((x) => String(x).trim()).filter(Boolean);
  if (fromNames?.length) return fromNames[0];
  const gn = note.groupName?.trim();
  return gn || undefined;
}

export function primaryFrameName(note: Note): string | undefined {
  const fromNames = note.groupNames?.map((x) => String(x).trim()).filter(Boolean);
  if (fromNames?.length) return fromNames[0];
  const gn = note.groupName?.trim();
  if (gn) return gn;
  return undefined;
}

/** 将多簇归属塌缩为单簇（旧文件取第一个）。 */
export function normalizeNoteToSingleFrame(note: Note): Note {
  const id = primaryFrameId(note);
  const name = primaryFrameName(note);
  if (!id && !name) {
    if (
      note.groupId == null &&
      note.groupName == null &&
      (note.groupIds == null || note.groupIds.length === 0) &&
      (note.groupNames == null || note.groupNames.length === 0)
    ) {
      return note;
    }
    const { groupId: _a, groupName: _b, groupIds: _c, groupNames: _d, ...rest } = note;
    return rest as Note;
  }
  return {
    ...note,
    groupId: id,
    groupName: name ?? note.groupName,
    groupIds: id ? [id] : undefined,
    groupNames: name ? [name] : id ? note.groupNames?.slice(0, 1) : undefined
  };
}

export function normalizeNotesToSingleFrame(notes: Note[]): Note[] {
  return notes.map(normalizeNoteToSingleFrame);
}

/** 写入单簇归属（覆盖多簇）。 */
export function setNoteSingleFrame(
  note: Note,
  frame: { id: string; title?: string } | null
): Note {
  if (!frame) {
    const { groupId: _a, groupName: _b, groupIds: _c, groupNames: _d, ...rest } = note;
    return rest as Note;
  }
  const title = frame.title?.trim() || undefined;
  return {
    ...note,
    groupId: frame.id,
    groupName: title,
    groupIds: [frame.id],
    groupNames: title ? [title] : undefined
  };
}

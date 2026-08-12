import type { Note, NoteImageRef, NoteMediaItem } from '../../types';
import { isMediaRefId } from './imageAssetStore';

/** 可直接作为 <img src> 的地址（排除资产 id） */
export function isDisplayableImageSrc(src: string | null | undefined): boolean {
  if (!src) return false;
  if (isMediaRefId(src)) return false;
  return (
    src.startsWith('data:image/') ||
    src.startsWith('blob:') ||
    src.startsWith('http://') ||
    src.startsWith('https://')
  );
}

/** 媒体引用是否正在使用裁剪/贴纸 Variant 展示 */
export function isImageRefCropActive(
  ref: Pick<NoteImageRef, 'variantId' | 'variantEnabled'> | null | undefined
): boolean {
  return !!ref?.variantId && ref.variantEnabled !== false;
}

export function isMediaItemCropActive(item: NoteMediaItem | null | undefined): boolean {
  return isImageRefCropActive(item);
}

/** 媒体栏第一项是否为有效套索裁剪贴纸（优先 media[0]） */
export function noteHasActiveFirstMediaCrop(
  note: Pick<Note, 'media' | 'imageRefs'>
): boolean {
  if (note.media && note.media.length > 0) {
    return isMediaItemCropActive(note.media[0]);
  }
  return isImageRefCropActive(note.imageRefs?.[0]);
}

/**
 * Board 上是否应按贴纸呈现（非文本卡片）。
 * 显式 image variant，或首个媒体启用了裁剪贴纸。
 * 注意：裁剪贴纸应保持 variant=standard，以保留 mapping 点位；贴纸仅为 Board 视觉。
 */
export function noteRendersAsBoardSticker(
  note: Pick<Note, 'variant' | 'media' | 'imageRefs'>
): boolean {
  if (note.variant === 'image') return true;
  return noteHasActiveFirstMediaCrop(note);
}

/**
 * 是否仍需从 IndexedDB / Variant 解析展示像素。
 */
export function noteNeedsMediaResolve(note: Note): boolean {
  if (note.media && note.media.length > 0) {
    if (note.media.some((m) => isMediaRefId(m.assetId))) return true;
    return false;
  }
  if ((note.images || []).some(isMediaRefId)) return true;
  if (note.sketch && isMediaRefId(note.sketch)) return true;

  const refs = note.imageRefs || [];
  if (refs.length === 0) return false;

  const images = note.images || [];
  if (images.length < refs.length) return true;
  if (images.some((img) => !isDisplayableImageSrc(img))) return true;
  return false;
}

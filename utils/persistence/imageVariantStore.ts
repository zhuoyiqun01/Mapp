/**
 * ImageEdit / ImageVariant 元数据与可选 raster Blob 的 IndexedDB 存储。
 * 贴纸默认可只有 Edit（含 Mask），不强制立刻生成 PNG。
 */
import { del, get, set } from 'idb-keyval';
import type { ImageEdit, ImageOperation, ImageVariant, ImageVariantKind } from '../../types';
import { generateMediaId } from './imageAssetStore';

export const IMAGE_EDIT_PREFIX = 'mapp-image-edit-';
export const IMAGE_VARIANT_PREFIX = 'mapp-image-variant-';
export const IMAGE_VARIANT_BLOB_PREFIX = 'mapp-variant-blob-';
export const IMAGE_MASK_BLOB_PREFIX = 'mapp-mask-blob-';

export function generateEditId(): string {
  return `ied-${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateVariantId(): string {
  return `ivar-${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function isVariantId(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith('ivar-');
}

export function isEditId(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith('ied-');
}

export async function saveImageEdit(edit: ImageEdit): Promise<ImageEdit> {
  const next: ImageEdit = {
    ...edit,
    updatedAt: Date.now()
  };
  await set(`${IMAGE_EDIT_PREFIX}${next.id}`, next);
  return next;
}

export async function loadImageEdit(editId: string): Promise<ImageEdit | null> {
  const data = await get<ImageEdit>(`${IMAGE_EDIT_PREFIX}${editId}`);
  return data ?? null;
}

export async function deleteImageEdit(editId: string): Promise<void> {
  await del(`${IMAGE_EDIT_PREFIX}${editId}`);
}

export async function saveImageVariant(variant: ImageVariant): Promise<ImageVariant> {
  await set(`${IMAGE_VARIANT_PREFIX}${variant.id}`, variant);
  return variant;
}

export async function loadImageVariant(variantId: string): Promise<ImageVariant | null> {
  const data = await get<ImageVariant>(`${IMAGE_VARIANT_PREFIX}${variantId}`);
  return data ?? null;
}

export async function deleteImageVariant(variantId: string): Promise<void> {
  const v = await loadImageVariant(variantId);
  if (v?.blobKey) {
    await del(v.blobKey.startsWith(IMAGE_VARIANT_BLOB_PREFIX) ? v.blobKey : `${IMAGE_VARIANT_BLOB_PREFIX}${v.id}`);
  }
  await del(`${IMAGE_VARIANT_PREFIX}${variantId}`);
}

export async function saveVariantRasterBlob(variantId: string, blob: Blob): Promise<string> {
  const key = `${IMAGE_VARIANT_BLOB_PREFIX}${variantId}`;
  await set(key, blob);
  return key;
}

export async function loadVariantRasterBlob(variantIdOrKey: string): Promise<Blob | null> {
  const key = variantIdOrKey.startsWith(IMAGE_VARIANT_BLOB_PREFIX)
    ? variantIdOrKey
    : `${IMAGE_VARIANT_BLOB_PREFIX}${variantIdOrKey}`;
  const blob = await get<Blob>(key);
  return blob instanceof Blob ? blob : null;
}

export async function saveMaskBitmapBlob(maskId: string, blob: Blob): Promise<string> {
  const key = `${IMAGE_MASK_BLOB_PREFIX}${maskId}`;
  await set(key, blob);
  return key;
}

export async function loadMaskBitmapBlob(maskBlobKey: string): Promise<Blob | null> {
  const key = maskBlobKey.startsWith(IMAGE_MASK_BLOB_PREFIX)
    ? maskBlobKey
    : `${IMAGE_MASK_BLOB_PREFIX}${maskBlobKey}`;
  const blob = await get<Blob>(key);
  return blob instanceof Blob ? blob : null;
}

/** 从操作序列创建 Edit + sticker Variant（默认不 rasterize） */
export async function createStickerVariantFromOperations(opts: {
  assetId: string;
  operations: ImageOperation[];
  kind?: ImageVariantKind;
}): Promise<{ edit: ImageEdit; variant: ImageVariant }> {
  const now = Date.now();
  const edit: ImageEdit = {
    id: generateEditId(),
    assetId: opts.assetId,
    operations: opts.operations,
    createdAt: now,
    updatedAt: now
  };
  await saveImageEdit(edit);

  const variant: ImageVariant = {
    id: generateVariantId(),
    assetId: opts.assetId,
    kind: opts.kind ?? 'sticker',
    editId: edit.id,
    createdAt: now
  };
  await saveImageVariant(variant);
  return { edit, variant };
}

/** 兼容旧调用：若无专用 id 生成器场景 */
export { generateMediaId };

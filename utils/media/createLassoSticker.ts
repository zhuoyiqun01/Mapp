import type { ImageEdit, ImageVariant, NormPoint, NoteImageRef } from '../../types';
import { prepareLassoPath } from './pathSimplify';
import { createStickerVariantFromOperations } from '../persistence/imageVariantStore';

/**
 * 从套索归一化点创建非破坏贴纸 Variant（不立刻 rasterize PNG）。
 */
export async function createLassoSticker(opts: {
  assetId: string;
  rawPoints: NormPoint[];
  outlineWidth?: number;
}): Promise<{ edit: ImageEdit; variant: ImageVariant; ref: NoteImageRef }> {
  const points = prepareLassoPath(opts.rawPoints);
  if (points.length < 3) {
    throw new Error('Lasso path too short');
  }

  const operations = [
    { type: 'lasso' as const, points },
    ...(opts.outlineWidth != null && opts.outlineWidth > 0
      ? [{ type: 'outline' as const, width: opts.outlineWidth }]
      : [])
  ];

  const { edit, variant } = await createStickerVariantFromOperations({
    assetId: opts.assetId,
    operations,
    kind: 'sticker'
  });

  return {
    edit,
    variant,
    ref: { assetId: opts.assetId, variantId: variant.id, variantEnabled: true }
  };
}

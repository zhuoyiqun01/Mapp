/**
 * 图谱「标签层」注册表：按 note.tags[0].label 自动分层时的默认顺序与权重。
 *
 * - 分层键来自便签首标签文案，不必写进项目 JSON 的 graphLayers.weights
 * - 未注册的标签仍会自动成层（默认 weight 0.5，排在已注册层之后）
 * - 用户在图层面板里改过的 order / weights 仍以项目内保存值为准（覆盖本表）
 */

export type LayerRegistryEntry = {
  /** 越小越靠前（面板顺序 / 网格行序） */
  order: number;
  /** 环形/时间轴权重 0.1～1，越大越靠近圆心、时间线纵轴越靠上 */
  weight: number;
  /** 可选建议色（便签 tags[].color 未写时可参考；当前合并逻辑不强制写入） */
  color?: string;
};

/**
 * 已知战略/治理层。新增层名：在此加一行即可获得默认排序与权重；
 * 或仅在便签 tags 里使用新文案——也会成层，只是用通用默认值。
 */
export const LayerRegistry: Record<string, LayerRegistryEntry> = {
  国际框架: { order: 0, weight: 1.0 },
  总体战略: { order: 1, weight: 0.85 },
  行动计划: { order: 2, weight: 0.7 },
  治理机制: { order: 3, weight: 0.55 },
  设计要求: { order: 4, weight: 0.4 },
  产品生命周期: { order: 5, weight: 0.25 },
};

export const LAYER_REGISTRY_DEFAULT_WEIGHT = 0.5;

export function getLayerRegistryEntry(label: string): LayerRegistryEntry | undefined {
  const key = String(label ?? '').trim();
  if (!key) return undefined;
  return LayerRegistry[key];
}

/** 合并图层时：无项目覆盖则用注册表权重，否则通用默认 */
export function defaultWeightForTagLayer(label: string): number {
  return getLayerRegistryEntry(label)?.weight ?? LAYER_REGISTRY_DEFAULT_WEIGHT;
}

/**
 * 标签列表排序：首字母（locale）顺序；「无标签」始终靠后。
 */
export function compareTagLayerKeysForAutoOrder(a: string, b: string, untaggedKey: string): number {
  const aEmpty = a === '' || a === untaggedKey;
  const bEmpty = b === '' || b === untaggedKey;
  if (aEmpty && !bEmpty) return 1;
  if (bEmpty && !aEmpty) return -1;
  return a.localeCompare(b, 'zh-Hans-CN');
}

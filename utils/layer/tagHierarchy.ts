/** 标签层级分隔符：`领域 · 可持续产品` → 一级「领域」，二级「可持续产品」 */

export const TAG_HIERARCHY_SEP = ' · ';

export function tagHierarchyPrefix(label: string): string {
  const raw = String(label ?? '').trim();
  if (!raw) return raw;
  const i = raw.indexOf(TAG_HIERARCHY_SEP);
  if (i < 0) return raw;
  const prefix = raw.slice(0, i).trim();
  return prefix || raw;
}

/** 层级标签的二级展示文案：`领域 · 可持续产品` → `可持续产品`；无分隔符则返回全文 */
export function tagHierarchySuffix(label: string): string {
  const raw = String(label ?? '').trim();
  if (!raw) return raw;
  const i = raw.indexOf(TAG_HIERARCHY_SEP);
  if (i < 0) return raw;
  const suffix = raw.slice(i + TAG_HIERARCHY_SEP.length).trim();
  return suffix || raw;
}

export function tagHasHierarchySep(label: string): boolean {
  return String(label ?? '').includes(TAG_HIERARCHY_SEP);
}

/**
 * 将扁平标签 order 收成一级前缀 → 完整标签列表。
 * 前缀顺序与组内完整标签均保持传入 order 的相对顺序（首次出现为准；字母序仅作新键默认插入）。
 */
export function groupTagsByHierarchyPrefix(
  order: string[],
  untaggedKey: string
): Array<{ prefix: string; tags: string[] }> {
  const map = new Map<string, string[]>();
  for (const raw of order) {
    const tag = String(raw).trim();
    if (!tag) continue;
    const prefix = tag === untaggedKey ? untaggedKey : tagHierarchyPrefix(tag);
    if (!map.has(prefix)) map.set(prefix, []);
    map.get(prefix)!.push(tag);
  }
  return [...map.keys()].map((prefix) => ({ prefix, tags: map.get(prefix)! }));
}

/** 在 order 中把 fromKey 插到 toKey 前/后（图层拖拽共用） */
export function insertLayerOrderRelative(
  order: string[],
  fromKey: string,
  toKey: string,
  place: 'before' | 'after'
): string[] {
  const next = [...order];
  const fromIdx = next.indexOf(fromKey);
  let toIdx = next.indexOf(toKey);
  if (fromIdx < 0 || toIdx < 0 || fromKey === toKey) return order;
  next.splice(fromIdx, 1);
  toIdx = next.indexOf(toKey);
  if (toIdx < 0) return order;
  const insertAt = place === 'after' ? toIdx + 1 : toIdx;
  next.splice(insertAt, 0, fromKey);
  return next;
}

/** 把 fromKeys 整块移到 toKey 前/后（前缀组拖拽） */
export function insertLayerOrderBlockRelative(
  order: string[],
  fromKeys: string[],
  toKey: string,
  place: 'before' | 'after'
): string[] {
  const block = fromKeys.map((k) => String(k).trim()).filter(Boolean);
  if (block.length === 0) return order;
  if (block.includes(toKey)) return order;
  const next = order.filter((k) => !block.includes(k));
  const toIdx = next.indexOf(toKey);
  if (toIdx < 0) return order;
  const insertAt = place === 'after' ? toIdx + 1 : toIdx;
  next.splice(insertAt, 0, ...block);
  return next;
}

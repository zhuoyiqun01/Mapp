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
 * 一级按 locale 排序；组内完整标签保持传入 order 的相对顺序（已是首字母序）。
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
  const prefixes = [...map.keys()].sort((a, b) => {
    if (a === untaggedKey && b !== untaggedKey) return 1;
    if (b === untaggedKey && a !== untaggedKey) return -1;
    return a.localeCompare(b, 'zh-Hans-CN');
  });
  return prefixes.map((prefix) => ({ prefix, tags: map.get(prefix)! }));
}

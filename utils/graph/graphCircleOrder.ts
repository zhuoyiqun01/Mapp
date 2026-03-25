import type { Core } from 'cytoscape';

const GRAPH_SORT_LOCALE = 'zh-Hans-CN';

function cmpId(a: string, b: string): number {
  return a.localeCompare(b, GRAPH_SORT_LOCALE);
}

function splitUndirectedComponents(ids: string[], adj: Map<string, Set<string>>): string[][] {
  const unassigned = new Set(ids);
  const components: string[][] = [];
  while (unassigned.size > 0) {
    const start = [...unassigned].sort(cmpId)[0];
    const comp: string[] = [];
    const stack = [start];
    while (stack.length) {
      const u = stack.pop()!;
      if (!unassigned.has(u)) continue;
      unassigned.delete(u);
      comp.push(u);
      for (const v of adj.get(u) ?? []) {
        if (unassigned.has(v)) stack.push(v);
      }
    }
    components.push(comp);
  }
  components.sort((a, b) => {
    const ma = [...a].sort(cmpId)[0];
    const mb = [...b].sort(cmpId)[0];
    return cmpId(ma, mb);
  });
  return components;
}

function orderComponentDfs(
  comp: string[],
  adj: Map<string, Set<string>>,
  degree: (id: string) => number
): string[] {
  const set = new Set(comp);
  const localV = new Set<string>();
  const out: string[] = [];

  const start = [...comp].sort((a, b) => {
    const da = degree(a);
    const db = degree(b);
    if (db !== da) return db - da;
    return cmpId(a, b);
  })[0];

  function dfs(u: string) {
    localV.add(u);
    out.push(u);
    const neigh = [...(adj.get(u) ?? [])].filter((v) => set.has(v) && !localV.has(v));
    neigh.sort((a, b) => {
      const da = degree(a);
      const db = degree(b);
      if (db !== da) return db - da;
      return cmpId(a, b);
    });
    for (const v of neigh) {
      dfs(v);
    }
  }

  dfs(start);

  for (const id of [...comp].sort(cmpId)) {
    if (!localV.has(id)) dfs(id);
  }
  return out;
}

/**
 * 为圆环布局生成节点顺序（rank 越小越先排上环）。
 * 各连通分量内从大度节点出发做 DFS，分量间按 id 稳定排序；仍为环形几何，仅优化环上先后次序以减轻连线交叉。
 */
export function computeGraphCircleNodeOrderRank(cy: Core): Map<string, number> {
  const rank = new Map<string, number>();
  const nodes = cy.nodes().not(':parent');
  if (nodes.length === 0) return rank;

  const ids = nodes.map((n) => n.id());
  const adj = new Map<string, Set<string>>();
  for (const id of ids) {
    adj.set(id, new Set());
  }
  cy.edges().forEach((e) => {
    const s = e.source().id();
    const t = e.target().id();
    if (s === t) return;
    adj.get(s)?.add(t);
    adj.get(t)?.add(s);
  });

  const degree = (id: string) => adj.get(id)?.size ?? 0;

  const components = splitUndirectedComponents(ids, adj);
  const ordered: string[] = [];
  for (const comp of components) {
    ordered.push(...orderComponentDfs(comp, adj, degree));
  }
  ordered.forEach((id, i) => rank.set(id, i));
  return rank;
}

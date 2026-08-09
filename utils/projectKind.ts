import type { Project, ProjectKind, ViewMode } from '../types';

export function isProjectKind(value: unknown): value is ProjectKind {
  return value === 'mapping' || value === 'graph';
}

/**
 * 导入/导出/落盘用：仅保留合法值；无效或缺省 → undefined（打开时再询问，不静默猜测）。
 */
export function sanitizeProjectKind(value: unknown): ProjectKind | undefined {
  return isProjectKind(value) ? value : undefined;
}

/** 旧项目或未写入 projectKind 时需询问归类 */
export function needsProjectKindPrompt(project: Pick<Project, 'projectKind'> | null | undefined): boolean {
  if (!project) return false;
  return !isProjectKind(project.projectKind);
}

export function defaultViewModeForKind(kind: ProjectKind): ViewMode {
  return kind === 'graph' ? 'graph' : 'map';
}

export function isViewModeAllowedForKind(kind: ProjectKind, mode: ViewMode): boolean {
  if (kind === 'graph') return mode === 'graph' || mode === 'board' || mode === 'table';
  return mode === 'map' || mode === 'board' || mode === 'table';
}

/** 无 kind 时按 mapping 工作流处理（仅用于未弹窗前的临时兜底，正常流程应先询问） */
export function resolveProjectKind(project: Pick<Project, 'projectKind'> | null | undefined): ProjectKind | null {
  if (!project) return null;
  return isProjectKind(project.projectKind) ? project.projectKind : null;
}

export function projectKindLabel(kind: ProjectKind): string {
  return kind === 'graph' ? 'Graph' : 'Mapping';
}

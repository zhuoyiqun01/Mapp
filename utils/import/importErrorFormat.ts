/**
 * 导入失败时生成带「出错位置」的说明，便于 AI / 人工改文件。
 */

export type ImportErrorDetail = {
  /** 简短标题 */
  title: string;
  /** 出错位置：JSON 路径、行号列号等 */
  location?: string;
  /** 补充说明 */
  detail?: string;
  /** 出错附近原文片段 */
  snippet?: string;
};

/** 拼成 alert / 对话框可读的多行文案 */
export function formatImportErrorMessage(err: ImportErrorDetail, fileName?: string): string {
  const lines: string[] = [err.title];
  if (fileName) lines.push(`文件：${fileName}`);
  if (err.location) lines.push(`位置：${err.location}`);
  if (err.detail) lines.push(err.detail);
  if (err.snippet) lines.push(`附近：${err.snippet}`);
  return lines.join('\n');
}

/** 由字符偏移推算 1-based 行号、列号 */
export function offsetToLineCol(text: string, offset: number): { line: number; column: number } {
  const safe = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let col = 1;
  for (let i = 0; i < safe; i++) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
      col = 1;
    } else {
      col += 1;
    }
  }
  return { line, column: col };
}

function extractJsonErrorOffset(message: string): number | null {
  const m = message.match(/position\s+(\d+)/i) ?? message.match(/at position\s+(\d+)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** 截取出错点附近一行可读片段 */
export function snippetAroundOffset(text: string, offset: number, radius = 40): string {
  const safe = Math.max(0, Math.min(offset, text.length));
  const start = Math.max(0, safe - radius);
  const end = Math.min(text.length, safe + radius);
  let snip = text.slice(start, end).replace(/\r\n/g, '\n').replace(/\n/g, '↵');
  if (start > 0) snip = '…' + snip;
  if (end < text.length) snip = snip + '…';
  return snip;
}

export function formatJsonParseFailure(text: string, error: unknown): ImportErrorDetail {
  const rawMsg = error instanceof Error ? error.message : String(error);
  const offset = extractJsonErrorOffset(rawMsg);
  if (offset != null) {
    const { line, column } = offsetToLineCol(text, offset);
    return {
      title: 'JSON 解析失败',
      location: `第 ${line} 行，第 ${column} 列（字符 ${offset}）`,
      detail: rawMsg,
      snippet: snippetAroundOffset(text, offset)
    };
  }
  return {
    title: 'JSON 解析失败',
    detail: rawMsg || '文件不是合法 JSON'
  };
}

/**
 * 全量项目导入：`{ version?, project: { name, … } }`
 */
export function validateFullProjectImportPayload(data: unknown): ImportErrorDetail | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return {
      title: '项目文件格式无效',
      location: '根节点',
      detail: '根节点须为 JSON 对象，例如 { "version": "1.0", "project": { … } }'
    };
  }
  const root = data as Record<string, unknown>;
  if (!('project' in root) || root.project == null) {
    return {
      title: '项目文件格式无效',
      location: 'project',
      detail: '缺少必填字段 project'
    };
  }
  if (typeof root.project !== 'object' || Array.isArray(root.project)) {
    return {
      title: '项目文件格式无效',
      location: 'project',
      detail: 'project 须为对象'
    };
  }
  const project = root.project as Record<string, unknown>;
  if (!('name' in project) || project.name == null || project.name === '') {
    return {
      title: '项目文件格式无效',
      location: 'project.name',
      detail: '缺少必填字段 project.name（非空字符串）'
    };
  }
  if (typeof project.name !== 'string') {
    return {
      title: '项目文件格式无效',
      location: 'project.name',
      detail: `project.name 须为字符串，当前为 ${typeof project.name}`
    };
  }
  return null;
}

/**
 * 便签合并导入：需要 project.notes 数组
 */
export function validateNotesOnlyImportPayload(data: unknown): ImportErrorDetail | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return {
      title: '无效的项目 JSON',
      location: '根节点',
      detail: '根节点须为对象，且含 project.notes 数组'
    };
  }
  const root = data as Record<string, unknown>;
  if (!('project' in root) || root.project == null) {
    return {
      title: '无效的项目 JSON',
      location: 'project',
      detail: '缺少字段 project（需要包含 project.notes 数组）'
    };
  }
  if (typeof root.project !== 'object' || Array.isArray(root.project)) {
    return {
      title: '无效的项目 JSON',
      location: 'project',
      detail: 'project 须为对象'
    };
  }
  const project = root.project as Record<string, unknown>;
  if (!('notes' in project) || project.notes == null) {
    return {
      title: '无效的项目 JSON',
      location: 'project.notes',
      detail: '缺少字段 project.notes'
    };
  }
  if (!Array.isArray(project.notes)) {
    return {
      title: '无效的项目 JSON',
      location: 'project.notes',
      detail: `project.notes 须为数组，当前为 ${typeof project.notes}`
    };
  }
  return null;
}

export function formatUnexpectedImportError(error: unknown, fileName?: string): string {
  const detail: ImportErrorDetail = {
    title: '导入失败',
    detail: error instanceof Error ? error.message : String(error || '请检查文件格式')
  };
  return formatImportErrorMessage(detail, fileName);
}

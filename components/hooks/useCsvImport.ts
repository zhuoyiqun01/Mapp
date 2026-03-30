import { useCallback } from 'react';
import type { Note, Project } from '../../types';
import { generateId } from '../../utils';
import { generateBoardSlotForImport } from '../../utils/import/projectDataImport';

interface UseCsvImportProps {
  project: Project;
  onUpdateProject?: (project: Project) => void | Promise<void>;
}

interface ParsedYears {
  startYear?: number;
  endYear?: number;
}

function textQualityScore(text: string): number {
  const cjkCount = (text.match(/[\u3400-\u4DBF\u4E00-\u9FFF]/g) || []).length;
  const replacementCount = (text.match(/�/g) || []).length;
  const controlCount = (text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) || []).length;
  return cjkCount * 3 - replacementCount * 4 - controlCount * 2;
}

function decodeCsvText(buffer: ArrayBuffer): string {
  const utf8Text = new TextDecoder('utf-8').decode(buffer);
  let bestText = utf8Text;
  let bestScore = textQualityScore(utf8Text);

  try {
    const gbText = new TextDecoder('gb18030').decode(buffer);
    const gbScore = textQualityScore(gbText);
    if (gbScore > bestScore) {
      bestText = gbText;
      bestScore = gbScore;
    }
  } catch (_error) {
    // ignore
  }

  return bestText.replace(/^\uFEFF/, '');
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  const normalized = text.replace(/^\uFEFF/, '');

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    const nextChar = normalized[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i += 1;
      }
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

function parseYears(timeText: string): ParsedYears {
  const matches = timeText.match(/\b\d{1,4}\b/g);
  if (!matches || matches.length === 0) {
    return {};
  }

  const numbers = matches
    .map((value) => parseInt(value, 10))
    .filter((value) => !Number.isNaN(value) && value >= 1 && value <= 9999);

  if (numbers.length === 0) {
    return {};
  }

  const startYear = numbers[0];
  const endYear = numbers.length > 1 && numbers[1] !== startYear ? numbers[1] : undefined;
  return { startYear, endYear };
}

function applyLinkToSegment(segment: string, url: string): string {
  const safeUrl = url.trim();
  if (!safeUrl) return segment;

  const headingMatch = segment.match(/^(#{1,6})\s+(.+)$/);
  if (headingMatch) {
    const [, hashes, content] = headingMatch;
    return `${hashes} [${content}](${safeUrl})`;
  }

  return `[${segment}](${safeUrl})`;
}

type ColumnMarker = 'paragraph' | 'url' | 'time' | 'heading' | 'lat' | 'lng';

interface ParsedRecord {
  markdown: string;
  startYear?: number;
  endYear?: number;
  mapCoords: { lat: number; lng: number } | null;
}

function mapMarker(rawMarker: string): { type: ColumnMarker; headingPrefix?: string } {
  const marker = rawMarker.trim().toLowerCase();
  if (!marker) return { type: 'paragraph' };
  if (marker === 'url') return { type: 'url' };
  if (marker === 'time') return { type: 'time' };
  if (marker === 'lat' || marker === 'latitude') return { type: 'lat' };
  if (marker === 'lng' || marker === 'longitude' || marker === 'lon') return { type: 'lng' };
  if (/^#+$/.test(marker)) return { type: 'heading', headingPrefix: marker };
  return { type: 'paragraph' };
}

function parseCoordinateCell(value: string): number | null {
  const t = value.trim().replace(',', '.');
  if (!t) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

function parseRowToRecord(row: string[], rawMarkers: string[]): ParsedRecord | null {
  const segments: string[] = [];
  const timeValues: string[] = [];
  let previousSegmentIndex: number | null = null;
  let latVal: number | null = null;
  let lngVal: number | null = null;

  for (let colIndex = 0; colIndex < rawMarkers.length; colIndex += 1) {
    const rawValue = (row[colIndex] || '').trim();
    if (!rawValue) continue;

    const markerInfo = mapMarker(rawMarkers[colIndex] || '');
    if (markerInfo.type === 'lat') {
      latVal = parseCoordinateCell(rawValue);
      continue;
    }
    if (markerInfo.type === 'lng') {
      lngVal = parseCoordinateCell(rawValue);
      continue;
    }

    if (markerInfo.type === 'heading') {
      segments.push(`${markerInfo.headingPrefix} ${rawValue}`);
      previousSegmentIndex = segments.length - 1;
      continue;
    }

    if (markerInfo.type === 'paragraph') {
      segments.push(rawValue);
      previousSegmentIndex = segments.length - 1;
      continue;
    }

    if (markerInfo.type === 'time') {
      timeValues.push(rawValue);
      continue;
    }

    if (markerInfo.type === 'url') {
      if (previousSegmentIndex != null) {
        segments[previousSegmentIndex] = applyLinkToSegment(segments[previousSegmentIndex], rawValue);
      } else {
        segments.push(rawValue);
        previousSegmentIndex = segments.length - 1;
      }
      continue;
    }

    segments.push(rawValue);
    previousSegmentIndex = segments.length - 1;
  }

  const timeText = timeValues.join(' / ');
  const markdown = segments.join('\n').trim();
  if (!markdown) return null;

  const parsedYears = parseYears(timeText);

  let mapCoords: { lat: number; lng: number } | null = null;
  if (latVal != null && lngVal != null) {
    mapCoords = { lat: latVal, lng: lngVal };
  }

  return {
    markdown,
    startYear: parsedYears.startYear,
    endYear: parsedYears.endYear,
    mapCoords
  };
}

export function useCsvImport({ project, onUpdateProject }: UseCsvImportProps) {
  const handleCsvImport = useCallback(
    async (file: File) => {
      if (!project?.id) {
        alert('请先打开一个项目再导入 CSV');
        return;
      }
      try {
        const buffer = await file.arrayBuffer();
        const decodedText = decodeCsvText(buffer);
        const rows = parseCsv(decodedText).filter((row) => row.some((cell) => cell.trim().length > 0));

        if (rows.length < 2) {
          alert('CSV 需包含一行表头（标记行）和至少一行数据。');
          return;
        }

        const markers = rows[0];
        const records: ParsedRecord[] = [];

        for (let i = 1; i < rows.length; i += 1) {
          const record = parseRowToRecord(rows[i], markers);
          if (record) records.push(record);
        }

        if (records.length === 0) {
          alert('没有解析到有效数据行。');
          return;
        }

        const batchKeys = new Set<string>();
        const existingNotes = project.notes || [];

        const newNotes: Note[] = records
          .map((record, index) => {
            const coord = record.mapCoords ?? { lat: 0, lng: 0 };
            const locKey = record.mapCoords
              ? `${coord.lat.toFixed(5)}::${coord.lng.toFixed(5)}`
              : `noloc::${index}`;
            const dedupeKey = `${record.markdown}::${locKey}`;
            if (batchKeys.has(dedupeKey)) return null;
            batchKeys.add(dedupeKey);

            const boardPos = generateBoardSlotForImport(existingNotes.length + index);

            return {
              id: generateId(),
              createdAt: Date.now() + index,
              coords: coord,
              emoji: '',
              text: record.markdown,
              fontSize: 3,
              isFavorite: false,
              color: '#FFFDF5',
              images: [],
              tags: [],
              boardX: boardPos.boardX,
              boardY: boardPos.boardY,
              variant: 'standard',
              startYear: record.startYear,
              endYear: record.endYear
            } satisfies Note;
          })
          .filter((note) => note != null) as Note[];

        if (newNotes.length === 0) {
          alert('本批全部为重复行，未导入。');
          return;
        }

        await onUpdateProject?.({
          ...project,
          notes: [...existingNotes, ...newNotes]
        });

        alert(`已成功导入 ${newNotes.length} 条便签（无坐标的不显示在地图上）。`);
      } catch (error) {
        console.error('Failed to import CSV:', error);
        alert('CSV 导入失败，请检查格式。');
      }
    },
    [onUpdateProject, project]
  );

  return { handleCsvImport };
}

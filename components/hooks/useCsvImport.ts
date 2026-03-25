import { useCallback } from 'react';
import type L from 'leaflet';
import type { Note, Project } from '../../types';
import { generateId } from '../../utils';

interface UseCsvImportProps {
  project: Project;
  onUpdateProject?: (project: Project) => void;
  mapInstance: L.Map | null;
}

interface ParsedYears {
  startYear?: number;
  endYear?: number;
  sortValue: number | null;
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

  // Excel/Windows 导出的中文 CSV 经常是 GBK/GB18030 编码。
  try {
    const gbText = new TextDecoder('gb18030').decode(buffer);
    const gbScore = textQualityScore(gbText);
    if (gbScore > bestScore) {
      bestText = gbText;
      bestScore = gbScore;
    }
  } catch (_error) {
    // 某些环境可能不支持 gb18030，忽略后继续使用 utf-8。
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
    return { sortValue: null };
  }

  const numbers = matches
    .map((value) => parseInt(value, 10))
    .filter((value) => !Number.isNaN(value) && value >= 1 && value <= 9999);

  if (numbers.length === 0) {
    return { sortValue: null };
  }

  const startYear = numbers[0];
  const endYear = numbers.length > 1 && numbers[1] !== startYear ? numbers[1] : undefined;
  return {
    startYear,
    endYear,
    sortValue: startYear
  };
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

type ColumnMarker = 'paragraph' | 'url' | 'time' | 'heading';

interface ParsedRecord {
  markdown: string;
  startYear?: number;
  endYear?: number;
  sortValue: number | null;
}

function mapMarker(rawMarker: string): { type: ColumnMarker; headingPrefix?: string } {
  const marker = rawMarker.trim().toLowerCase();
  if (!marker) return { type: 'paragraph' };
  if (marker === 'url') return { type: 'url' };
  if (marker === 'time') return { type: 'time' };
  if (/^#+$/.test(marker)) return { type: 'heading', headingPrefix: marker };
  // Any other header value defaults to a normal paragraph column.
  return { type: 'paragraph' };
}

function parseRowToRecord(
  row: string[],
  rawMarkers: string[],
  rowIndex: number,
  warnedMarkers: Set<string>
): ParsedRecord | null {
  const segments: string[] = [];
  const timeValues: string[] = [];
  let previousSegmentIndex: number | null = null;

  for (let colIndex = 0; colIndex < rawMarkers.length; colIndex += 1) {
    const rawValue = (row[colIndex] || '').trim();
    if (!rawValue) continue;

    const markerInfo = mapMarker(rawMarkers[colIndex] || '');
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
  return {
    markdown,
    startYear: parsedYears.startYear,
    endYear: parsedYears.endYear,
    sortValue: parsedYears.sortValue ?? rowIndex
  };
}

function buildCoordinates(
  mapInstance: L.Map,
  records: ParsedRecord[]
): Array<{ lat: number; lng: number }> {
  const bounds = mapInstance.getBounds();
  const west = bounds.getWest();
  const east = bounds.getEast();
  const north = bounds.getNorth();
  const south = bounds.getSouth();

  const lonSpan = Math.max(1e-6, east - west);
  const latSpan = Math.max(1e-6, north - south);

  const axisLeft = west + lonSpan * 0.05;
  const axisRight = east - lonSpan * 0.05;
  const topBase = north - latSpan * 0.07;
  const maxDown = north - latSpan * 0.35;

  const sortableValues = records
    .map((record, index) => ({ value: record.sortValue, index }))
    .filter((item) => item.value != null) as Array<{ value: number; index: number }>;

  let minValue = 0;
  let maxValue = 0;
  if (sortableValues.length > 0) {
    minValue = Math.min(...sortableValues.map((item) => item.value));
    maxValue = Math.max(...sortableValues.map((item) => item.value));
  }

  const valueRange = maxValue - minValue;
  const rowCount = records.length;

  return records.map((record, index) => {
    const fallbackRatio = rowCount <= 1 ? 0.5 : index / (rowCount - 1);
    const value = record.sortValue;
    const ratio =
      value == null || valueRange <= 0 ? fallbackRatio : (value - minValue) / valueRange;

    const lng = axisLeft + (axisRight - axisLeft) * Math.min(1, Math.max(0, ratio));
    const step = Math.min(latSpan * 0.025, latSpan * 0.25 / Math.max(1, rowCount - 1));
    const lat = Math.max(maxDown, topBase - index * step);

    return { lat, lng };
  });
}

function generateBoardPosition(index: number): { boardX: number; boardY: number } {
  const col = index % 6;
  const row = Math.floor(index / 6);
  return {
    boardX: 100 + col * 306,
    boardY: 100 + row * 306
  };
}

export function useCsvImport({ project, onUpdateProject, mapInstance }: UseCsvImportProps) {
  const handleCsvImport = useCallback(
    async (file: File) => {
      if (!mapInstance) {
        alert('Map is not ready yet, please retry in a moment.');
        return;
      }

      try {
        const buffer = await file.arrayBuffer();
        const decodedText = decodeCsvText(buffer);
        const rows = parseCsv(decodedText).filter((row) => row.some((cell) => cell.trim().length > 0));

        if (rows.length < 2) {
          alert('CSV must contain a marker row and at least one data row.');
          return;
        }

        const markers = rows[0];
        const warnedMarkers = new Set<string>();
        const records: ParsedRecord[] = [];

        for (let i = 1; i < rows.length; i += 1) {
          const record = parseRowToRecord(rows[i], markers, i - 1, warnedMarkers);
          if (record) records.push(record);
        }

        if (records.length === 0) {
          alert('No valid rows found in CSV.');
          return;
        }

        const coords = buildCoordinates(mapInstance, records);
        const batchKeys = new Set<string>();
        const existingNotes = project.notes || [];

        const newNotes: Note[] = records
          .map((record, index) => {
            const coord = coords[index];
            const dedupeKey = `${record.markdown}::${coord.lat.toFixed(5)}::${coord.lng.toFixed(5)}`;
            if (batchKeys.has(dedupeKey)) return null;
            batchKeys.add(dedupeKey);

            const boardPos = generateBoardPosition(index);

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
          .filter((note): note is Note => note != null);

        if (newNotes.length === 0) {
          alert('All parsed rows were duplicated in this import batch.');
          return;
        }

        onUpdateProject?.({
          ...project,
          notes: [...existingNotes, ...newNotes]
        });

        alert(`Successfully imported ${newNotes.length} note(s) from CSV.`);
      } catch (error) {
        console.error('Failed to import CSV:', error);
        alert('Failed to import CSV. Please check the file format.');
      }
    },
    [mapInstance, onUpdateProject, project]
  );

  return { handleCsvImport };
}

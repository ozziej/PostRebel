// Parses an external CSV/JSON data file into one variable-override row per
// record, for running a Collection Runner flow once per row.

export interface DataFileParseResult {
  rows: Record<string, string>[];
  errors: string[];
}

export function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const len = content.length;

  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  while (i < len) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { pushField(); i++; continue; }
    if (ch === '\r') { i++; continue; } // normalize CRLF -> LF
    if (ch === '\n') { pushRow(); i++; continue; }
    field += ch; i++;
  }
  // trailing field/row, unless the file ended cleanly right after a newline
  if (field !== '' || row.length > 0) pushRow();

  return rows.filter(r => !(r.length === 1 && r[0] === ''));
}

export function csvRowsToRecords(rows: string[][]): Record<string, string>[] {
  if (rows.length === 0) return [];
  const [header, ...dataRows] = rows;
  return dataRows.map(cols => {
    const record: Record<string, string> = {};
    header.forEach((key, idx) => {
      if (key.trim()) record[key.trim()] = cols[idx] ?? '';
    });
    return record;
  });
}

export function parseDataRows(content: string, format: 'csv' | 'json'): DataFileParseResult {
  if (format === 'json') {
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (e: any) {
      return { rows: [], errors: [`Invalid JSON data file: ${e.message}`] };
    }
    if (!Array.isArray(parsed)) {
      return { rows: [], errors: ['JSON data file must be an array of objects'] };
    }
    const rows: Record<string, string>[] = parsed.map((item: any) => {
      const record: Record<string, string> = {};
      if (item && typeof item === 'object') {
        for (const [key, value] of Object.entries(item)) {
          record[key] = value != null && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
        }
      }
      return record;
    });
    return { rows, errors: [] };
  }

  return { rows: csvRowsToRecords(parseCsv(content)), errors: [] };
}

export function detectDataFileFormat(filename: string): 'csv' | 'json' {
  return filename.toLowerCase().endsWith('.json') ? 'json' : 'csv';
}

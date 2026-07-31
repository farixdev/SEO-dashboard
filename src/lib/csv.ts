/* ────────────────────────────────────────────────────────────────
   CSV / TSV parsing for the paste-import flow, plus CSV generation
   for exports. RFC 4180 quoting, auto delimiter detection.
   ──────────────────────────────────────────────────────────────── */

export type ParsedTable = {
  headers: string[];
  rows: Record<string, string>[];
  /** rows as raw arrays, for headerless pastes */
  matrix: string[][];
  delimiter: string;
};

function detectDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/, 1)[0] ?? "";
  const counts: Record<string, number> = {
    "\t": 0,
    ",": 0,
    ";": 0,
    "|": 0,
  };
  let inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch]++;
  }
  // Tabs win when present — that is what a spreadsheet paste produces.
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : ",";
}

/** Full RFC-4180 tokeniser: handles quoted fields, escaped quotes, CRLF. */
export function parseDelimited(text: string, delimiter?: string): string[][] {
  const content = text.replace(/^\ufeff/, "");
  const sep = delimiter ?? detectDelimiter(content);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];

    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // handled by the \n branch
    } else {
      field += ch;
    }
  }

  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Normalises a header cell so "On Page \nStatus" matches "onpagestatus". */
export function normaliseHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[\s\n\r]+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim()
    .replace(/ /g, "");
}

export function parseTable(text: string, delimiter?: string): ParsedTable {
  const matrix = parseDelimited(text, delimiter);
  if (!matrix.length) {
    return { headers: [], rows: [], matrix: [], delimiter: delimiter ?? "," };
  }

  const headers = matrix[0].map((h) => h.trim());
  const normalised = headers.map(normaliseHeader);
  const rows = matrix.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    normalised.forEach((key, i) => {
      if (key) record[key] = (cells[i] ?? "").trim();
    });
    return record;
  });

  return {
    headers,
    rows,
    matrix,
    delimiter: delimiter ?? detectDelimiter(text),
  };
}

/**
 * Reads a value by any of several header aliases — the workbook's headers do
 * not match what someone would type, so importers list both.
 */
export function pick(
  row: Record<string, string>,
  ...aliases: string[]
): string | undefined {
  for (const alias of aliases) {
    const key = normaliseHeader(alias);
    const value = row[key];
    if (value !== undefined && value !== "") return value;
  }
  return undefined;
}

/* ── Export ────────────────────────────────────────────────────── */

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: { key: keyof T | string; header: string; format?: (row: T) => unknown }[],
): string {
  const head = columns.map((c) => escapeCsv(c.header)).join(",");
  const body = rows.map((row) =>
    columns
      .map((c) => escapeCsv(c.format ? c.format(row) : row[c.key as keyof T]))
      .join(","),
  );
  // Excel needs the BOM to read UTF-8 without mangling accents.
  return `\ufeff${[head, ...body].join("\r\n")}\r\n`;
}

export function csvResponse(csv: string, filename: string) {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}



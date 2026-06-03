/** Helpers for table/array fields stored as JSON in form content. */

export type IcsTableRow = Record<string, string>;

export function parseTableField(value: string | undefined, columns: string[]): IcsTableRow[] {
  if (!value?.trim()) {
    return [emptyRow(columns)];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((row) => {
        const r = row as IcsTableRow;
        const out: IcsTableRow = {};
        for (const col of columns) {
          out[col] = r[col] ?? "";
        }
        return out;
      });
    }
  } catch {
    /* legacy plain text — single row */
  }
  return [{ ...emptyRow(columns), notes: value ?? "" }];
}

export function stringifyTableField(rows: IcsTableRow[]): string {
  const cleaned = rows.filter((row) =>
    Object.values(row).some((v) => String(v).trim() !== ""),
  );
  return JSON.stringify(cleaned.length > 0 ? cleaned : [rows[0] ?? {}]);
}

export function emptyRow(columns: string[]): IcsTableRow {
  const row: IcsTableRow = {};
  for (const c of columns) row[c] = "";
  return row;
}

export function ensureRowCount(
  rows: IcsTableRow[],
  min: number,
  columns: string[],
): IcsTableRow[] {
  const next = [...rows];
  while (next.length < min) next.push(emptyRow(columns));
  return next;
}

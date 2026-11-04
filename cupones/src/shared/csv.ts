// Lector CSV mínimo (RFC 4180): comillas, comillas escapadas, BOM, y delimitador , ; o tab
// (Excel en español exporta con ;). Todo valor queda como TEXTO: nunca se convierte a número,
// así "00012345" conserva sus ceros.

export const MAX_IMPORT_ROWS = 2000;

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [";", "\t", ","].reduce(
    (best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best),
    ",",
  );
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export interface ImportRow {
  /** Número de fila tal como la ve la persona en su archivo (1 = primera línea). */
  rowNumber: number;
  code: string;
  error: string | null;
}

const HEADER_NAMES = ["codigo", "código", "code", "cupon", "cupón"];

/** Extrae y valida los códigos de un CSV para una campaña con `codeLength` dígitos. */
export function parseCouponCsv(text: string, codeLength: number): { rows: ImportRow[]; tooManyRows: boolean } {
  const table = parseCsv(text);
  let start = 0;
  let col = 0;
  const first = table[0];
  if (first && !/^\s*\d+\s*$/.test(first[0] ?? "")) {
    const idx = first.findIndex((h) => HEADER_NAMES.includes(h.trim().toLowerCase()));
    if (idx >= 0) col = idx;
    start = 1;
  }
  const rows: ImportRow[] = [];
  const seen = new Map<string, number>();
  for (let i = start; i < table.length; i++) {
    const cells = table[i]!;
    if (cells.every((c) => c.trim() === "")) continue;
    const code = (cells[col] ?? "").trim();
    const rowNumber = i + 1;
    let error: string | null = null;
    if (code === "") error = "Falta el código.";
    else if (!/^\d+$/.test(code)) error = "El código debe tener solo números.";
    else if (code.length !== codeLength)
      error = `Longitud incorrecta: tiene ${code.length} dígitos y la campaña exige ${codeLength} (si usaste Excel, formatea la columna como Texto para no perder ceros iniciales).`;
    else if (seen.has(code)) error = `Código repetido en el archivo (primera aparición en la fila ${seen.get(code)}).`;
    else seen.set(code, rowNumber);
    rows.push({ rowNumber, code, error });
  }
  return { rows, tooManyRows: rows.length > MAX_IMPORT_ROWS };
}

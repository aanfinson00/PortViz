/**
 * Tiny CSV writer. Handles field quoting (quotes, commas, newlines) but does
 * not attempt to support exotic encodings — plain UTF-8 output.
 */
export function toCsv(
  rows: Array<Record<string, string | number | null | undefined>>,
  columns: { key: string; label: string }[],
): string {
  const header = columns.map((c) => quote(c.label)).join(",");
  const body = rows
    .map((r) =>
      columns
        .map((c) => {
          const v = r[c.key];
          if (v === null || v === undefined) return "";
          return quote(String(v));
        })
        .join(","),
    )
    .join("\n");
  return `${header}\n${body}\n`;
}

function quote(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const money = (v: number | string | null | undefined, currency = "$") =>
  v == null ? "N/A" : `${currency}${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const moneyShort = (v: number | string | null | undefined, currency = "$") => {
  if (v == null) return "N/A";
  const n = Number(v);
  if (n >= 1000) return `${currency}${(n / 1000).toFixed(1)}k`;
  return `${currency}${n.toFixed(0)}`;
};

export const whole = (v: number | string | null | undefined) => (v == null ? "N/A" : Math.round(Number(v)).toLocaleString("en-US"));

export const compact = (v: number | string | null | undefined) => {
  if (v == null) return "N/A";
  const n = Number(v);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return Math.round(n).toLocaleString("en-US");
};

export const pct = (v: number | string | null | undefined, digits = 2) => (v == null ? "N/A" : `${Number(v).toFixed(digits)}%`);

export const ratio = (v: number | string | null | undefined, digits = 2) => (v == null ? "N/A" : `${Number(v).toFixed(digits)}×`);

export const ago = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "hozir";
  if (min < 60) return `${min} daqiqa oldin`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} soat oldin`;
  const d = Math.floor(h / 24);
  return `${d} kun oldin`;
};

export const dateLabel = (iso: string | null | undefined) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("uz-UZ", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

export function downloadCsv(filename: string, rows: (string | number | null)[][]) {
  const csv = rows
    .map((r) => r.map((cell) => (cell == null ? "" : `"${String(cell).replace(/"/g, '""')}"`)).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

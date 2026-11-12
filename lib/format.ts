/** French formatting helpers — the dashboard speaks the repository's language. */

const nf = (min: number, max = min) =>
  new Intl.NumberFormat("fr-FR", { minimumFractionDigits: min, maximumFractionDigits: max });

export const f2 = (x: number | null | undefined) =>
  x === null || x === undefined ? "—" : nf(2).format(x);

export const f3 = (x: number | null | undefined) =>
  x === null || x === undefined ? "—" : nf(3).format(x);

export const f4 = (x: number | null | undefined) =>
  x === null || x === undefined ? "—" : nf(4).format(x);

export const f5 = (x: number | null | undefined) =>
  x === null || x === undefined ? "—" : nf(5).format(x);

/** 1 913 099 418 */
export const int = (x: number | null | undefined) =>
  x === null || x === undefined ? "—" : nf(0).format(x);

/** 1,91 Md / 746,6 M — French scale */
export function compact(x: number | null | undefined): string {
  if (x === null || x === undefined) return "—";
  if (x >= 1e9) return `${nf(2).format(x / 1e9)} Md`;
  if (x >= 1e6) return `${nf(1).format(x / 1e6)} M`;
  if (x >= 1e3) return `${nf(0).format(x / 1e3)} k`;
  return nf(0).format(x);
}

/** 2,63 s/step */
export const secs = (x: number | null | undefined) =>
  x === null || x === undefined ? "—" : `${nf(2).format(x)} s`;

/** 30,1 h */
export const hours = (x: number | null | undefined) =>
  x === null || x === undefined ? "—" : `${nf(1).format(x)} h`;

/** 12 345 → "12 345" (thin space) */
export const step = (x: number | null | undefined) =>
  x === null || x === undefined ? "—" : nf(0).format(x);

/** +0,0045 / −0,0016 */
export function delta(x: number | null | undefined, digits = 4): string {
  if (x === null || x === undefined) return "—";
  const s = nf(digits).format(Math.abs(x));
  return `${x >= 0 ? "+" : "−"}${s}`;
}

/** 2026-11-11 13:05:36 → "11 nov. 13:05" */
export function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** seconds → "1 h 21" / "4 min 12" */
export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} j ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min ${s % 60} s`;
}

/** percent with the French decimal comma */
export const pct = (x: number | null | undefined, digits = 1) =>
  x === null || x === undefined ? "—" : `${nf(digits).format(x)} %`;

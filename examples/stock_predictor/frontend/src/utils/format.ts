export function pct(value: number | null | undefined, decimals = 1): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(decimals)}%`;
}

export function pctSigned(value: number | null | undefined, decimals = 2): string {
  if (value == null) return "—";
  const v = value * 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(decimals)}%`;
}

export function num(value: number | null | undefined, decimals = 2): string {
  if (value == null) return "—";
  return value.toFixed(decimals);
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "./api";

/** GET con estados de carga/error; vuelve a pedir cuando cambia `path` (null = no pedir). */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<T>("GET", path)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(errorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}

/** Días consecutivos YYYY-MM-DD entre dos fechas (inclusive), con ceros donde no hubo canjes. */
export function fillDays(rows: { date: string; count: number }[]): { label: string; value: number }[] {
  if (rows.length === 0) return [];
  const map = new Map(rows.map((r) => [r.date, r.count]));
  const out: { label: string; value: number }[] = [];
  const end = Date.parse(`${rows[rows.length - 1]!.date}T00:00:00Z`);
  for (let t = Date.parse(`${rows[0]!.date}T00:00:00Z`); t <= end && out.length < 400; t += 86400_000) {
    const d = new Date(t).toISOString().slice(0, 10);
    out.push({ label: d, value: map.get(d) ?? 0 });
  }
  return out;
}

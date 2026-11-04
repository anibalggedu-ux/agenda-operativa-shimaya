import { STATE_ORDER, STATE_SHORT, type CouponState } from "../shared/types";
import { stateIcon } from "./ui";
import { num, pct } from "./ui";

// Gráficos SVG propios (sin librerías): ligeros en celular, accesibles (resumen en texto + tabla de datos)
// y sin estilos en línea (CSP estricta). Los colores vienen de clases CSS con variables de la paleta.

function niceMax(v: number): number {
  if (v <= 5) return 5;
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p) * p;
}

export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="datos">
      <summary>Ver datos en tabla</summary>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={h} className={i > 0 ? "num" : ""}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className={j > 0 ? "num" : ""}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function LineChart({ points, summary, valueLabel = "Canjes" }: { points: { label: string; value: number }[]; summary: string; valueLabel?: string }) {
  const W = 600, H = 220, L = 36, R = 12, T = 12, B = 28;
  const max = niceMax(Math.max(1, ...points.map((p) => p.value)));
  const x = (i: number) => (points.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (points.length - 1));
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const ticks = [0, max / 2, max];
  const labelIdx = Array.from(new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]));
  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="axis" x1={L} x2={W - R} y1={y(t)} y2={y(t)} />
            <text x={L - 6} y={y(t) + 4} textAnchor="end">
              {Math.round(t)}
            </text>
          </g>
        ))}
        <path className="line" d={d} />
        {points.length <= 45 && points.map((p, i) => <circle key={p.label} className="dot" cx={x(i)} cy={y(p.value)} r={3.5} />)}
        {labelIdx.map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}>
            {points[i]?.label}
          </text>
        ))}
      </svg>
      <DataTable head={["Fecha", valueLabel]} rows={points.map((p) => [p.label, p.value])} />
    </div>
  );
}

export function HourBars({ hours }: { hours: { hour: number; count: number }[] }) {
  const W = 600, H = 180, L = 30, R = 8, T = 10, B = 26;
  const max = niceMax(Math.max(1, ...hours.map((h) => h.count)));
  const bw = (W - L - R) / 24;
  const peak = hours.reduce((a, b) => (b.count > a.count ? b : a), hours[0]!);
  const summary = peak.count > 0 ? `Canjes por hora del día (hora de Lima). La hora con más canjes es las ${peak.hour}:00 con ${peak.count}.` : "Canjes por hora del día: sin datos.";
  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
        <line className="axis" x1={L} x2={W - R} y1={H - B} y2={H - B} />
        {[0, max].map((t) => (
          <text key={t} x={L - 5} y={H - B - (t / max) * (H - T - B) + 4} textAnchor="end">
            {t}
          </text>
        ))}
        {hours.map((h) => {
          const bh = (h.count / max) * (H - T - B);
          return (
            <g key={h.hour}>
              <rect className="bar" x={L + h.hour * bw + 2} y={H - B - bh} width={bw - 4} height={Math.max(bh, 0)} rx={2} />
              {h.hour % 3 === 0 && (
                <text x={L + h.hour * bw + bw / 2} y={H - 8} textAnchor="middle">
                  {h.hour}h
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <DataTable head={["Hora (Lima)", "Canjes"]} rows={hours.map((h) => [`${String(h.hour).padStart(2, "0")}:00`, h.count])} />
    </div>
  );
}

export function CampaignBars({ rows }: { rows: { name: string; issued: number; redeemed: number; redemptionRate: number | null }[] }) {
  const rowH = 58, W = 600, L = 8, R = 8;
  const max = Math.max(1, ...rows.map((r) => r.issued));
  const bar = (v: number) => ((W - L - R) * v) / max;
  const summary = `Comparación de ${rows.length} campaña(s): cupones emitidos frente a canjeados.`;
  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${W} ${rows.length * rowH + 6}`} role="img" aria-label={summary}>
        {rows.map((r, i) => {
          const y0 = i * rowH;
          return (
            <g key={r.name + i}>
              <text className="bar-label" x={L} y={y0 + 14}>
                {r.name.length > 48 ? `${r.name.slice(0, 47)}…` : r.name}
              </text>
              <rect className="track" x={L} y={y0 + 20} width={W - L - R} height={12} rx={3} />
              <rect className="bar alt" x={L} y={y0 + 20} width={bar(r.issued)} height={12} rx={3} />
              <rect className="track" x={L} y={y0 + 36} width={W - L - R} height={12} rx={3} />
              <rect className="bar" x={L} y={y0 + 36} width={bar(r.redeemed)} height={12} rx={3} />
              <text className="bar-value" x={W - R} y={y0 + 14} textAnchor="end">
                Emitidos {num(r.issued)} · Canjeados {num(r.redeemed)} · {pct(r.redemptionRate)}
              </text>
            </g>
          );
        })}
      </svg>
      <ul className="legend small" aria-label="Leyenda">
        <li>
          <svg className="sw chart" viewBox="0 0 22 22" aria-hidden="true">
            <rect className="bar alt" width="22" height="12" y="5" rx="3" />
          </svg>
          Barra superior: cupones emitidos
        </li>
        <li>
          <svg className="sw chart" viewBox="0 0 22 22" aria-hidden="true">
            <rect className="bar" width="22" height="12" y="5" rx="3" />
          </svg>
          Barra inferior: cupones canjeados
        </li>
      </ul>
      <DataTable head={["Campaña", "Emitidos", "Canjeados", "Tasa de canje"]} rows={rows.map((r) => [r.name, r.issued, r.redeemed, pct(r.redemptionRate)])} />
    </div>
  );
}

export function StateDonut({ counts, total }: { counts: Record<CouponState, number>; total: number }) {
  const R = 52, C = 2 * Math.PI * R;
  let acc = 0;
  const summary = total
    ? `Distribución por estado de ${num(total)} cupones: ${STATE_ORDER.map((s) => `${STATE_SHORT[s]} ${counts[s]}`).join(", ")}.`
    : "Distribución por estado: sin cupones.";
  return (
    <div>
      <div className="donut-wrap">
        <svg className="chart" viewBox="0 0 140 140" role="img" aria-label={summary}>
          <circle className="track" cx="70" cy="70" r={R} fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="18" />
          {total > 0 &&
            STATE_ORDER.map((s) => {
              const len = (counts[s] / total) * C;
              const el = counts[s] > 0 && (
                <circle key={s} className={`seg-${s}`} cx="70" cy="70" r={R} fill="none" strokeWidth="18" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)" />
              );
              acc += len;
              return el;
            })}
          <text className="center-num" x="70" y="72" textAnchor="middle">
            {num(total)}
          </text>
          <text className="center-lbl" x="70" y="88" textAnchor="middle">
            cupones
          </text>
        </svg>
        <ul className="legend">
          {STATE_ORDER.map((s) => (
            <li key={s}>
              <svg className="sw" viewBox="0 0 22 22" aria-hidden="true">
                <rect className={`fill-${s}`} width="22" height="22" rx="5" />
              </svg>
              <span aria-hidden="true">{stateIcon(s)}</span> {STATE_SHORT[s]}
              <span className="n">
                {num(counts[s])}
                <span className="muted small"> ({total ? pct(counts[s] / total) : "—"})</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

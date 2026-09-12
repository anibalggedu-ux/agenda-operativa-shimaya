"use client";

import { useEffect, useState } from "react";
import { obtenerTendenciasTiendas, type TendenciasTiendas, type PuntoSemanalTienda } from "./actions";

type Metrica = "puntualidad" | "reportado" | "tardanzas";
type Modo = "tendencia" | "torres";

const METRICA_META: Record<
  Metrica,
  { label: string; suffix: string; max: number; meta: number; invertido: boolean }
> = {
  puntualidad: { label: "Puntualidad", suffix: "%", max: 100, meta: 85, invertido: false },
  reportado: { label: "Con observación", suffix: "%", max: 100, meta: 85, invertido: false },
  tardanzas: { label: "Tardanzas", suffix: "", max: 8, meta: 2, invertido: true },
};

const PALETA = [
  "#e23744", "#8b8d92", "#f1eee6", "#a6121d", "#c98a52",
  "#5a8fbf", "#8f6fd1", "#4fae7a", "#d9a441", "#7a9e9f",
  "#c2617e", "#6b7fd7", "#a3c95c", "#e0955f", "#8390a3",
];

function valorMetrica(metrica: Metrica, p: PuntoSemanalTienda): number | null {
  if (p.visitas === 0) return null;
  if (metrica === "puntualidad") return p.puntualidadPct;
  if (metrica === "reportado") return p.reportadoPct;
  return p.tardanzas;
}

function compuesto(p: PuntoSemanalTienda): number | null {
  if (p.visitas === 0) return null;
  const puntualidad = p.puntualidadPct ?? p.reportadoPct ?? 100;
  const reportado = p.reportadoPct ?? 100;
  const tardanza = Math.max(0, 100 - p.tardanzas * 14);
  return Math.round(puntualidad * 0.4 + reportado * 0.4 + tardanza * 0.2);
}

const RAMPA: [number, [number, number, number]][] = [
  [0, [166, 18, 29]],
  [45, [226, 55, 68]],
  [70, [90, 75, 69]],
  [100, [247, 245, 242]],
];

function colorParaScore(score: number): string {
  const s = Math.max(0, Math.min(100, score));
  for (let i = 0; i < RAMPA.length - 1; i++) {
    const [p1, c1] = RAMPA[i];
    const [p2, c2] = RAMPA[i + 1];
    if (s >= p1 && s <= p2) {
      const f = (s - p1) / (p2 - p1);
      const r = Math.round(c1[0] + (c2[0] - c1[0]) * f);
      const g = Math.round(c1[1] + (c2[1] - c1[1]) * f);
      const b = Math.round(c1[2] + (c2[2] - c1[2]) * f);
      return `rgb(${r},${g},${b})`;
    }
  }
  return "rgb(247,245,242)";
}
function textoParaScore(score: number): string {
  return score >= 60 ? "#18191d" : "#f7f5f2";
}

export default function TendenciasTiendas({ desde, hasta }: { desde: string; hasta: string }) {
  const [datos, setDatos] = useState<TendenciasTiendas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modo, setModo] = useState<Modo>("tendencia");
  const [metrica, setMetrica] = useState<Metrica>("puntualidad");
  const [seleccion, setSeleccion] = useState<Record<string, boolean>>({});
  const [semanaIdx, setSemanaIdx] = useState(0);

  useEffect(() => {
    setCargando(true);
    setError(null);
    obtenerTendenciasTiendas(desde, hasta)
      .then((d) => {
        setDatos(d);
        setSemanaIdx(d.semanas.length - 1);

        const deltas = d.tiendas.map((t) => {
          const primero = t.porSemana.find((p) => p.visitas > 0);
          const ultimo = [...t.porSemana].reverse().find((p) => p.visitas > 0);
          const c0 = primero ? compuesto(primero) : null;
          const c1 = ultimo ? compuesto(ultimo) : null;
          return { id: t.tiendaId, delta: c0 !== null && c1 !== null ? c1 - c0 : 0 };
        });
        const ordenado = [...deltas].sort((a, b) => b.delta - a.delta);
        const inicial: Record<string, boolean> = {};
        if (ordenado[0]) inicial[ordenado[0].id] = true;
        if (ordenado.length > 1) inicial[ordenado[ordenado.length - 1].id] = true;
        setSeleccion(inicial);
        setModo("tendencia");
      })
      .catch((e) => setError(e.message || "Error al cargar las tendencias por tienda."))
      .finally(() => setCargando(false));
  }, [desde, hasta]);

  if (cargando) return <p className="text-marca-tenue text-sm animate-pulse">Cargando tendencias...</p>;
  if (error) return <p className="text-marca-rojoclaro text-sm">{error}</p>;
  if (!datos || datos.tiendas.length === 0) {
    return <p className="text-marca-tenue text-sm italic">No hay visitas registradas en este rango.</p>;
  }

  const { semanas, tiendas } = datos;
  const meta = METRICA_META[metrica];

  function toggleTienda(id: string) {
    setSeleccion((s) => ({ ...s, [id]: !s[id] }));
    setModo("tendencia");
  }
  function elegirSemana(i: number) {
    setSemanaIdx(i);
    setModo("torres");
  }

  // ---------- SVG lineas ----------
  const W = 680, H = 260, padL = 32, padR = 12, padT = 12, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  function xFor(i: number) { return padL + (plotW * i) / Math.max(1, semanas.length - 1); }
  function yFor(v: number) { return padT + plotH - (plotH * Math.min(v, meta.max)) / meta.max; }
  const yTicks = metrica === "tardanzas" ? [0, 2, 4, 6, 8] : [0, 25, 50, 75, 100];

  const tiendasSeleccionadas = tiendas.filter((t) => seleccion[t.tiendaId]);

  function pathParaTienda(t: (typeof tiendas)[number]): string[] {
    const segmentos: string[] = [];
    let actual: string[] = [];
    t.porSemana.forEach((p, i) => {
      const v = valorMetrica(metrica, p);
      if (v === null) {
        if (actual.length > 1) segmentos.push(actual.join(" "));
        actual = [];
        return;
      }
      actual.push(`${actual.length === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`);
    });
    if (actual.length > 1) segmentos.push(actual.join(" "));
    return segmentos;
  }

  // ---------- torres ----------
  const filasTorres = tiendas
    .map((t) => ({ t, v: valorMetrica(metrica, t.porSemana[semanaIdx]) }))
    .filter((r) => r.v !== null)
    .sort((a, b) => (meta.invertido ? (a.v! - b.v!) : (b.v! - a.v!)));
  const maxAltura = 180;

  return (
    <div className="space-y-6">
      {/* Panorama / heatmap */}
      <div>
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-1">
          <h4 className="text-marca-tenue text-[11px]">
            Puntaje compuesto = puntualidad + reportado (con observación) − tardanzas
          </h4>
        </div>
        <p className="text-marca-tenue text-[11px] mb-3">
          Toca el nombre de una tienda para ver su tendencia abajo, o el encabezado de una semana
          para comparar todas las tiendas ese día.
        </p>
        <div className="overflow-x-auto">
          <table className="border-separate" style={{ borderSpacing: 2 }}>
            <thead>
              <tr>
                <th className="p-0"></th>
                {semanas.map((s, i) => (
                  <th
                    key={s.inicio}
                    onClick={() => elegirSemana(i)}
                    className={`px-1 py-1.5 text-[10px] font-mono font-medium cursor-pointer rounded-[2px] whitespace-nowrap transition ${
                      i === semanaIdx && modo === "torres"
                        ? "bg-marca-rojo text-white"
                        : "text-marca-tenue hover:bg-marca-superficie2 hover:text-marca-texto"
                    }`}
                  >
                    {s.etiqueta}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tiendas.map((t) => (
                <tr key={t.tiendaId}>
                  <td
                    onClick={() => toggleTienda(t.tiendaId)}
                    className={`px-2.5 text-[12.5px] font-semibold whitespace-nowrap cursor-pointer rounded-[2px] border-l-[3px] transition ${
                      seleccion[t.tiendaId]
                        ? "border-marca-rojoclaro bg-marca-superficie2 text-marca-textofuerte"
                        : "border-transparent text-marca-texto hover:bg-marca-superficie2"
                    }`}
                  >
                    {t.tiendaNombre}
                  </td>
                  {t.porSemana.map((p, i) => {
                    const score = compuesto(p);
                    return (
                      <td key={i}>
                        {score === null ? (
                          <div className="w-[52px] h-9 flex items-center justify-center rounded-[2px] bg-marca-fondo text-marca-tenue text-[11px]">
                            —
                          </div>
                        ) : (
                          <div
                            title={`${t.tiendaNombre} · ${semanas[i].etiqueta} · puntaje ${score} · ${p.visitas} visita(s)`}
                            className="w-[52px] h-9 flex items-center justify-center rounded-[2px] font-mono text-[11.5px] font-semibold"
                            style={{ background: colorParaScore(score), color: textoParaScore(score) }}
                          >
                            {score}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2 mt-3 text-[11px] text-marca-tenue">
          <span>0 (crítico)</span>
          <div
            className="w-28 h-2 rounded-full"
            style={{ background: "linear-gradient(90deg,#a6121d,#e23744 45%,#5a4b45 65%,#f7f5f2)" }}
          />
          <span>100 (excelente)</span>
        </div>
      </div>

      {/* Detalle */}
      <div className="bg-marca-fondo border border-marca-borde rounded-[3px] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="inline-flex border border-marca-borde rounded-[3px] overflow-hidden">
            {(["tendencia", "torres"] as Modo[]).map((m) => (
              <button
                key={m}
                onClick={() => setModo(m)}
                className={`px-3 py-1.5 text-[11.5px] font-bold transition ${
                  modo === m
                    ? "bg-marca-rojo text-white"
                    : "bg-marca-superficie2 text-marca-tenue hover:text-marca-texto"
                }`}
              >
                {m === "tendencia" ? "Tendencia en el tiempo" : "Comparación semanal"}
              </button>
            ))}
          </div>
          <div className="inline-flex border border-marca-borde rounded-[3px] overflow-hidden">
            {(Object.keys(METRICA_META) as Metrica[]).map((m) => (
              <button
                key={m}
                onClick={() => setMetrica(m)}
                className={`px-3 py-1.5 text-[11.5px] font-bold transition ${
                  metrica === m
                    ? "bg-marca-rojo text-white"
                    : "bg-marca-superficie2 text-marca-tenue hover:text-marca-texto"
                }`}
              >
                {METRICA_META[m].label}
              </button>
            ))}
          </div>
        </div>

        {modo === "tendencia" ? (
          <>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {tiendas.map((t, i) => (
                <button
                  key={t.tiendaId}
                  onClick={() => toggleTienda(t.tiendaId)}
                  className={`inline-flex items-center gap-1.5 border rounded-[3px] px-2.5 py-1 text-[11.5px] transition ${
                    seleccion[t.tiendaId]
                      ? "border-marca-borde bg-marca-superficie2 text-marca-texto"
                      : "border-marca-borde bg-marca-superficie2 text-marca-tenue opacity-40"
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: PALETA[i % PALETA.length] }}
                  />
                  {t.tiendaNombre}
                </button>
              ))}
            </div>

            {tiendasSeleccionadas.length === 0 ? (
              <p className="text-marca-tenue text-sm italic py-10 text-center">
                Toca una tienda arriba (o en el mapa de calor) para ver su tendencia.
              </p>
            ) : (
              <>
                <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ overflow: "visible", display: "block" }}>
                  {yTicks.map((v) => (
                    <g key={v}>
                      <line x1={padL} x2={W - padR} y1={yFor(v)} y2={yFor(v)} stroke="#2a2c31" strokeWidth={1} />
                      <text x={padL - 8} y={yFor(v) + 3} textAnchor="end" fontSize={10} fill="#8b8d92" fontFamily="monospace">
                        {v}
                      </text>
                    </g>
                  ))}
                  {semanas.map((s, i) => (
                    <text key={s.inicio} x={xFor(i)} y={H - 6} textAnchor="middle" fontSize={10} fill="#8b8d92" fontFamily="monospace">
                      {s.etiqueta}
                    </text>
                  ))}
                  <line
                    x1={padL} x2={W - padR} y1={yFor(meta.meta)} y2={yFor(meta.meta)}
                    stroke="#8b8d92" strokeWidth={1} strokeDasharray="3,4" opacity={0.6}
                  />
                  <text x={W - padR} y={yFor(meta.meta) - 5} textAnchor="end" fontSize={9.5} fill="#8b8d92" fontFamily="monospace">
                    meta {meta.invertido ? "≤" : "≥"}{meta.meta}{meta.suffix}
                  </text>

                  {tiendas.map((t, ti) => {
                    if (!seleccion[t.tiendaId]) return null;
                    const color = PALETA[ti % PALETA.length];
                    const ultimoPunto = [...t.porSemana].reverse().find((p) => p.visitas > 0);
                    const ultimoIdx = ultimoPunto ? t.porSemana.lastIndexOf(ultimoPunto) : -1;
                    return (
                      <g key={t.tiendaId}>
                        {pathParaTienda(t).map((d, si) => (
                          <path key={si} d={d} fill="none" stroke={color} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
                        ))}
                        {t.porSemana.map((p, i) => {
                          const v = valorMetrica(metrica, p);
                          if (v === null) return null;
                          return <circle key={i} cx={xFor(i)} cy={yFor(v)} r={3} fill={color} />;
                        })}
                        {ultimoPunto && ultimoIdx >= 0 && (
                          <text
                            x={xFor(ultimoIdx) + 6}
                            y={yFor(valorMetrica(metrica, ultimoPunto)!) + 3}
                            fontSize={10}
                            fill={color}
                            fontWeight={600}
                            fontFamily="monospace"
                          >
                            {valorMetrica(metrica, ultimoPunto)}{meta.suffix}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
                <TendenciaInsight tiendas={tiendasSeleccionadas} metrica={metrica} meta={meta} />
              </>
            )}
          </>
        ) : (
          <>
            <p className="text-marca-tenue text-[11px] mb-3">
              {meta.label} · semana del <span className="text-marca-texto font-semibold">{semanas[semanaIdx].etiqueta}</span>
            </p>
            {filasTorres.length === 0 ? (
              <p className="text-marca-tenue text-sm italic py-10 text-center">Sin datos para esa semana.</p>
            ) : (
              <>
                <div className="relative flex items-end gap-3 border-b border-marca-borde" style={{ height: maxAltura + 40 }}>
                  <div
                    className="absolute left-0 right-0 border-t border-dashed border-marca-tenue opacity-50"
                    style={{ bottom: (meta.meta / meta.max) * maxAltura }}
                  >
                    <span className="absolute right-0 -top-4 text-[9.5px] font-mono text-marca-tenue">
                      meta {meta.invertido ? "≤" : "≥"}{meta.meta}{meta.suffix}
                    </span>
                  </div>
                  {filasTorres.map((r) => {
                    const bien = meta.invertido ? r.v! <= meta.meta : r.v! >= meta.meta;
                    const cerca = meta.invertido ? r.v! <= meta.meta + 2 : r.v! >= meta.meta - 10;
                    const color = bien ? "#f1eee6" : cerca ? "#e23744" : "#a6121d";
                    const alturaPx = Math.min(maxAltura, Math.max(4, (r.v! / meta.max) * maxAltura));
                    return (
                      <div key={r.t.tiendaId} className="flex-1 flex flex-col items-center justify-end gap-2 h-full">
                        <span className="font-mono text-[12px] font-semibold text-marca-textofuerte">
                          {r.v}{meta.suffix}
                        </span>
                        <div
                          className="w-full max-w-[48px] rounded-t-[2px] transition-[height] duration-500"
                          style={{ height: alturaPx, background: color }}
                        />
                        <span className="text-[10.5px] text-marca-tenue text-center leading-tight">
                          {r.t.tiendaNombre}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 bg-marca-superficie2 border border-marca-borde rounded-[3px] px-3.5 py-2.5 text-[12.5px] text-marca-tenue leading-relaxed">
                  <span className="text-marca-textofuerte font-semibold">{filasTorres[0].t.tiendaNombre}</span> lidera con{" "}
                  {filasTorres[0].v}{meta.suffix}.{" "}
                  <span className="text-marca-rojoclaro font-semibold">
                    {filasTorres[filasTorres.length - 1].t.tiendaNombre}
                  </span>{" "}
                  queda en último lugar con {filasTorres[filasTorres.length - 1].v}{meta.suffix}.
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TendenciaInsight({
  tiendas,
  metrica,
  meta,
}: {
  tiendas: TendenciasTiendas["tiendas"];
  metrica: Metrica;
  meta: (typeof METRICA_META)[Metrica];
}) {
  const deltas = tiendas
    .map((t) => {
      const primero = t.porSemana.find((p) => p.visitas > 0);
      const ultimo = [...t.porSemana].reverse().find((p) => p.visitas > 0);
      const v0 = primero ? valorMetrica(metrica, primero) : null;
      const v1 = ultimo ? valorMetrica(metrica, ultimo) : null;
      return v0 !== null && v1 !== null ? { t: t.tiendaNombre, delta: v1 - v0 } : null;
    })
    .filter((d): d is { t: string; delta: number } => d !== null);

  if (deltas.length === 0) return null;

  const mejor = [...deltas].sort((a, b) => (meta.invertido ? a.delta - b.delta : b.delta - a.delta))[0];
  const mejorTxt = meta.invertido ? (mejor.delta < 0 ? "bajó" : "subió") : mejor.delta > 0 ? "subió" : "bajó";

  let extra = "";
  if (deltas.length > 1) {
    const peor = [...deltas].sort((a, b) => (meta.invertido ? b.delta - a.delta : a.delta - b.delta))[0];
    if (peor.t !== mejor.t) {
      const peorTxt = meta.invertido ? (peor.delta > 0 ? "subió" : "bajó") : peor.delta < 0 ? "bajó" : "subió";
      extra = ` ${peor.t} ${peorTxt} ${Math.abs(peor.delta)}${meta.suffix} en el mismo periodo.`;
    }
  }

  return (
    <div className="mt-3 bg-marca-superficie2 border border-marca-borde rounded-[3px] px-3.5 py-2.5 text-[12.5px] text-marca-tenue leading-relaxed">
      <span className="text-marca-textofuerte font-semibold">{mejor.t}</span> {mejorTxt}{" "}
      {Math.abs(mejor.delta)}
      {meta.suffix} en {meta.label.toLowerCase()} desde su primera semana con datos.
      {extra && <span className="text-marca-rojoclaro font-semibold">{extra}</span>}
    </div>
  );
}

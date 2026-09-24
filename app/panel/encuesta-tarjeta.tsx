"use client";

import { useState } from "react";
import { BarChart3, Lock } from "lucide-react";
import { votarEncuesta, type ComunicadoPublico, type EncuestaPublica } from "./anuncios-actions";
import { formatearFechaLegible, hoyPeru } from "@/lib/fechas";
import { reproducirSonidoExito } from "@/lib/sonido";

function textoCierre(cierra: string | null): string | null {
  if (!cierra) return null;
  if (cierra === hoyPeru()) return "Cierra hoy";
  return `Cierra el ${formatearFechaLegible(cierra)}`;
}

// Encuesta rápida dentro de Anuncios (estilo encuestas de WhatsApp): con
// una sola opción, un toque vota; con varias, se marcan y se confirma. Tras
// votar (o si la persona no está en el público) se ven los porcentajes.
export default function EncuestaTarjeta({ c }: { c: ComunicadoPublico & { encuesta: EncuestaPublica } }) {
  const [encuesta, setEncuesta] = useState(c.encuesta);
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const yaVote = encuesta.misVotos.length > 0;
  const verResultados = yaVote || !encuesta.puedoVotar;
  const totalVotos = encuesta.conteos.reduce((a, b) => a + b, 0);
  const cierre = textoCierre(encuesta.cierra);

  async function enviar(opciones: number[]) {
    if (enviando || opciones.length === 0) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await votarEncuesta(c.id, opciones);
      if (r.exito && r.encuesta) {
        setEncuesta(r.encuesta);
        reproducirSonidoExito();
      } else {
        setError(r.mensaje || "No se pudo registrar tu voto.");
      }
    } catch {
      setError("Sin conexión. Intenta de nuevo cuando tengas señal.");
    } finally {
      setEnviando(false);
    }
  }

  function tocarOpcion(i: number) {
    if (verResultados || enviando) return;
    if (!encuesta.multiple) {
      enviar([i]);
      return;
    }
    const siguiente = new Set(seleccion);
    if (siguiente.has(i)) siguiente.delete(i);
    else siguiente.add(i);
    setSeleccion(siguiente);
  }

  return (
    <div className="bg-marca-fondo border border-marca-borde rounded-[3px] p-4 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-marca-rojoclaro text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
          <BarChart3 className="w-3 h-3" /> Encuesta
        </p>
        {cierre && (
          <span className="text-[10px] font-bold text-emerald-400 border border-emerald-400/40 rounded-full px-2 py-0.5">
            {cierre}
          </span>
        )}
      </div>

      <p className="text-marca-textofuerte text-sm font-bold">{c.mensaje}</p>
      {encuesta.multiple && !verResultados && (
        <p className="text-marca-tenue text-[11px]">Puedes marcar varias opciones.</p>
      )}

      <div className="space-y-1.5">
        {encuesta.opciones.map((texto, i) => {
          const pct = totalVotos > 0 ? Math.round((encuesta.conteos[i] * 100) / totalVotos) : 0;
          const mia = encuesta.misVotos.includes(i);
          const marcada = seleccion.has(i);
          return (
            <button
              key={i}
              type="button"
              onClick={() => tocarOpcion(i)}
              disabled={verResultados || enviando}
              className={`relative w-full overflow-hidden text-left rounded-[3px] border px-3 py-2.5 text-sm transition flex items-center justify-between gap-2 ${
                mia || marcada
                  ? "border-marca-rojo"
                  : verResultados
                    ? "border-marca-borde"
                    : "border-marca-borde hover:border-marca-rojoclaro"
              } bg-marca-superficie2 disabled:cursor-default`}
            >
              {verResultados && (
                <span
                  className="absolute inset-y-0 left-0 bg-marca-rojo/20 transition-[width] duration-500"
                  style={{ width: `${pct}%` }}
                />
              )}
              <span className="relative text-marca-texto flex items-center gap-2 min-w-0">
                {encuesta.multiple && !verResultados && (
                  <span
                    className={`w-3.5 h-3.5 shrink-0 rounded-[2px] border ${
                      marcada ? "bg-marca-rojo border-marca-rojo" : "border-marca-tenue"
                    }`}
                  />
                )}
                <span className="break-words">{texto}</span>
              </span>
              {verResultados && (
                <span
                  className={`relative shrink-0 font-data text-xs tabular-nums ${
                    mia ? "text-marca-textofuerte font-bold" : "text-marca-tenue"
                  }`}
                >
                  {pct}%{mia ? " ✓" : ""}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {encuesta.multiple && !verResultados && (
        <button
          type="button"
          onClick={() => enviar(Array.from(seleccion))}
          disabled={seleccion.size === 0 || enviando}
          className="w-full bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-2.5 rounded-[3px] text-xs tracking-widest uppercase transition"
        >
          {enviando ? "Enviando..." : "Votar"}
        </button>
      )}

      {error && <p className="text-marca-rojoclaro text-xs font-bold">{error}</p>}

      <p className="text-marca-tenue text-[11px]">
        {encuesta.votantes === 1 ? "1 persona respondió" : `${encuesta.votantes} personas respondieron`}
        {yaVote
          ? " · Tu voto quedó registrado"
          : !encuesta.puedoVotar
            ? " · Solo ves los resultados"
            : enviando
              ? " · Enviando..."
              : encuesta.multiple
                ? ""
                : " · Toca una opción"}
      </p>
      {encuesta.anonima && (
        <p className="text-marca-tenue text-[10px] flex items-center gap-1.5">
          <Lock className="w-3 h-3" /> Anónima: en los resultados no aparece qué votó cada uno
        </p>
      )}
      <p className="text-marca-tenue text-[11px] capitalize">
        {formatearFechaLegible(c.fecha)}
        {c.autor ? " · " + c.autor : ""}
      </p>
    </div>
  );
}

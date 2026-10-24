"use client";

import { useEffect, useState } from "react";
import { esTemporadaHalloween, esTemporadaVerano } from "@/lib/fechas";

// Celebración dorada: se dispara sola cuando suena "logro" (checklist o
// auditoría con Excelente, puntos recibidos en regalo, o racha de historias
// que sube — ver lib/sonido.ts). Un solo componente, montado una vez en
// PanelShell, cubre los 4 casos sin tocar cada pantalla.
//
// En octubre, en vez de los cuadritos dorados caen hojas y murciélagos; de
// nov a mar caen hojas de palmera y soles — mismo mecanismo de caída
// (celebracion-cae), solo cambia qué partícula se dibuja. Octubre y verano
// nunca están activos a la vez (ver esTemporadaHalloween/esTemporadaVerano).
const CANTIDAD = 22;

type Particula = {
  id: number;
  izquierda: number;
  retraso: number;
  duracion: number;
  deriva: number;
  tamano: number;
  tipo: "cuadro" | "hoja" | "murcielago" | "palmera" | "sol";
};

export default function Celebracion() {
  const [particulas, setParticulas] = useState<Particula[] | null>(null);
  const [halloween, setHalloween] = useState(false);
  const [verano, setVerano] = useState(false);

  useEffect(() => {
    setHalloween(esTemporadaHalloween());
    setVerano(esTemporadaVerano());
  }, []);

  useEffect(() => {
    function alCelebrar() {
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
      const nuevas: Particula[] = Array.from({ length: CANTIDAD }).map((_, i) => ({
        id: Date.now() + i,
        izquierda: 2 + ((i * 43) % 96),
        retraso: (i % 7) * 0.05,
        duracion: 1.5 + (i % 5) * 0.25,
        deriva: (i % 2 === 0 ? 1 : -1) * (20 + (i % 6) * 12),
        tamano: i % 4 === 0 ? 7 : 5,
        tipo: halloween
          ? i % 3 === 0
            ? "murcielago"
            : "hoja"
          : verano
            ? i % 3 === 0
              ? "sol"
              : "palmera"
            : "cuadro",
      }));
      setParticulas(nuevas);
      window.setTimeout(() => setParticulas(null), 2400);
    }
    window.addEventListener("shimaya:celebracion", alCelebrar);
    return () => window.removeEventListener("shimaya:celebracion", alCelebrar);
  }, [halloween, verano]);

  if (!particulas) return null;

  const emojiPorTipo: Record<Particula["tipo"], string | null> = {
    cuadro: null,
    hoja: "🍂",
    murcielago: "🦇",
    palmera: "🌴",
    sol: "☀️",
  };

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[110] overflow-hidden">
      {particulas.map((p) => (
        <span
          key={p.id}
          className={
            p.tipo === "cuadro" ? "celebracion-particula" : `celebracion-particula celebracion-particula-${p.tipo}`
          }
          style={{
            left: `${p.izquierda}%`,
            fontSize: p.tipo === "cuadro" ? undefined : p.tamano + 6,
            width: p.tipo === "cuadro" ? p.tamano : undefined,
            height: p.tipo === "cuadro" ? p.tamano : undefined,
            animationDelay: `${p.retraso}s`,
            animationDuration: `${p.duracion}s`,
            // @ts-expect-error variable CSS propia, leída solo por el keyframe
            "--celebracion-deriva": `${p.deriva}px`,
          }}
        >
          {emojiPorTipo[p.tipo]}
        </span>
      ))}
    </div>
  );
}

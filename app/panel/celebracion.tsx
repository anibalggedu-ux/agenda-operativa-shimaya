"use client";

import { useEffect, useState } from "react";

// Celebración dorada: se dispara sola cuando suena "logro" (checklist o
// auditoría con Excelente, puntos recibidos en regalo, racha de historias
// que sube — ver lib/sonido.ts). Un solo componente, montado una vez en
// PanelShell, cubre los 4 casos sin tocar cada pantalla.
const CANTIDAD = 22;

type Particula = { id: number; izquierda: number; retraso: number; duracion: number; deriva: number; tamano: number };

export default function Celebracion() {
  const [particulas, setParticulas] = useState<Particula[] | null>(null);

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
      }));
      setParticulas(nuevas);
      window.setTimeout(() => setParticulas(null), 2400);
    }
    window.addEventListener("shimaya:celebracion", alCelebrar);
    return () => window.removeEventListener("shimaya:celebracion", alCelebrar);
  }, []);

  if (!particulas) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[110] overflow-hidden">
      {particulas.map((p) => (
        <span
          key={p.id}
          className="celebracion-particula"
          style={{
            left: `${p.izquierda}%`,
            width: p.tamano,
            height: p.tamano,
            animationDelay: `${p.retraso}s`,
            animationDuration: `${p.duracion}s`,
            // @ts-expect-error variable CSS propia, leída solo por el keyframe
            "--celebracion-deriva": `${p.deriva}px`,
          }}
        />
      ))}
    </div>
  );
}

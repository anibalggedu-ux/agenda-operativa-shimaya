"use client";

import { useEffect, useState } from "react";
import { brasasActivadas } from "@/lib/preferencias-visuales";

// Efecto ambiental "brasas": puntitos dorados que suben lento por la
// pantalla de Inicio, como brasas de carbón. Puramente decorativo — no
// bloquea toques (pointer-events-none) y respeta "reducir movimiento" y el
// interruptor de Mi perfil.
const CANTIDAD = 10;

export default function Brasas() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    setVisible(brasasActivadas());
  }, []);

  if (!visible) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {Array.from({ length: CANTIDAD }).map((_, i) => {
        const izquierda = 4 + ((i * 97) % 92);
        const duracion = 9 + (i % 5) * 2.3;
        const retraso = -(i * 1.7);
        const deriva = i % 2 === 0 ? 14 : -14;
        const tamano = i % 3 === 0 ? 4 : 3;
        return (
          <span
            key={i}
            className="brasa"
            style={{
              left: `${izquierda}%`,
              width: tamano,
              height: tamano,
              animationDuration: `${duracion}s`,
              animationDelay: `${retraso}s`,
              // @ts-expect-error variable CSS propia, leída solo por el keyframe
              "--brasa-deriva": `${deriva}px`,
            }}
          />
        );
      })}
    </div>
  );
}

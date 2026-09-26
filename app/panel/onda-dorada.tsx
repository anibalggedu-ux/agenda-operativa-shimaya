"use client";

import { useEffect } from "react";

// 7 · Onda dorada: al tocar cualquier botón o enlace del panel aparece una
// onda dorada suave desde el dedo. Escucha a nivel de documento y dibuja la
// onda en una capa fija (clase .onda-dorada en globals.css), sin meter nada
// dentro de los botones, así no cambia el diseño de ninguno.
export default function OndaDorada() {
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    function alTocar(e: PointerEvent) {
      const objetivo = (e.target as HTMLElement | null)?.closest?.(
        "button, a, [role='button'], [role='tab'], [role='switch']"
      );
      if (!objetivo || (objetivo as HTMLButtonElement).disabled) return;
      const onda = document.createElement("span");
      onda.className = "onda-dorada";
      onda.style.left = `${e.clientX}px`;
      onda.style.top = `${e.clientY}px`;
      document.body.appendChild(onda);
      window.setTimeout(() => onda.remove(), 650);
    }

    document.addEventListener("pointerdown", alTocar, { passive: true });
    return () => document.removeEventListener("pointerdown", alTocar);
  }, []);

  return null;
}

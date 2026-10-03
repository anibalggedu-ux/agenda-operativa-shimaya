"use client";

import { useEffect, useState } from "react";

// Cuenta hacia arriba desde 0 (o desde el valor anterior) hasta `valor` en
// menos de 1s, con una curva que frena al final -- el mismo truco que ya
// usa el contador de puntos del perfil (ver mi-perfil.tsx), reutilizable en
// cualquier KPI numérico del resto de la app.
export function ContadorNumero({ valor, duracionMs = 800 }: { valor: number; duracionMs?: number }) {
  const [mostrado, setMostrado] = useState(valor);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || valor === 0) {
      setMostrado(valor);
      return;
    }
    let cuadro = 0;
    const inicio = performance.now();
    const paso = (t: number) => {
      const p = Math.min(1, (t - inicio) / duracionMs);
      setMostrado(Math.round(valor * (1 - Math.pow(1 - p, 3))));
      if (p < 1) cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);
  return <>{mostrado.toLocaleString("es-PE")}</>;
}

// Igual, pero para un porcentaje de puntaje (checklist/auditoría): el color
// pasa de rojo a ámbar a verde según dónde va quedando el conteo, no según
// el valor final -- así se ve "llegar" al color, no aparecer ya pintado.
export function colorPuntajeEnCurso(n: number): string {
  if (n < 50) return "rgb(var(--marca-rojoclaro))";
  if (n < 80) return "#f59e0b";
  return "#34d399";
}

export function ContadorPorcentaje({ valor, duracionMs = 900 }: { valor: number; duracionMs?: number }) {
  const [mostrado, setMostrado] = useState(valor);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setMostrado(valor);
      return;
    }
    let cuadro = 0;
    const inicio = performance.now();
    const paso = (t: number) => {
      const p = Math.min(1, (t - inicio) / duracionMs);
      setMostrado(Math.round(valor * (1 - Math.pow(1 - p, 3))));
      if (p < 1) cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);
  return <span style={{ color: colorPuntajeEnCurso(mostrado) }}>{mostrado}%</span>;
}

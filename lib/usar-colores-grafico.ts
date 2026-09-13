"use client";

import { useEffect, useState } from "react";

// Recharts no puede tomar colores de clases Tailwind (marca-tenue, etc.) —
// sus props de SVG necesitan un valor de color real. Estos son los mismos
// valores neutros que app/globals.css define para cada tema, copiados aquí
// porque no hay forma de leer una variable CSS directamente como prop de
// Recharts sin que quede atada al tema con el que se montó el componente.
export type ColoresGrafico = { eje: string; grilla: string; superficie: string };

const COLORES: Record<"dark" | "light", ColoresGrafico> = {
  dark: { eje: "#8b8d92", grilla: "#2a2c31", superficie: "#18191d" },
  light: { eje: "#6b6862", grilla: "#d9d6cf", superficie: "#ffffff" },
};

// theme-toggle.tsx cambia el atributo data-theme en <html> directamente (sin
// pasar por estado de React ni contexto), así que un MutationObserver es la
// única forma de que un gráfico ya montado se entere si el usuario cambia de
// tema mientras lo está mirando.
export function useColoresGrafico(): ColoresGrafico {
  const [tema, setTema] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const raiz = document.documentElement;
    const leer = () => setTema(raiz.getAttribute("data-theme") === "light" ? "light" : "dark");
    leer();
    const observer = new MutationObserver(leer);
    observer.observe(raiz, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return COLORES[tema];
}

"use client";

import { useEffect, useState } from "react";

// Telón dorado de bienvenida: se abre una sola vez al día, la primera vez
// que la persona entra al panel. Guarda la fecha (hora de Perú) en este
// celular para no repetirlo en cada recarga del mismo día.
const CLAVE = "shimaya_telon_ultimo";

function fechaHoyPeru(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

export default function TelonBienvenida({ nombre }: { nombre: string }) {
  const [mostrar, setMostrar] = useState(false);

  useEffect(() => {
    const reducirMovimiento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let ultimo: string | null = null;
    try {
      ultimo = window.localStorage.getItem(CLAVE);
    } catch {
      // Sin almacenamiento: se muestra igual, pero no queda guardado.
    }
    const hoy = fechaHoyPeru();
    if (ultimo === hoy || reducirMovimiento) return;

    try {
      window.localStorage.setItem(CLAVE, hoy);
    } catch {}
    setMostrar(true);
    const cerrar = window.setTimeout(() => setMostrar(false), 1500);
    return () => window.clearTimeout(cerrar);
  }, []);

  if (!mostrar) return null;

  const primerNombre = nombre.split(" ")[0];

  return (
    <div className="fixed inset-0 z-[100] flex pointer-events-none" aria-hidden>
      <div className="telon-panel-izq flex-1 bg-marca-fondo" />
      <div className="telon-panel-der flex-1 bg-marca-fondo" />
      <div className="absolute inset-0 flex items-center justify-center telon-texto">
        <p className="font-display text-2xl sm:text-3xl text-oro tracking-wide">
          Bienvenido, <span className="italic">{primerNombre}</span>
        </p>
      </div>
    </div>
  );
}

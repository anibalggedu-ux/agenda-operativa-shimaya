"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

// Red de seguridad para cualquier error que explote al renderizar una
// pantalla (antes no existía ninguna -- cualquier excepción, sin señal o
// no, tiraba toda la app a la pantalla negra genérica de Next.js
// ("Application error"), sin forma de volver salvo recargar). Se notó de
// forma puntual probando la Fase 3 de offline (PR #157): entrar a una
// sección del menú que nunca se guardó en caché, sin conexión, hace que la
// petición de datos de React Server Components truene -- ahora, en vez de
// la pantalla negra, se ve esto, con un botón para reintentar y otro para
// volver a Inicio.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-marca-fondo">
      <div className="max-w-sm w-full bg-marca-superficie border border-marca-borde rounded-[3px] p-6 text-center space-y-4">
        <AlertTriangle className="w-8 h-8 mx-auto text-marca-rojoclaro" />
        <h1 className="text-marca-textofuerte font-black text-sm uppercase tracking-widest">Algo no cargó bien</h1>
        <p className="text-marca-tenue text-sm">
          Puede ser que estés sin señal y esta pantalla todavía no se haya guardado en tu celular. Probá de nuevo, o
          volvé a Inicio.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => reset()}
            className="flex-1 bg-marca-rojo hover:bg-marca-rojoclaro text-marca-textofuerte font-black py-2.5 rounded-[3px] text-xs uppercase tracking-widest transition"
          >
            Reintentar
          </button>
          <a
            href="/"
            className="flex-1 flex items-center justify-center border border-marca-borde text-marca-tenue hover:text-marca-texto font-black py-2.5 rounded-[3px] text-xs uppercase tracking-widest transition"
          >
            Ir a Inicio
          </a>
        </div>
      </div>
    </div>
  );
}

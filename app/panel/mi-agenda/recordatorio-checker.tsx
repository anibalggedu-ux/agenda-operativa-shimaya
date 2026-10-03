"use client";

import { useEffect, useRef } from "react";
import { obtenerConteoRecordatoriosVencidos } from "./actions";
import { reproducirSonidoRecordatorio } from "@/lib/sonido";

// Avisa con sonido (y vibración, si el sonido ya la dispara) apenas se abre
// o se vuelve a la app, si hay algo en Mi Agenda con el recordatorio ya
// vencido -- lo más cercano a una "alarma" que puede dar una app web, que no
// puede sonar con la pantalla apagada o la app cerrada del todo (ver
// app/panel/mi-agenda/mi-agenda.tsx). No repite el aviso antes de 5 minutos,
// para no sonar de nuevo cada vez que alguien cambia de pestaña dentro de la
// misma visita.
const ESPERA_ENTRE_AVISOS_MS = 5 * 60 * 1000;

export default function RecordatorioChecker() {
  const ultimoAvisoRef = useRef(0);

  useEffect(() => {
    function revisar() {
      if (document.visibilityState !== "visible") return;
      const ahora = Date.now();
      if (ahora - ultimoAvisoRef.current < ESPERA_ENTRE_AVISOS_MS) return;
      obtenerConteoRecordatoriosVencidos()
        .then((n) => {
          if (n > 0) {
            ultimoAvisoRef.current = ahora;
            reproducirSonidoRecordatorio();
          }
        })
        .catch(() => {});
    }

    revisar();
    document.addEventListener("visibilitychange", revisar);
    return () => document.removeEventListener("visibilitychange", revisar);
  }, []);

  return null;
}

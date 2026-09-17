"use client";

import { useState, type ReactNode } from "react";
import { BedDouble, FileText, TreePalm, ClipboardList } from "lucide-react";
import MiDescanso from "./mi-descanso";
import MiPermiso from "./mi-permiso";

type Pestana = "descanso" | "permiso" | "vacaciones";

const PESTANAS: { id: Pestana; icono: ReactNode; etiqueta: string }[] = [
  { id: "descanso", icono: <BedDouble className="w-3 h-3" />, etiqueta: "Descanso" },
  { id: "permiso", icono: <FileText className="w-3 h-3" />, etiqueta: "Permiso" },
  { id: "vacaciones", icono: <TreePalm className="w-3 h-3" />, etiqueta: "Vacaciones" },
];

// Une las 3 solicitudes que antes eran tarjetas separadas (descanso semanal,
// permiso anticipado, vacaciones planificadas) en una sola, con pestañas —
// cada una sigue teniendo su propio flujo de aprobación independiente, esto
// solo cambia cómo se presentan. El punto rojo en una pestaña avisa que hay
// una solicitud de ESE tipo pendiente, aunque no esté activa en este momento.
export default function MisSolicitudes() {
  const [pestana, setPestana] = useState<Pestana>("descanso");
  const [pendientes, setPendientes] = useState<Record<Pestana, boolean>>({
    descanso: false,
    permiso: false,
    vacaciones: false,
  });

  function marcarPendiente(tab: Pestana) {
    return (hayPendiente: boolean) => setPendientes((prev) => ({ ...prev, [tab]: hayPendiente }));
  }

  return (
    <div className="bg-marca-superficie border border-marca-rojo/25 rounded-[3px] p-5 space-y-4">
      <h3 className="flex items-center gap-1.5 text-xs font-black tracking-widest text-marca-tenue">
        <ClipboardList className="w-3.5 h-3.5 text-marca-rojoclaro" /> MIS SOLICITUDES
      </h3>

      <div className="flex gap-2 flex-wrap">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPestana(p.id)}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] text-[11px] font-black tracking-widest uppercase transition ${
              pestana === p.id
                ? "bg-marca-rojo text-marca-textofuerte"
                : "bg-marca-superficie2 border border-marca-borde text-marca-tenue hover:border-marca-rojo/40"
            }`}
          >
            {p.icono} {p.etiqueta}
            {pendientes[p.id] && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full border border-marca-superficie" />
            )}
          </button>
        ))}
      </div>

      {/* Las 3 quedan montadas a la vez (solo se oculta la que no está
          activa) para no perder su estado de "pendiente" cada vez que se
          cambia de pestaña — así el puntito se mantiene correcto sin volver
          a pedir los datos al servidor cada clic. */}
      <div className={pestana === "descanso" ? "" : "hidden"}>
        <MiDescanso onEstadoPendiente={marcarPendiente("descanso")} />
      </div>
      <div className={pestana === "permiso" ? "" : "hidden"}>
        <MiPermiso onEstadoPendiente={marcarPendiente("permiso")} />
      </div>
      <div className={pestana === "vacaciones" ? "" : "hidden"}>
        <MiPermiso tipo="Vacaciones" onEstadoPendiente={marcarPendiente("vacaciones")} />
      </div>
    </div>
  );
}

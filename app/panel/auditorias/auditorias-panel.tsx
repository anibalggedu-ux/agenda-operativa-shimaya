"use client";

import { useState } from "react";
import AuditoriaForm from "./auditoria-form";
import HistorialAuditorias from "./historial-auditorias";

export default function AuditoriasPanel({
  esAdmin,
  puedeAuditar,
}: {
  esAdmin: boolean;
  puedeAuditar: boolean;
}) {
  const [tab, setTab] = useState<"nueva" | "historial">("nueva");

  if (esAdmin) {
    return (
      <div>
        <h2 className="text-xs font-black tracking-widest text-marca-tenue mb-4">
          HISTORIAL DE AUDITORÍAS
        </h2>
        <HistorialAuditorias modo="todas" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab("nueva")}
          className={`px-4 py-2 rounded-[3px] text-xs font-black tracking-widest uppercase transition ${
            tab === "nueva"
              ? "bg-marca-rojo text-marca-textofuerte"
              : "bg-marca-superficie2 border border-marca-borde text-marca-tenue hover:border-marca-rojo/40"
          }`}
        >
          Nueva Auditoría
        </button>
        <button
          onClick={() => setTab("historial")}
          className={`px-4 py-2 rounded-[3px] text-xs font-black tracking-widest uppercase transition ${
            tab === "historial"
              ? "bg-marca-rojo text-marca-textofuerte"
              : "bg-marca-superficie2 border border-marca-borde text-marca-tenue hover:border-marca-rojo/40"
          }`}
        >
          Mis Auditorías
        </button>
      </div>

      {tab === "nueva" ? (
        <AuditoriaForm onGuardado={() => setTab("historial")} />
      ) : (
        <HistorialAuditorias modo="propias" />
      )}
    </div>
  );
}

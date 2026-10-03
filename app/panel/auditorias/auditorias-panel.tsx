"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import AuditoriaForm from "./auditoria-form";
import HistorialAuditorias from "./historial-auditorias";

export default function AuditoriasPanel({
  esAdmin,
  puedeAuditar,
}: {
  esAdmin: boolean;
  puedeAuditar: boolean;
}) {
  // Si se llega desde el link del correo de resultado de auditoría
  // (?auditoriaId=...), hay que abrir directo en "Mis Auditorías" — si no,
  // el historial ni se monta y el link no tendría nada que abrir.
  const parametros = useSearchParams();
  const tieneAuditoriaId = !!parametros.get("auditoriaId");
  const [tab, setTab] = useState<"nueva" | "historial">(tieneAuditoriaId ? "historial" : "nueva");

  // Coordinador y Gerente siempre pueden auditar -- antes solo veían el
  // historial de todos, sin forma de crear una auditoría propia.
  return (
    <div>
      <div className="flex gap-2 mb-6">
        {puedeAuditar && (
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
        )}
        <button
          onClick={() => setTab("historial")}
          className={`px-4 py-2 rounded-[3px] text-xs font-black tracking-widest uppercase transition ${
            tab === "historial"
              ? "bg-marca-rojo text-marca-textofuerte"
              : "bg-marca-superficie2 border border-marca-borde text-marca-tenue hover:border-marca-rojo/40"
          }`}
        >
          {esAdmin ? "Historial de Auditorías" : "Mis Auditorías"}
        </button>
      </div>

      {tab === "nueva" && puedeAuditar ? (
        <AuditoriaForm onGuardado={() => setTab("historial")} />
      ) : (
        <HistorialAuditorias modo={esAdmin ? "todas" : "propias"} />
      )}
    </div>
  );
}

import { CalendarDays, ExternalLink } from "lucide-react";

// Acceso a "Horarios de las tiendas" (app de Coordinación de Apoyos, solo lectura). Vive en Central Analítica.
// Solo se muestra a supervisor, coordinador y gerente (la página que lo usa pasa `mostrarApoyos`);
// la ruta /api/apoyos/acceso además lo vuelve a comprobar en el servidor.
export default function BotonApoyos() {
  return (
    <a
      href="/api/apoyos/acceso"
      target="_blank"
      rel="noopener"
      className="flex items-center gap-3 bg-marca-superficie border border-marca-borde border-l-2 border-l-marca-oro/70 rounded-[3px] px-4 py-3 hover:bg-marca-superficie2 transition"
    >
      <span className="shrink-0 text-marca-rojoclaro">
        <CalendarDays className="w-5 h-5" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-marca-textofuerte text-sm font-bold">Horarios de las tiendas</span>
        <span className="block text-marca-tenue text-[11px]">Horarios, menú y dashboard de apoyos de todas las tiendas · solo lectura</span>
      </span>
      <ExternalLink className="w-4 h-4 text-marca-tenue shrink-0" />
    </a>
  );
}

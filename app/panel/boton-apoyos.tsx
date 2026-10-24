import { CalendarDays, ExternalLink } from "lucide-react";

// Acceso único a la app de Coordinación de Apoyos: horarios, dashboard y Estatus de tienda (dotación de personal). Vive en Central Analítica.
// Quién puede editar lo decide Apoyos por el id de usuario de Agenda (`sub` del enlace firmado): el moderador entra con acceso completo; el resto, en solo lectura.
// Solo se muestra a supervisor, coordinador y gerente (la página que lo usa pasa `mostrarApoyos`);
// la ruta /api/apoyos/acceso además lo vuelve a comprobar en el servidor.
export default function BotonApoyos() {
  return (
    <a
      href="/api/apoyos/acceso"
      target="_blank"
      rel="noopener"
      className="flex items-center gap-3 bg-marca-superficie border border-marca-borde rounded-[3px] px-4 py-3 hover:bg-marca-superficie2 transition"
    >
      <span className="shrink-0 text-marca-rojoclaro">
        <CalendarDays className="w-5 h-5" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-marca-textofuerte text-sm font-bold">Apoyos y estatus de tienda</span>
        <span className="block text-marca-tenue text-[11px]">Horarios, dashboard, personal activo, vacantes y requerimientos de todas las tiendas</span>
      </span>
      <ExternalLink className="w-4 h-4 text-marca-tenue shrink-0" />
    </a>
  );
}

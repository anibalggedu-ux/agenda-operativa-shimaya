import { Users, ExternalLink } from "lucide-react";

// Acceso a "Estatus de tienda" (módulo de dotación de la app de Coordinación de Apoyos): plantilla ideal frente al personal activo,
// vacantes, requerimientos de reclutamiento y personal de cada tienda. Vive en Central Analítica, junto al botón de Horarios.
// Solo se muestra a supervisor, coordinador y gerente (la página que lo usa pasa `mostrarApoyos`); la ruta /api/apoyos/acceso lo vuelve a
// comprobar en el servidor. Entran en solo lectura: quién puede editar lo decide la app de Apoyos, no este botón.
export default function BotonEstatusTienda() {
  return (
    <a
      href="/api/apoyos/acceso?ir=estatus"
      target="_blank"
      rel="noopener"
      className="flex items-center gap-3 bg-marca-superficie border border-marca-borde rounded-[3px] px-4 py-3 hover:bg-marca-superficie2 transition"
    >
      <span className="shrink-0 text-marca-rojoclaro">
        <Users className="w-5 h-5" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-marca-textofuerte text-sm font-bold">Estatus de tienda</span>
        <span className="block text-marca-tenue text-[11px]">Personal activo, vacantes y requerimientos de todas las tiendas · solo lectura</span>
      </span>
      <ExternalLink className="w-4 h-4 text-marca-tenue shrink-0" />
    </a>
  );
}

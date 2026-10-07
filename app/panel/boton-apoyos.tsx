import { CalendarDays } from "lucide-react";

// Atajo a "Horarios de las tiendas" (app de Coordinación de Apoyos, solo lectura).
// Solo se muestra a supervisor, coordinador y gerente; la ruta además lo vuelve a comprobar en el servidor.
export default function BotonApoyos() {
  return (
    <a
      href="/api/apoyos/acceso"
      target="_blank"
      rel="noopener"
      className="bg-marca-superficie2 border border-marca-borde text-marca-tenue w-9 h-9 rounded-[3px] hover:text-marca-texto transition shrink-0 flex items-center justify-center"
      aria-label="Horarios de las tiendas"
      title="Horarios de las tiendas (solo lectura)"
    >
      <CalendarDays className="w-4 h-4" />
    </a>
  );
}

import { BookOpen, ExternalLink } from "lucide-react";

// Acceso al "Libro de reclamaciones" (app aparte de reclamos y quejas de clientes). Vive en Central Analítica.
// Solo se muestra a supervisor, coordinador y gerente (la página que lo usa pasa `mostrarLibro`);
// la ruta /api/libro/acceso además lo vuelve a comprobar en el servidor.
export default function BotonLibro() {
  return (
    <a
      href="/api/libro/acceso"
      target="_blank"
      rel="noopener"
      className="flex items-center gap-3 bg-marca-superficie border border-marca-borde border-l-2 border-l-marca-oro/70 rounded-[3px] px-4 py-3 hover:bg-marca-superficie2 transition"
    >
      <span className="shrink-0 text-marca-rojoclaro">
        <BookOpen className="w-5 h-5" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-marca-textofuerte text-sm font-bold">Libro de reclamaciones</span>
        <span className="block text-marca-tenue text-[11px]">Registra y consulta reclamos y quejas de clientes · entras con tu correo</span>
      </span>
      <ExternalLink className="w-4 h-4 text-marca-tenue shrink-0" />
    </a>
  );
}

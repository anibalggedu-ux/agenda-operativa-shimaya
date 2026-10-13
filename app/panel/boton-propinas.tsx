import { HandCoins, ExternalLink } from "lucide-react";

// Acceso al "Sistema de propinas" (app de otro equipo). Vive en Central
// Analítica, visible para todos los roles que entran a esa pestaña.
export default function BotonPropinas() {
  return (
    <a
      href="/api/propinas/acceso"
      target="_blank"
      rel="noopener"
      className="flex items-center gap-3 bg-marca-superficie border border-marca-borde rounded-[3px] px-4 py-3 hover:bg-marca-superficie2 transition"
    >
      <span className="shrink-0 text-marca-rojoclaro">
        <HandCoins className="w-5 h-5" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-marca-textofuerte text-sm font-bold">Sistema de propinas</span>
        <span className="block text-marca-tenue text-[11px]">Abre el panel de propinas en una pestaña nueva</span>
      </span>
      <ExternalLink className="w-4 h-4 text-marca-tenue shrink-0" />
    </a>
  );
}

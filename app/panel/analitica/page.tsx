import { obtenerSesion } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import CentralAnalitica from "./central-analitica";

export const dynamic = "force-dynamic";

export default async function PanelAnalitica() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  return (
    <main className="min-h-screen bg-marca-fondo text-marca-texto p-6 sm:p-8 font-body">
      <div className="flex justify-between items-center border-b border-marca-rojo/25 pb-4 mb-6">
        <h1 className="font-display text-xl sm:text-2xl text-marca-textofuerte tracking-wide">
          Central <span className="text-marca-rojoclaro italic">Analítica</span>
        </h1>
        <Link
          href={`/panel/${sesion.rol}`}
          className="bg-marca-superficie2 border border-marca-borde text-marca-tenue px-4 py-2 rounded-[3px] text-xs font-semibold hover:text-marca-texto transition"
        >
          ← Volver a mi panel
        </Link>
      </div>

      <p className="text-marca-tenue text-sm mb-6">
        Sesión activa: <span className="text-marca-textofuerte font-semibold">{sesion.nombre}</span>
      </p>

      <CentralAnalitica />
    </main>
  );
}

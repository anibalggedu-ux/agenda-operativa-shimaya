import { obtenerSesion } from "@/lib/session";
import { cerrarSesionAction } from "../logout-action";
import { redirect } from "next/navigation";
import Link from "next/link";
import PanelTabs from "./panel-tabs";

export const dynamic = "force-dynamic";

export default async function PanelCoordinador() {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol !== "coordinador") redirect("/login");

  return (
    <main className="min-h-screen bg-[#07080c] text-white p-6 sm:p-8 font-mono">
      <div className="flex justify-between items-center border-b border-red-500/30 pb-4 mb-6">
        <h1 className="text-xl sm:text-2xl font-black tracking-widest">
          <span className="text-red-500">CENTRAL</span> COORDINACIÓN
        </h1>
        <div className="flex gap-2">
          <Link
            href="/panel/analitica"
            className="bg-purple-950/40 border border-purple-500/40 text-purple-300 px-4 py-2 rounded-lg text-xs font-bold hover:bg-purple-950/70 transition"
          >
            📊 Central Analítica
          </Link>
          <form action={cerrarSesionAction}>
            <button className="bg-[#181b29] border border-slate-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-[#22273a] transition">
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>
      <p className="text-slate-400 text-sm mb-6">
        Sesión activa: <span className="text-white font-bold">{sesion.nombre}</span>
      </p>

      <PanelTabs nombre={sesion.nombre} />
    </main>
  );
}

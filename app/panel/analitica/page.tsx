import { obtenerSesion } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import CentralAnalitica from "./central-analitica";

export const dynamic = "force-dynamic";

export default async function PanelAnalitica() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  return (
    <main className="min-h-screen bg-[#07080c] text-white p-6 sm:p-8 font-mono">
      <div className="flex justify-between items-center border-b border-purple-500/30 pb-4 mb-6">
        <h1 className="text-xl sm:text-2xl font-black tracking-widest">
          <span className="text-purple-400">CENTRAL</span> ANALÍTICA
        </h1>
        <Link
          href={`/panel/${sesion.rol}`}
          className="bg-[#181b29] border border-slate-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-[#22273a] transition"
        >
          ← Volver a mi panel
        </Link>
      </div>

      <p className="text-slate-400 text-sm mb-6">
        Sesión activa: <span className="text-white font-bold">{sesion.nombre}</span>
      </p>

      <CentralAnalitica />
    </main>
  );
}

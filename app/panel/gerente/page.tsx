import { obtenerSesion } from "@/lib/session";
import { cerrarSesionAction } from "../logout-action";
import { redirect } from "next/navigation";
import Link from "next/link";
import Dashboard from "./dashboard";

export const dynamic = "force-dynamic";

export default async function PanelGerente() {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol !== "gerente") redirect("/login");

  return (
    <main className="min-h-screen bg-[#0f0f12] text-white p-6 sm:p-8 font-mono">
      <div className="flex justify-between items-center border-b border-gray-800 pb-4 mb-6">
        <h1 className="text-xl sm:text-2xl font-black tracking-widest">
          <span className="text-red-600">DASHBOARD</span> GERENCIAL
        </h1>
        <div className="flex gap-2">
          <Link
            href="/panel/analitica"
            className="bg-purple-950/40 border border-purple-500/40 text-purple-300 px-4 py-2 rounded-lg text-xs font-bold hover:bg-purple-950/70 transition"
          >
            📊 Central Analítica
          </Link>
          <form action={cerrarSesionAction}>
            <button className="bg-gray-900 border border-gray-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-gray-800 transition">
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>
      <p className="text-gray-400 text-sm mb-6">
        Sesión activa: <span className="text-white font-bold">{sesion.nombre}</span>
      </p>

      <Dashboard />
    </main>
  );
}

import { obtenerSesion } from "@/lib/session";
import { cerrarSesionAction } from "../logout-action";
import { redirect } from "next/navigation";
import SelectorTiendas from "./selector-tiendas";
import GpsMarcador from "./gps-marcador";
import HistorialPdf from "./historial-pdf";

export const dynamic = "force-dynamic";

export default async function PanelSupervisor() {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol !== "supervisor") redirect("/login");

  return (
    <main className="min-h-screen bg-[#07080c] text-white p-6 sm:p-8 font-mono">
      <div className="flex justify-between items-center border-b border-yellow-500/30 pb-4 mb-6">
        <h1 className="text-xl sm:text-2xl font-black tracking-widest">
          <span className="text-yellow-500">PANEL</span> SUPERVISOR
        </h1>
        <form action={cerrarSesionAction}>
          <button className="bg-[#181b29] border border-slate-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-[#22273a] transition">
            Cerrar sesión
          </button>
        </form>
      </div>

      <p className="text-slate-400 text-sm mb-6">
        Sesión activa: <span className="text-white font-bold">{sesion.nombre}</span>
      </p>

      <div className="mb-6">
        <GpsMarcador />
      </div>

      <h2 className="text-sm font-black tracking-widest text-slate-300 mb-4">
        BITÁCORA DE CAMPO
      </h2>
      <SelectorTiendas supervisorNombre={sesion.nombre} />

      <div className="mt-6">
        <HistorialPdf supervisorNombre={sesion.nombre} />
      </div>
    </main>
  );
}
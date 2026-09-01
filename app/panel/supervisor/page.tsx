import { obtenerSesion } from "@/lib/session";
import { cerrarSesionAction } from "../logout-action";
import { redirect } from "next/navigation";

export default async function PanelSupervisor() {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol !== "supervisor") redirect("/login");

  return (
    <main className="min-h-screen bg-[#07080c] text-white p-8 font-mono">
      <div className="flex justify-between items-center border-b border-yellow-500/30 pb-4 mb-6">
        <h1 className="text-2xl font-black tracking-widest">
          <span className="text-yellow-500">PANEL</span> SUPERVISOR
        </h1>
        <form action={cerrarSesionAction}>
          <button className="bg-[#181b29] border border-slate-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-[#22273a] transition">
            Cerrar sesión
          </button>
        </form>
      </div>
      <p className="text-slate-400 text-sm">
        Sesión activa: <span className="text-white font-bold">{sesion.nombre}</span>
      </p>
      <p className="text-slate-600 text-xs mt-4 italic">
        Base del panel lista — Bitácora de Campo, GPS y Vitrina de Trofeos se
        agregan en las próximas sesiones.
      </p>
    </main>
  );
}

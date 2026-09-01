import { obtenerSesion } from "@/lib/session";
import { cerrarSesionAction } from "../logout-action";
import { redirect } from "next/navigation";

export default async function PanelCoordinador() {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol !== "coordinador") redirect("/login");

  return (
    <main className="min-h-screen bg-[#07080c] text-white p-8 font-mono">
      <div className="flex justify-between items-center border-b border-red-500/30 pb-4 mb-6">
        <h1 className="text-2xl font-black tracking-widest">
          <span className="text-red-500">CENTRAL</span> COORDINACIÓN
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
        Base del panel lista — las funciones de Rutas, Personal, Anuncios y
        Monitoreo GPS se van a ir agregando en las próximas sesiones.
      </p>
    </main>
  );
}

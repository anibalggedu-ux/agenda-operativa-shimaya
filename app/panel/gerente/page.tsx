import { obtenerSesion } from "@/lib/session";
import { cerrarSesionAction } from "../logout-action";
import { redirect } from "next/navigation";

export default async function PanelGerente() {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol !== "gerente") redirect("/login");

  return (
    <main className="min-h-screen bg-[#0f0f12] text-white p-8 font-mono">
      <div className="flex justify-between items-center border-b border-gray-800 pb-4 mb-6">
        <h1 className="text-2xl font-black tracking-widest">
          <span className="text-red-600">DASHBOARD</span> GERENCIAL
        </h1>
        <form action={cerrarSesionAction}>
          <button className="bg-gray-900 border border-gray-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-gray-800 transition">
            Cerrar sesión
          </button>
        </form>
      </div>
      <p className="text-gray-400 text-sm">
        Sesión activa: <span className="text-white font-bold">{sesion.nombre}</span>
      </p>
      <p className="text-gray-600 text-xs mt-4 italic">
        Base del panel lista — KPIs, Ranking y Estado del Personal se agregan
        en las próximas sesiones.
      </p>
    </main>
  );
}

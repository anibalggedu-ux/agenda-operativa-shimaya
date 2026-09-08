import { obtenerSesion } from "@/lib/session";
import { cerrarSesionAction } from "../logout-action";
import { redirect } from "next/navigation";
import Link from "next/link";
import SelectorTiendas from "../supervisor/selector-tiendas";
import GpsMarcador from "../supervisor/gps-marcador";
import HistorialPdf from "../supervisor/historial-pdf";
import MisReportes from "../supervisor/mis-reportes";
import AnunciosWidget from "../anuncios-widget";
import MisPuntosWidget from "../mis-puntos-widget";
import { tieneAccesoRegistro } from "@/lib/permisos";

export const dynamic = "force-dynamic";

export default async function PanelCapacitador() {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol !== "capacitador") redirect("/login");

  const accesoRegistro = await tieneAccesoRegistro(sesion.id, sesion.rol);

  return (
    <main className="min-h-screen bg-[#07080c] text-white p-6 sm:p-8 font-mono">
      <div className="flex justify-between items-center border-b border-blue-500/30 pb-4 mb-6">
        <h1 className="text-xl sm:text-2xl font-black tracking-widest">
          <span className="text-blue-500">PANEL</span> CAPACITADOR
        </h1>
        <div className="flex gap-2">
          {accesoRegistro && (
            <Link
              href="/panel/registro"
              className="bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-950/70 transition"
            >
              📝 Registro
            </Link>
          )}
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

      <div className="mb-6">
        <MisPuntosWidget />
      </div>

      <div className="mb-6">
        <AnunciosWidget />
      </div>

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

      <div className="mt-6">
        <MisReportes />
      </div>
    </main>
  );
}

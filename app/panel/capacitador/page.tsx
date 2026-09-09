import { obtenerSesion } from "@/lib/session";
import { cerrarSesionAction } from "../logout-action";
import { redirect } from "next/navigation";
import SelectorTiendas from "../supervisor/selector-tiendas";
import GpsMarcador from "../supervisor/gps-marcador";
import HistorialPdf from "../supervisor/historial-pdf";
import MisReportes from "../supervisor/mis-reportes";
import AnunciosWidget from "../anuncios-widget";
import MisPuntosWidget from "../mis-puntos-widget";
import PerfilBanner from "../supervisor/perfil-banner";
import MiDescanso from "../supervisor/mi-descanso";
import MisMarcaciones from "../supervisor/mis-marcaciones";
import RankingCapacitadores from "./ranking-capacitadores";

export const dynamic = "force-dynamic";

export default async function PanelCapacitador() {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol !== "capacitador") redirect("/login");

  return (
    <main className="min-h-screen bg-marca-fondo text-marca-texto p-6 sm:p-8 font-body">
      <div className="flex justify-between items-center border-b border-marca-rojo/25 pb-4 mb-6">
        <h1 className="font-display text-xl sm:text-2xl text-marca-textofuerte tracking-wide">
          Panel <span className="text-marca-rojoclaro italic">Capacitador</span>
        </h1>
        <div className="flex gap-2">
          <form action={cerrarSesionAction}>
            <button className="bg-marca-superficie2 border border-marca-borde text-marca-tenue px-4 py-2 rounded-[3px] text-xs font-semibold hover:text-marca-texto transition">
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>

      <p className="text-marca-tenue text-sm mb-6">
        Sesión activa: <span className="text-marca-textofuerte font-semibold">{sesion.nombre}</span>
      </p>

      <PerfilBanner />

      <div className="mb-6">
        <MiDescanso />
      </div>

      <div className="mb-6">
        <MisPuntosWidget />
      </div>

      <div className="mb-6">
        <RankingCapacitadores />
      </div>

      <div className="mb-6">
        <AnunciosWidget />
      </div>

      <div className="mb-6">
        <GpsMarcador />
      </div>

      <div className="mb-6">
        <MisMarcaciones />
      </div>

      <h2 className="text-sm font-black tracking-widest text-marca-tenue mb-4">
        BITÁCORA DE CAMPO
      </h2>
      <SelectorTiendas supervisorNombre={sesion.nombre} mostrarDescansoFijo={false} />

      <div className="mt-6">
        <HistorialPdf supervisorNombre={sesion.nombre} />
      </div>

      <div className="mt-6">
        <MisReportes />
      </div>
    </main>
  );
}

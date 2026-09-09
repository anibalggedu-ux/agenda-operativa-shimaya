import { obtenerSesion } from "@/lib/session";
import { cerrarSesionAction } from "../logout-action";
import { redirect } from "next/navigation";
import Link from "next/link";
import SelectorTiendas from "./selector-tiendas";
import GpsMarcador from "./gps-marcador";
import HistorialPdf from "./historial-pdf";
import MisReportes from "./mis-reportes";
import AnunciosWidget from "../anuncios-widget";
import MisPuntosWidget from "../mis-puntos-widget";
import { tieneAccesoRegistro } from "@/lib/permisos";
import PerfilBanner from "./perfil-banner";
import TiendasFijas from "./tiendas-fijas";
import MiDescanso from "./mi-descanso";
import MisMarcaciones from "./mis-marcaciones";

export const dynamic = "force-dynamic";

export default async function PanelSupervisor() {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol !== "supervisor") redirect("/login");

  const accesoRegistro = await tieneAccesoRegistro(sesion.id, sesion.rol);

  return (
    <main className="min-h-screen bg-marca-fondo text-marca-texto p-6 sm:p-8 font-body">
      <div className="flex justify-between items-center border-b border-marca-rojo/25 pb-4 mb-6">
        <h1 className="font-display text-xl sm:text-2xl text-marca-textofuerte tracking-wide">
          Panel <span className="text-marca-rojoclaro italic">Supervisor</span>
        </h1>
        <div className="flex gap-2">
          {accesoRegistro && (
            <Link
              href="/panel/registro"
              className="border border-marca-rojo/40 text-marca-rojoclaro px-4 py-2 rounded-[3px] text-xs font-semibold hover:bg-marca-rojo/10 transition"
            >
              📝 Registro
            </Link>
          )}
          <Link
            href="/panel/analitica"
            className="border border-marca-rojo/40 text-marca-rojoclaro px-4 py-2 rounded-[3px] text-xs font-semibold hover:bg-marca-rojo/10 transition"
          >
            📊 Central Analítica
          </Link>
          <Link
            href="/panel/documentos"
            className="border border-marca-rojo/40 text-marca-rojoclaro px-4 py-2 rounded-[3px] text-xs font-semibold hover:bg-marca-rojo/10 transition"
          >
            📄 Documentos
          </Link>
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
        <AnunciosWidget />
      </div>

      <div className="mb-6">
        <GpsMarcador />
      </div>

      <div className="mb-6">
        <MisMarcaciones />
      </div>

      <div className="mb-6">
        <TiendasFijas />
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

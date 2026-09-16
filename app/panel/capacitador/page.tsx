import { obtenerSesion } from "@/lib/session";
import { redirect } from "next/navigation";
import SelectorTiendas from "../supervisor/selector-tiendas";
import HistorialPdf from "../supervisor/historial-pdf";
import MisReportes from "../supervisor/mis-reportes";
import AnunciosWidget from "../anuncios-widget";
import MisPuntosWidget from "../mis-puntos-widget";
import PerfilBanner from "../perfil-banner";
import { obtenerMiPerfil } from "../supervisor/actions";
import MisSolicitudes from "../supervisor/mis-solicitudes";
import MisMarcaciones from "../supervisor/mis-marcaciones";
import ChecklistVisita from "../checklist-visita";
import RankingCapacitadores from "./ranking-capacitadores";
import KilometrosDelMes from "../analitica/kilometros-del-mes";
import ResumenDelDia from "../resumen-del-dia";
import PanelShell, { type ItemMenuPanel } from "../panel-shell";
import { LazyCalendario as Calendario } from "../panel-lazy";
import { hoyPeru } from "@/lib/fechas";

export const dynamic = "force-dynamic";

export default async function PanelCapacitador() {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol !== "capacitador") redirect("/login");

  const items: ItemMenuPanel[] = [
    {
      id: "inicio",
      etiqueta: "Inicio",
      icono: "🏠",
      contenido: (
        <div className="space-y-6">
          <PerfilBanner cargarPerfil={obtenerMiPerfil} />
          <MisSolicitudes />
          <MisPuntosWidget />
          <RankingCapacitadores />
          <div className="bg-marca-superficie border border-marca-rojo/25 rounded-[3px] p-5 space-y-3">
            <h3 className="text-xs font-black tracking-widest text-marca-tenue">
              🚗 KILÓMETROS DEL MES — CAPACITADORES
            </h3>
            <p className="text-marca-tenue text-[11px]">
              Quién recorrió más distancia este mes, solo entre capacitadores.
            </p>
            <KilometrosDelMes soloRol="capacitador" limite={0} />
          </div>
          <AnunciosWidget />
        </div>
      ),
    },
    {
      id: "bitacora",
      etiqueta: "Bitácora de Campo",
      icono: "📍",
      contenido: (
        <div className="space-y-6">
          <SelectorTiendas supervisorNombre={sesion.nombre} mostrarDescansoFijo={false} />
          <MisMarcaciones />
          <ChecklistVisita nombreUsuario={sesion.nombre} rol={sesion.rol} />
        </div>
      ),
    },
    {
      id: "reportes",
      etiqueta: "Mis Reportes",
      icono: "📝",
      contenido: (
        <div className="space-y-6">
          <MisReportes />
          <HistorialPdf supervisorNombre={sesion.nombre} />
        </div>
      ),
    },
    {
      id: "calendario",
      etiqueta: "Calendario",
      icono: "📅",
      contenido: <Calendario modo="propio" hoy={hoyPeru()} />,
    },
  ];

  return (
    <PanelShell
      nombre={sesion.nombre}
      tituloPortal="Capacitador"
      items={items}
      defaultId="inicio"
      encabezado={
        <>
          <h1 className="font-display text-xl sm:text-2xl text-marca-textofuerte tracking-wide mb-4">
            Panel <span className="text-marca-rojoclaro italic">Capacitador</span>
          </h1>
          <ResumenDelDia nombre={sesion.nombre} rol={sesion.rol} />
        </>
      }
    />
  );
}

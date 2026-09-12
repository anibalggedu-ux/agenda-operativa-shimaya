import { obtenerSesion } from "@/lib/session";
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
          <PerfilBanner />
          <MiDescanso />
          <MisPuntosWidget />
          <RankingCapacitadores />
          <AnunciosWidget />
        </div>
      ),
    },
    {
      id: "asistencia",
      etiqueta: "Asistencia",
      icono: "⏱",
      contenido: (
        <div className="space-y-6">
          <GpsMarcador />
          <MisMarcaciones />
        </div>
      ),
    },
    {
      id: "bitacora",
      etiqueta: "Bitácora de Campo",
      icono: "📍",
      contenido: <SelectorTiendas supervisorNombre={sesion.nombre} mostrarDescansoFijo={false} />,
    },
    {
      id: "reportes",
      etiqueta: "Mis Reportes",
      icono: "📝",
      contenido: <MisReportes />,
    },
    {
      id: "historial-pdf",
      etiqueta: "Historial PDF",
      icono: "🧾",
      contenido: <HistorialPdf supervisorNombre={sesion.nombre} />,
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

"use client";

import GpsMarcador from "../supervisor/gps-marcador";
import SelectorTiendas from "../supervisor/selector-tiendas";
import HistorialPdf from "../supervisor/historial-pdf";
import PerfilBanner from "./perfil-banner";
import AsignarRutas from "./asignar-rutas";
import AsignacionesEspeciales from "./asignaciones-especiales";
import TiendasPermanentes from "./tiendas-permanentes";
import DescansosSemanales from "./descansos-semanales";
import EstadoPersonalHoy from "./estado-personal-hoy";
import Anuncios from "./anuncios";
import Reportes from "./reportes";
import HistorialMonitoreo from "./historial-monitoreo";
import MisPuntosWidget from "../mis-puntos-widget";
import {
  LazyRegistro as Registro,
  LazyDocumentos as Documentos,
  LazyCalendario as Calendario,
  LazyHistorialAuditorias as HistorialAuditorias,
  LazyCentralAnalitica as CentralAnalitica,
} from "../panel-lazy";
import CampanitaDescansos from "./campanita-descansos";
import PanelShell, { type ItemMenuPanel } from "../panel-shell";
import { hoyPeru } from "@/lib/fechas";

export default function PanelTabs({ nombre }: { nombre: string }) {
  const items: ItemMenuPanel[] = [
    { id: "rutas", etiqueta: "Rutas", icono: "🚚", contenido: <AsignarRutas /> },
    {
      id: "mi-ruta",
      etiqueta: "Mi Ruta",
      icono: "📍",
      contenido: (
        <div className="space-y-6">
          <MisPuntosWidget />
          <GpsMarcador />
          <SelectorTiendas supervisorNombre={nombre} mostrarDescansoFijo={false} />
          <HistorialPdf supervisorNombre={nombre} />
        </div>
      ),
    },
    { id: "reportes", etiqueta: "Reportes", icono: "📝", contenido: <Reportes /> },
    {
      id: "personal",
      etiqueta: "Personal",
      icono: "👥",
      contenido: (
        <div className="space-y-8">
          <EstadoPersonalHoy />
          <AsignacionesEspeciales />
          <TiendasPermanentes />
          <DescansosSemanales />
        </div>
      ),
    },
    { id: "anuncios", etiqueta: "Anuncios", icono: "📣", contenido: <Anuncios /> },
    { id: "historial", etiqueta: "Historial y Monitoreo", icono: "🗂", contenido: <HistorialMonitoreo /> },
    { id: "analitica", etiqueta: "Central Analítica", icono: "📊", contenido: <CentralAnalitica /> },
    { id: "registro", etiqueta: "Registro", icono: "📝", contenido: <Registro esCoordinador={true} /> },
    { id: "documentos", etiqueta: "Documentos", icono: "📄", contenido: <Documentos esAdmin={true} /> },
    {
      id: "calendario",
      etiqueta: "Calendario",
      icono: "📅",
      contenido: <Calendario modo="completo" hoy={hoyPeru()} />,
    },
    { id: "auditorias", etiqueta: "Auditorías", icono: "🔍", contenido: <HistorialAuditorias modo="todas" /> },
  ];

  return (
    <div className="space-y-4">
      <PerfilBanner />
      <PanelShell
        nombre={nombre}
        tituloPortal="Coordinador"
        items={items}
        defaultId="rutas"
        accionesExtra={<CampanitaDescansos />}
      />
    </div>
  );
}

"use client";

import { Truck, MapPin, Map, ClipboardList, ClipboardCheck, Users, Megaphone, History, BarChart3, Settings, File, Calendar, Search, Sparkles, UserCircle, Coffee, NotebookPen, LifeBuoy, ListChecks, AlertTriangle } from "lucide-react";
import SelectorTiendas from "../supervisor/selector-tiendas";
import HistorialPdf from "../supervisor/historial-pdf";
import MisMarcaciones from "../supervisor/mis-marcaciones";
import PerfilBanner from "../perfil-banner";
import { obtenerPerfilCoordinador } from "./actions";
import AsignarRutas from "./asignar-rutas";
import AsignacionesEspeciales from "./asignaciones-especiales";
import TiendasPermanentes from "./tiendas-permanentes";
import DescansosSemanales from "./descansos-semanales";
import EstadoPersonalHoy from "./estado-personal-hoy";
import Anuncios from "./anuncios";
import EncuestasCoordinador from "./encuestas";
import Reportes from "./reportes";
import HistorialMonitoreo from "./historial-monitoreo";
import MisPuntosWidget from "../mis-puntos-widget";
import BreakWidget from "../break-widget";
import MarcacionesBreakEquipo from "./marcaciones-break-equipo";
import EventosDeHoy from "../eventos-hoy";
import BloqueColapsable from "../bloque-colapsable";
import {
  LazyRegistro as Registro,
  LazyDocumentos as Documentos,
  LazyCalendario as Calendario,
  LazyAuditoriasPanel as AuditoriasPanel,
  LazyCentralAnalitica as CentralAnalitica,
  LazyMapaOperativo as MapaOperativo,
  LazyConsultorioIA as ConsultorioIA,
  LazyHistoriasFeed as HistoriasFeed,
  LazyMiPerfil as MiPerfil,
  LazyMiAgenda as MiAgenda,
  LazyCampanaNotificaciones as CampanaNotificaciones,
  LazySoporte as Soporte,
  LazyChecklistRutina as ChecklistRutina,
  LazyReporteCumplimiento as ReporteCumplimiento,
} from "../panel-lazy";
import CampanitaDescansos from "./campanita-descansos";
import PanelShell, { type ItemMenuPanel } from "../panel-shell";
import ResumenDelDia from "../resumen-del-dia";
import { hoyPeru } from "@/lib/fechas";

export default function PanelTabs({
  id,
  nombre,
  rol,
  notificacionesPendientes,
}: {
  id: string;
  nombre: string;
  rol: string;
  notificacionesPendientes: number;
}) {
  const items: ItemMenuPanel[] = [
    {
      id: "rutas",
      etiqueta: "Rutas",
      icono: <Truck className="w-4 h-4" />,
      contenido: (
        <div className="space-y-8">
          <AsignarRutas />
          <AsignacionesEspeciales />
        </div>
      ),
    },
    {
      id: "mapa",
      etiqueta: "Mapa",
      icono: <Map className="w-4 h-4" />,
      contenido: <MapaOperativo />,
    },
    {
      id: "mi-ruta",
      etiqueta: "Mi Ruta",
      icono: <MapPin className="w-4 h-4" />,
      contenido: (
        <div className="space-y-6">
          <MisPuntosWidget />
          <BreakWidget />
          <BloqueColapsable icono={<Calendar />} titulo="Eventos de hoy">
            <EventosDeHoy />
          </BloqueColapsable>
          <SelectorTiendas supervisorNombre={nombre} mostrarDescansoFijo={false} />
          <MisMarcaciones />
        </div>
      ),
    },
    {
      id: "checklist-rutina",
      etiqueta: "Checklist de Rutina",
      icono: <ListChecks className="w-4 h-4" />,
      contenido: <ChecklistRutina nombreUsuario={nombre} rol={rol} />,
    },
    {
      id: "reportes",
      etiqueta: "Reportes",
      icono: <ClipboardList className="w-4 h-4" />,
      contenido: (
        <div className="space-y-6">
          <Reportes />
          <HistorialPdf supervisorNombre={nombre} />
        </div>
      ),
    },
    {
      id: "no-cumplimiento",
      etiqueta: "Reporte de no cumplimiento",
      icono: <AlertTriangle className="w-4 h-4" />,
      contenido: <ReporteCumplimiento />,
    },
    {
      id: "personal",
      etiqueta: "Personal",
      icono: <Users className="w-4 h-4" />,
      contenido: (
        <div className="space-y-8">
          <EstadoPersonalHoy />
          <TiendasPermanentes />
          <DescansosSemanales />
        </div>
      ),
    },
    { id: "anuncios", etiqueta: "Anuncios", icono: <Megaphone className="w-4 h-4" />, contenido: <Anuncios /> },
    { id: "encuestas", etiqueta: "Encuestas", icono: <ClipboardCheck className="w-4 h-4" />, contenido: <EncuestasCoordinador /> },
    { id: "historial", etiqueta: "Historial y Monitoreo", icono: <History className="w-4 h-4" />, contenido: <HistorialMonitoreo /> },
    { id: "analitica", etiqueta: "Central Analítica", icono: <BarChart3 className="w-4 h-4" />, contenido: <CentralAnalitica mostrarApoyos /> },
    { id: "registro", etiqueta: "Registro", icono: <Settings className="w-4 h-4" />, contenido: <Registro esCoordinador={true} /> },
    { id: "documentos", etiqueta: "Documentos", icono: <File className="w-4 h-4" />, contenido: <Documentos esAdmin={true} /> },
    {
      id: "calendario",
      etiqueta: "Calendario",
      icono: <Calendar className="w-4 h-4" />,
      contenido: <Calendario modo="completo" hoy={hoyPeru()} />,
    },
    { id: "auditorias", etiqueta: "Auditorías", icono: <Search className="w-4 h-4" />, contenido: <AuditoriasPanel esAdmin puedeAuditar /> },
    {
      id: "marcaciones-break",
      etiqueta: "Marcaciones de Break",
      icono: <Coffee className="w-4 h-4" />,
      contenido: <MarcacionesBreakEquipo />,
    },
    { id: "consultorio", etiqueta: "Consultorio IA", icono: <Sparkles className="w-4 h-4" />, contenido: <ConsultorioIA /> },
    { id: "agenda", etiqueta: "Mi Agenda", icono: <NotebookPen className="w-4 h-4" />, contenido: <MiAgenda /> },
    { id: "soporte", etiqueta: "Soporte", icono: <LifeBuoy className="w-4 h-4" />, contenido: <Soporte /> },
    {
      id: "perfil",
      etiqueta: "Mi Perfil",
      icono: <UserCircle className="w-4 h-4" />,
      contenido: <MiPerfil />,
      badge: notificacionesPendientes,
    },
  ];

  return (
    <PanelShell
      nombre={nombre}
      tituloPortal="Coordinador"
      items={items}
      defaultId="rutas"
      accionesExtra={
        <>
          <CampanaNotificaciones />
          <CampanitaDescansos />
        </>
      }
      encabezado={
        <div className="space-y-4 mb-4">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-marca-textofuerte tracking-wide">
            Central <span className="text-marca-rojoclaro italic">Coordinación</span>
          </h1>
          <ResumenDelDia nombre={nombre} rol={rol}>
            <HistoriasFeed miUsuarioId={id} miRol={rol} />
          </ResumenDelDia>
          <PerfilBanner cargarPerfil={obtenerPerfilCoordinador} />
        </div>
      }
      encabezadoGaleria={
        <div className="space-y-4 mb-4">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-marca-textofuerte tracking-wide">
            Central <span className="text-marca-rojoclaro italic">Coordinación</span>
          </h1>
          <ResumenDelDia nombre={nombre} rol={rol} ocultarTarjetas />
        </div>
      }
    />
  );
}
